import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { PaymentTransaction } from '@/entities/payment-transaction.entity';
import { PaymentIntent } from '@/entities/payment-intent.entity';
import { Payout, PayoutStatus } from '@/entities/payout.entity';
import { TSPConfiguration } from '@/entities/tsp-configuration.entity';
import { LoggerService } from '@/common/services/logger.service';
import { TSPProvider } from '@/enums/tsp-provider.enum';
import { SulifuPayAdapter } from '@/tsp/adapters/sulifu-pay.adapter';
import { PaymentTransactionService } from '@/modules/payment-transaction/payment-transaction.service';
import { PaymentStatusGateway } from '@/modules/payment-status/payment-status.gateway';
import { MerchantWebhookService } from '../merchant/merchant-webhook.service';
import { WalletServiceGrpc } from '@/types';
import axios from 'axios';
import {
  SulifuPayDepositNotification,
  SulifuPayPayoutNotification,
  SulifuPayPaymentStatus,
  SulifuPayPayoutStatus,
} from '@/types/sulifu-pay.types';

@Injectable()
export class SulifuPayWebhookHandler {
  constructor(
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepo: Repository<PaymentTransaction>,

    @InjectRepository(PaymentIntent)
    private readonly paymentIntentRepo: Repository<PaymentIntent>,

    @InjectRepository(Payout)
    private readonly payoutRepo: Repository<Payout>,

    @InjectRepository(TSPConfiguration)
    private readonly tspConfigRepo: Repository<TSPConfiguration>,

    private readonly logger: LoggerService,
    private readonly paymentTransactionService: PaymentTransactionService,
    private readonly paymentStatusGateway: PaymentStatusGateway,
    private readonly merchantWebhookService: MerchantWebhookService,
  ) {}

  async processWebhook(
    payload: any,
    walletService: WalletServiceGrpc
  ): Promise<{
    transactionId: string;
    status: string;
    updated: boolean;
  }> {
    try {
      this.logger.log(`Processing Sulifu Pay webhook: ${JSON.stringify(payload)}`);

      const environment = process.env.NODE_ENV === 'production' ? 'production' : 'sandbox';
      const tspConfig = await this.tspConfigRepo.findOne({
        where: {
          providerName: TSPProvider.SULIFU_PAY,
          environment,
          isActive: true,
        },
      });

      if (!tspConfig) {
        throw new Error('Sulifu Pay configuration not found');
      }

      const adapter = new SulifuPayAdapter(tspConfig, this.logger);

      const isDeposit = 'topupAmount' in payload;
      const isPayout = 'orderAmount' in payload && !isDeposit;

      if (isDeposit) {
        return await this.processDepositWebhook(payload as SulifuPayDepositNotification, adapter, walletService);
      } else if (isPayout) {
        return await this.processPayoutWebhook(payload as SulifuPayPayoutNotification, adapter, walletService);
      } else {
        throw new Error('Unknown Sulifu Pay webhook type');
      }
    } catch (error) {
      this.logger.error('Sulifu Pay webhook processing failed:', error);
      throw error;
    }
  }

  private async processDepositWebhook(
    payload: SulifuPayDepositNotification,
    adapter: SulifuPayAdapter,
    walletService: WalletServiceGrpc
  ): Promise<{
    transactionId: string;
    status: string;
    updated: boolean;
  }> {
    try {
      this.logger.log(`Processing Sulifu Pay DEPOSIT webhook: ${payload.tradeNo}, status: ${payload.tradeStatus}`);

      const tradeStatus = Number(payload.tradeStatus) as SulifuPayPaymentStatus;
      const normalizedPayload: SulifuPayDepositNotification = {
        ...payload,
        tradeStatus,
        topupAmount: typeof payload.topupAmount === 'string' ? Number(payload.topupAmount) : payload.topupAmount,
      };

      const isValidSignature = adapter.verifyWebhookSignature(normalizedPayload, normalizedPayload.sign);

      if (!isValidSignature) {
        this.logger.error(`Invalid Sulifu Pay deposit webhook signature for: ${normalizedPayload.tradeNo}`);
        throw new Error('Invalid webhook signature');
      }

      this.logger.log('Sulifu Pay deposit webhook signature verified successfully');

      const transaction = await this.transactionRepo
        .createQueryBuilder('transaction')
        .leftJoinAndSelect('transaction.intent', 'intent')
        .where('transaction.externalTransactionId = :tradeNo', { tradeNo: normalizedPayload.tradeNo })
        .orWhere('transaction.externalTransactionId LIKE :prefix', { prefix: `${normalizedPayload.tradeNo}%` })
        .orderBy('transaction.createdAt', 'DESC')
        .getOne();

      if (!transaction) {
        this.logger.warn(`Sulifu Pay webhook: deposit transaction not found: ${normalizedPayload.tradeNo}`);
        this.logger.warn(`Tried prefix match: ${normalizedPayload.tradeNo}%`);
        return {
          transactionId: normalizedPayload.tradeNo,
          status: 'not_found',
          updated: false,
        };
      }

      this.logger.log(`Deposit transaction found: ${transaction.transactionId}, merchantId: ${transaction.merchantId}`);

      const newStatus = this.mapDepositStatusToTransactionStatus(normalizedPayload.tradeStatus);
      const responseCode = this.mapDepositStatusToResponseCode(normalizedPayload.tradeStatus);

      if (transaction.status === newStatus) {
        this.logger.log(`Sulifu Pay webhook: status unchanged (${newStatus}) for: ${normalizedPayload.tradeNo}`);
        return {
          transactionId: normalizedPayload.tradeNo,
          status: newStatus,
          updated: false,
        };
      }

      const updatedTransaction = await this.paymentTransactionService.updateTransactionStatus(
        transaction.transactionId,
        responseCode,
        normalizedPayload,
        `sulifu_deposit_webhook`
      );

      this.logger.log(`Deposit transaction updated: ${updatedTransaction.transactionId}, status: ${updatedTransaction.status}`);

      const paymentIntent = updatedTransaction.intent || await this.paymentIntentRepo.findOne({
        where: { intentId: updatedTransaction.paymentIntentId }
      });

      if (paymentIntent) {
        if (normalizedPayload.tradeStatus === SulifuPayPaymentStatus.SUCCESS) {
          await this.paymentIntentRepo.update(paymentIntent.id, {
            status: 'succeeded' as any
          });
          this.paymentStatusGateway.emitPaymentSuccess(
            paymentIntent.intentId,
            updatedTransaction.transactionId
          );
        } else if (normalizedPayload.tradeStatus === SulifuPayPaymentStatus.FAILED_CREATE) {
          await this.paymentIntentRepo.update(paymentIntent.id, {
            status: 'canceled' as any
          });
          this.paymentStatusGateway.emitPaymentFailure(
            paymentIntent.intentId,
            normalizedPayload.message || 'Payment failed'
          );
        } else {
          this.paymentStatusGateway.emitPaymentUpdate(
            paymentIntent.intentId,
            newStatus,
            { transactionId: updatedTransaction.transactionId }
          );
        }
      }

      try {
        const eventType = normalizedPayload.tradeStatus === SulifuPayPaymentStatus.SUCCESS
          ? 'payment.success'
          : 'payment.failed';
        await this.merchantWebhookService.deliverMerchantWebhook(
          updatedTransaction,
          eventType,
          `sulifu_deposit_webhook`
        );
      } catch (webhookError) {
        this.logger.warn(`Failed to deliver merchant webhook: ${webhookError.message}`);
      }

      return {
        transactionId: normalizedPayload.tradeNo,
        status: newStatus,
        updated: true,
      };
    } catch (error) {
      this.logger.error('Sulifu Pay deposit webhook processing failed:', error);
      throw error;
    }
  }

  private buildExternalIdMatch(tradeNo: string) {
    const candidates = this.buildExternalIdCandidates(tradeNo);

    return candidates.length === 1
      ? { externalTransactionId: candidates[0] }
      : candidates.map((value) => ({ externalTransactionId: value }));
  }

  private buildExternalIdCandidates(tradeNo: string): string[] {
    const candidates = new Set<string>();

    if (tradeNo) {
      candidates.add(tradeNo);

      const parts = tradeNo.split('_');
      if (parts.length > 1) {
        candidates.add(parts.slice(0, -1).join('_'));
      }

      const dashParts = tradeNo.split('-');
      if (dashParts.length > 1) {
        candidates.add(dashParts[0]);
      }
    }

    return Array.from(candidates);
  }

  private buildDepositCandidates(tradeNo?: string): string[] {
    const candidates = new Set<string>();

    if (tradeNo) {
      candidates.add(tradeNo);

      const parts = tradeNo.split('_');
      if (parts.length > 1) {
        candidates.add(parts.slice(0, -1).join('_'));
      }

      const dashParts = tradeNo.split('-');
      if (dashParts.length > 1) {
        candidates.add(dashParts[0]);
      }
    }

    return Array.from(candidates);
  }

  private buildPayoutCandidates(tradeNo?: string): string[] {
    if (!tradeNo) {
      return [];
    }

    const candidates = new Set<string>();
    candidates.add(tradeNo);

    const normalised = tradeNo.replace(/__+/g, '_');
    candidates.add(normalised);

    const parts = normalised.split('_').filter(Boolean);

    // Generate suffixes
    for (let start = 0; start < parts.length; start++) {
      const suffixParts = parts.slice(start);
      const suffix = suffixParts.join('_');
      candidates.add(suffix);
      const suffixWithoutTrailing = suffixParts.slice(0, -1).join('_');
      if (suffixWithoutTrailing) {
        candidates.add(suffixWithoutTrailing);
      }
    }

    // Generate prefixes
    for (let end = parts.length; end > 0; end--) {
      const prefix = parts.slice(0, end).join('_');
      candidates.add(prefix);
    }

    // Remove leading payout_ variants
    Array.from(candidates).forEach((value) => {
      if (value.startsWith('payout_')) {
        candidates.add(value.replace(/^payout_/, ''));
        if (value.startsWith('payout_payout_')) {
          candidates.add(value.replace(/^payout_payout_/, ''));
        }
      }
    });

    return Array.from(candidates).filter(Boolean);
  }

  private async processPayoutWebhook(
    payload: SulifuPayPayoutNotification,
    adapter: SulifuPayAdapter,
    walletService: WalletServiceGrpc
  ): Promise<{
    transactionId: string;
    status: string;
    updated: boolean;
  }> {
    try {
      this.logger.log(`Processing Sulifu Pay PAYOUT webhook: ${payload.tradeNo}, status: ${payload.tradeStatus}`);

      const isValidSignature = adapter.verifyWebhookSignature(payload, payload.sign);

      if (!isValidSignature) {
        this.logger.error(`Invalid Sulifu Pay payout webhook signature for: ${payload.tradeNo}`);
        throw new Error('Invalid webhook signature');
      }

      this.logger.log('Sulifu Pay payout webhook signature verified successfully');

      const parsedStatus =
        typeof payload.tradeStatus === 'string'
          ? Number(payload.tradeStatus)
          : payload.tradeStatus;

      if (Number.isNaN(parsedStatus)) {
        this.logger.warn(
          `Sulifu Pay payout webhook: unable to parse tradeStatus "${payload.tradeStatus}" as number. Defaulting to processing.`,
        );
      }

      const normalizedPayload: SulifuPayPayoutNotification = {
        ...payload,
        tradeStatus: Number.isNaN(parsedStatus)
          ? SulifuPayPayoutStatus.PROCESSING
          : (parsedStatus as SulifuPayPayoutStatus),
      };

      const candidateIds = this.buildPayoutCandidates(normalizedPayload.tradeNo);
      let payout: Payout | null = null;

      for (const candidate of candidateIds) {
        payout = await this.payoutRepo.findOne({ where: { payoutId: candidate } });
        if (payout) {
          break;
        }
      }

      if (!payout) {
        for (const candidate of candidateIds) {
          payout = await this.payoutRepo.findOne({ where: { externalPayoutId: candidate } });
          if (payout) {
            break;
          }
        }
      }

      if (!payout) {
        const regexLikeCandidates = Array.from(
          new Set(
            candidateIds.flatMap((candidate) => [
              candidate,
              candidate.replace(/^payout_/, ''),
              candidate.replace(/^payout_payout_/, ''),
            ]),
          ),
        ).filter(Boolean);

        for (const candidate of regexLikeCandidates) {
          payout = await this.payoutRepo.findOne({
            where: { externalPayoutId: Like(`${candidate.replace(/[_%]/g, '\\$&')}%`) },
          });
          if (payout) {
            break;
          }
        }
      }

      if (!payout) {
        this.logger.warn(`Sulifu Pay webhook: payout not found: ${payload.tradeNo}`);
        return {
          transactionId: payload.tradeNo,
          status: 'not_found',
          updated: false,
        };
      }

      this.logger.log(
        `Payout found: ${payout.payoutId}, merchantId: ${payout.merchantId}, current status: ${payout.status}`,
      );

      const newStatus = this.mapPayoutStatusToPayoutStatus(normalizedPayload.tradeStatus);

      const updateData: any = {
        status: newStatus,
        tspResponse: normalizedPayload as any,
      };

      if (normalizedPayload.tradeStatus === SulifuPayPayoutStatus.SUCCESS) {
        updateData.completedAt = new Date();
      } else if (
        normalizedPayload.tradeStatus === SulifuPayPayoutStatus.FAILED_CREATE ||
        normalizedPayload.tradeStatus === SulifuPayPayoutStatus.FAILED_PAYMENT
      ) {
        updateData.failureReason = normalizedPayload.message;
      }

      await this.payoutRepo.update({ payoutId: payout.payoutId }, updateData);
      this.logger.log(`Payout ${payout.payoutId} updated to status: ${newStatus}`);

      const blockId = payout.walletTransactionId || `block_${payout.payoutId}`;

      if (normalizedPayload.tradeStatus === SulifuPayPayoutStatus.SUCCESS) {
        this.logger.log(`Payout ${payout.payoutId} successful. Debiting blocked amount from merchant wallet.`);

        const debitResult = await walletService.DebitBlockedAmount({
          merchant_id: payout.merchantId,
          block_id: blockId,
          currency: payout.currency,
          description: `Payout ${payout.payoutId} to ${payout.beneficiaryName}`,
          request_id: `sulifu_payout_webhook`,
        });

        if (!debitResult.success) {
          this.logger.error(`CRITICAL: Failed to debit blocked amount for payout ${payout.payoutId}: ${debitResult.error_message || debitResult.message}`);
          throw new Error('Wallet debit failed - manual intervention required');
        }

        this.logger.log(`Blocked amount debited successfully for payout ${payout.payoutId}. Transaction: ${debitResult.transaction_id}`);
      } else if (
        normalizedPayload.tradeStatus === SulifuPayPayoutStatus.FAILED_CREATE ||
        normalizedPayload.tradeStatus === SulifuPayPayoutStatus.FAILED_PAYMENT
      ) {
        this.logger.log(`Payout ${payout.payoutId} failed. Releasing blocked amount back to merchant wallet.`);

        const releaseResult = await walletService.ReleaseBlockedAmount({
          merchant_id: payout.merchantId,
          block_id: blockId,
          currency: payout.currency,
          release_reason: `Payout ${payout.payoutId} failed: ${payload.message}`,
          request_id: `sulifu_payout_webhook`,
        });

        if (!releaseResult.success) {
          this.logger.error(`CRITICAL: Failed to release blocked amount for payout ${payout.payoutId}: ${releaseResult.error_message || releaseResult.message}`);
          throw new Error('Wallet release failed - manual intervention required');
        }

        this.logger.log(`Blocked amount released successfully for payout ${payout.payoutId}. Available balance restored.`);
      }

      if (payout.webhookUrl) {
        try {
          await axios.post(payout.webhookUrl, {
            event: 'payout.status_update',
            payoutId: payout.payoutId,
            status: newStatus,
            amount: payout.amount,
            currency: payout.currency,
            beneficiary: payout.beneficiaryName,
            timestamp: new Date().toISOString(),
            tspProvider: 'sulifu_pay',
            tspTradeNo: normalizedPayload.tradeNo,
          }, {
            timeout: 5000,
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Valorapays-Webhook/1.0',
            },
          });
          this.logger.log(`Merchant webhook notification sent for payout ${payout.payoutId}`);
        } catch (error) {
          this.logger.error(`Failed to send merchant webhook for payout ${payout.payoutId}:`, error.message);
        }
      }

      return {
        transactionId: payload.tradeNo,
        status: newStatus,
        updated: true,
      };
    } catch (error) {
      this.logger.error('Sulifu Pay payout webhook processing failed:', error);
      throw error;
    }
  }

  private mapDepositStatusToTransactionStatus(status: SulifuPayPaymentStatus): string {
    switch (status) {
      case SulifuPayPaymentStatus.SUCCESS:
        return 'success';
      case SulifuPayPaymentStatus.PROCESSING:
        return 'processing';
      case SulifuPayPaymentStatus.REVIEWING:
        return 'processing';
      case SulifuPayPaymentStatus.FAILED_CREATE:
        return 'failed';
      default:
        return 'processing';
    }
  }

  private mapDepositStatusToResponseCode(status: SulifuPayPaymentStatus): string {
    switch (status) {
      case SulifuPayPaymentStatus.SUCCESS:
        return '0';
      case SulifuPayPaymentStatus.PROCESSING:
        return '1088';
      case SulifuPayPaymentStatus.REVIEWING:
        return '1088';
      case SulifuPayPaymentStatus.FAILED_CREATE:
        return '1009';
      default:
        return '1088';
    }
  }

  private mapPayoutStatusToPayoutStatus(status: SulifuPayPayoutStatus): PayoutStatus {
    switch (status) {
      case SulifuPayPayoutStatus.SUCCESS:
        return PayoutStatus.COMPLETED;
      case SulifuPayPayoutStatus.PROCESSING:
        return PayoutStatus.PROCESSING;
      case SulifuPayPayoutStatus.API_AUDIT:
      case SulifuPayPayoutStatus.MANUAL_AUDIT:
        return PayoutStatus.PROCESSING;
      case SulifuPayPayoutStatus.FAILED_CREATE:
      case SulifuPayPayoutStatus.FAILED_PAYMENT:
        return PayoutStatus.FAILED;
      default:
        return PayoutStatus.PROCESSING;
    }
  }
}

