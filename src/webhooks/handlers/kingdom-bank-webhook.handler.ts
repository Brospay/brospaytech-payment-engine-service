import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { PaymentTransaction } from '@/entities/payment-transaction.entity';
import { PaymentIntent } from '@/entities/payment-intent.entity';
import { Payout, PayoutStatus } from '@/entities/payout.entity';
import { TSPConfiguration } from '@/entities/tsp-configuration.entity';
import { LoggerService } from '@/common/services/logger.service';
import { TSPProvider } from '@/enums/tsp-provider.enum';
import { KingdomBankAdapter } from '@/tsp/adapters/kingdom-bank.adapter';
import { PaymentTransactionService } from '@/modules/payment-transaction/payment-transaction.service';
import { PaymentStatusGateway } from '@/modules/payment-status/payment-status.gateway';
import { MerchantWebhookService } from '../merchant/merchant-webhook.service';
import { WalletServiceGrpc, MerchantServiceGrpc } from '@/types';
import { KingdomBankWebhookNotificationDto, KingdomBankNotificationStatus } from '@/dto/webhooks/kingdom-bank-webhook.dto';

@Injectable()
export class KingdomBankWebhookHandler {
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
    payload: KingdomBankWebhookNotificationDto,
    signature: string,
    signatureKeyId: string,
    walletService: WalletServiceGrpc,
    updateCustomerStatsCallback: (transaction: PaymentTransaction, status: 'success' | 'failed', payload: any) => Promise<void>
  ): Promise<{
    transactionId: string;
    status: string;
    updated: boolean;
  }> {
    try {
      this.logger.log(`Processing Kingdom Bank webhook: ${payload.foreignTransactionId}, Type: ${payload.type}, Status: ${payload.status}`);

      if (payload.type === 'PAYOUT' || payload.type === 'EXTERNAL_TRANSFER') {
        return await this.processPayoutWebhook(payload, signature, signatureKeyId, walletService);
      } else if (payload.type === 'PAYMENT') {
        return await this.processPaymentWebhook(payload, signature, signatureKeyId, updateCustomerStatsCallback);
      } else {
        this.logger.warn(`Unsupported Kingdom Bank webhook type: ${payload.type}`);
        return {
          transactionId: payload.foreignTransactionId,
          status: 'unsupported_type',
          updated: false,
        };
      }
    } catch (error) {
      this.logger.error(`Kingdom Bank webhook processing failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async processPaymentWebhook(
    payload: KingdomBankWebhookNotificationDto,
    signature: string,
    signatureKeyId: string,
    updateCustomerStatsCallback: (transaction: PaymentTransaction, status: 'success' | 'failed', payload: any) => Promise<void>
  ): Promise<{
    transactionId: string;
    status: string;
    updated: boolean;
  }> {
    try {
      this.logger.log(`[KB_WEBHOOK] Processing Kingdom Bank PAYMENT webhook: ${payload.foreignTransactionId}, Status: ${payload.status}, Type: ${payload.type}`);

      const transaction = await this.transactionRepo.findOne({
        where: { externalTransactionId: payload.foreignTransactionId },
        relations: ['intent'],
      });

      if (!transaction) {
        this.logger.warn(`Kingdom Bank webhook: payment transaction not found: ${payload.foreignTransactionId}`);
        return {
          transactionId: payload.foreignTransactionId,
          status: 'not_found',
          updated: false,
        };
      }

      this.logger.log(`[KB_WEBHOOK] Payment transaction found: ${transaction.transactionId}, merchantId: ${transaction.merchantId}`);

      const environment = process.env.NODE_ENV === 'production' ? 'production' : 'sandbox';
      const tspConfig = await this.tspConfigRepo.findOne({
        where: {
          providerName: TSPProvider.KINGDOM_BANK,
          environment,
          isActive: true,
        },
      });

      if (!tspConfig) {
        throw new Error('Kingdom Bank TSP configuration not found');
      }

      const adapter = new KingdomBankAdapter(tspConfig, this.logger);
      const isSandbox = environment !== 'production';

      this.logger.debug(`Webhook signature check: environment=${environment}, isSandbox=${isSandbox}, hasSignature=${!!signature}, hasKeyId=${!!signatureKeyId}`);

      if (!isSandbox && signature && signatureKeyId) {
        this.logger.log(`Verifying Kingdom Bank webhook signature for production environment`);
        const payloadString = JSON.stringify(payload);
        const isValidSignature = adapter.verifyWebhookSignature(
          payloadString,
          signature,
          signatureKeyId
        );

        if (!isValidSignature) {
          this.logger.error(`Kingdom Bank webhook signature verification failed for: ${payload.foreignTransactionId}`);
          this.logger.error(`Received signature: ${signature?.substring(0, 20)}...`);
          this.logger.error(`Signature Key ID: ${signatureKeyId}`);
          throw new Error('Invalid webhook signature');
        }
        this.logger.log(`Kingdom Bank webhook signature verified successfully`);
      } else {
        this.logger.warn(`Skipping Kingdom Bank webhook signature verification - Reason: ${isSandbox ? 'sandbox mode' : 'missing signature headers'}`);
      }

      const responseCode = this.mapStatusToResponseCode(payload.status, payload.error);
      const newStatus = this.mapStatusToTransactionStatus(payload.status);

      if (transaction.status === newStatus) {
        this.logger.log(`Kingdom Bank webhook: status unchanged (${newStatus}) for: ${payload.foreignTransactionId}`);
        return {
          transactionId: payload.foreignTransactionId,
          status: newStatus,
          updated: false,
        };
      }

      const updateFields: any = {};

      if (payload.transactionId) {
        updateFields.externalTransactionId = payload.transactionId.toString();
        this.logger.log(`Updated externalTransactionId: ${transaction.externalTransactionId} -> ${payload.transactionId}`);
      }

      if (payload.paymentMethod) {
        updateFields.paymentMethod = payload.paymentMethod;
        this.logger.log(`Payment method from Kingdom Bank: ${payload.paymentMethod}`);
      }

      if (Object.keys(updateFields).length > 0) {
        await this.transactionRepo.update(transaction.id, updateFields);
        const paymentMethodMap: Record<string, string> = {
          'KINGDOM_WALLET': 'WALLET',
          'CARD': 'CARD',
          'CRYPTO': 'CRYPTO',
          'BANK_TRANSFER': 'BANK_TRANSFER',
        };
        updateFields.paymentMethod = paymentMethodMap[payload.paymentMethod] || payload.paymentMethod;
        this.logger.log(`Setting paymentMethod: ${payload.paymentMethod} -> ${updateFields.paymentMethod}`);
      }

      const updatedTransaction = await this.paymentTransactionService.updateTransactionStatus(
        transaction.transactionId,
        responseCode,
        payload,
        `kb_webhook_${payload.notificationId}`
      );

      this.logger.log(`[KB_WEBHOOK] Transaction updated via PaymentTransactionService: ${updatedTransaction.transactionId}, status: ${updatedTransaction.status}`);

      const paymentIntent = updatedTransaction.intent || await this.paymentIntentRepo.findOne({
        where: { intentId: updatedTransaction.paymentIntentId }
      });

      if (paymentIntent) {
        if (payload.status === KingdomBankNotificationStatus.PROCESSED) {
          await this.paymentIntentRepo.update(paymentIntent.id, {
            status: 'succeeded' as any
          });
          this.paymentStatusGateway.emitPaymentSuccess(
            paymentIntent.intentId,
            updatedTransaction.transactionId
          );
        } else if (payload.status === KingdomBankNotificationStatus.FAILED) {
          await this.paymentIntentRepo.update(paymentIntent.id, {
            status: 'canceled' as any
          });
          this.paymentStatusGateway.emitPaymentFailure(
            paymentIntent.intentId,
            payload.error?.message || 'Payment failed'
          );
        } else {
          this.paymentStatusGateway.emitPaymentUpdate(
            paymentIntent.intentId,
            newStatus,
            { transactionId: updatedTransaction.transactionId }
          );
        }
      }

      if (payload.status === KingdomBankNotificationStatus.PROCESSED) {
        await updateCustomerStatsCallback(updatedTransaction, 'success', payload);
      } else if (payload.status === KingdomBankNotificationStatus.FAILED) {
        await updateCustomerStatsCallback(updatedTransaction, 'failed', payload);
      }

      try {
        const eventType = this.mapTypeToMerchantWebhookEvent(payload.type, payload.status);
        await this.merchantWebhookService.deliverMerchantWebhook(
          updatedTransaction,
          eventType,
          `kb_webhook_${payload.notificationId}`
        );
      } catch (webhookError) {
        this.logger.warn(`Failed to deliver merchant webhook for Kingdom Bank notification: ${webhookError.message}`);
      }

      return {
        transactionId: payload.foreignTransactionId,
        status: newStatus,
        updated: true,
      };
    } catch (error) {
      this.logger.error('Kingdom Bank webhook processing failed:', error);
      throw error;
    }
  }

  private async processPayoutWebhook(
    payload: KingdomBankWebhookNotificationDto,
    signature: string,
    signatureKeyId: string,
    walletService: WalletServiceGrpc
  ): Promise<{
    transactionId: string;
    status: string;
    updated: boolean;
  }> {
    this.logger.log(`Processing Kingdom Bank PAYOUT webhook: ${payload.foreignTransactionId}`);

    const payoutIdMatch = payload.foreignTransactionId.match(/payout_[a-z0-9_]+/);
    if (!payoutIdMatch) {
      this.logger.error(`Invalid payout foreignTransactionId format: ${payload.foreignTransactionId}`);
      return {
        transactionId: payload.foreignTransactionId,
        status: 'invalid_format',
        updated: false,
      };
    }

    const payoutId = payoutIdMatch[0];
    this.logger.log(`Extracted payout ID: ${payoutId}`);

    const payout = await this.payoutRepo.findOne({
      where: { payoutId }
    });

    if (!payout) {
      this.logger.warn(`Kingdom Bank webhook: payout not found: ${payoutId}`);
      return {
        transactionId: payload.foreignTransactionId,
        status: 'not_found',
        updated: false,
      };
    }

    this.logger.log(`[KB_PAYOUT_WEBHOOK] Payout found: ${payout.payoutId}, merchantId: ${payout.merchantId}, current status: ${payout.status}`);

    const environment = process.env.NODE_ENV === 'production' ? 'production' : 'sandbox';
    const tspConfig = await this.tspConfigRepo.findOne({
      where: {
        providerName: TSPProvider.KINGDOM_BANK,
        environment,
        isActive: true,
      },
    });

    if (!tspConfig) {
      throw new Error('Kingdom Bank TSP configuration not found');
    }

    const adapter = new KingdomBankAdapter(tspConfig, this.logger);

    if (environment === 'production') {
      const isValid = adapter.verifyWebhookSignature(payload, signature, signatureKeyId);
      if (!isValid) {
        this.logger.error(`Invalid Kingdom Bank payout webhook signature for ${payoutId}`);
        throw new Error('Invalid webhook signature');
      }
      this.logger.log(`Kingdom Bank payout webhook signature verified for ${payoutId}`);
    } else {
      this.logger.warn(`Skipping Kingdom Bank payout webhook signature verification (${environment} environment)`);
    }

    const newStatus = this.mapStatusToPayoutStatus(payload.status);

    const updateData: any = {
      status: newStatus,
      tspResponse: payload as any,
    };

    if (payload.transactionId) {
      updateData.externalPayoutId = payload.transactionId.toString();
      this.logger.log(`Updated externalPayoutId: ${payout.externalPayoutId} -> ${payload.transactionId}`);
    }

    await this.payoutRepo.update({ payoutId }, updateData);
    this.logger.log(`Payout ${payoutId} updated to status: ${newStatus}`);

    if (payload.status === KingdomBankNotificationStatus.PROCESSED) {
      this.logger.log(`Payout ${payoutId} successful. Debiting blocked amount from merchant wallet.`);

      const blockId = payout.walletTransactionId || `block_${payoutId}`;

      const debitResult = await walletService.DebitBlockedAmount({
        merchant_id: payout.merchantId,
        block_id: blockId,
        currency: payout.currency,
        description: `Payout ${payoutId} to ${payout.beneficiaryName}`,
        request_id: `webhook_kb_${payload.notificationId}`,
      });

      if (!debitResult.success) {
        this.logger.error(`CRITICAL: Failed to debit blocked amount for payout ${payoutId}: ${debitResult.error_message || debitResult.message}`);
        throw new Error('Wallet debit failed - manual intervention required');
      }

      this.logger.log(`Blocked amount debited successfully for payout ${payoutId}. Transaction: ${debitResult.transaction_id}`);
    } else if (payload.status === KingdomBankNotificationStatus.FAILED) {
      this.logger.log(`Payout ${payoutId} failed. Releasing blocked amount back to merchant wallet.`);

      const blockId = payout.walletTransactionId || `block_${payoutId}`;

      const releaseResult = await walletService.ReleaseBlockedAmount({
        merchant_id: payout.merchantId,
        block_id: blockId,
        currency: payout.currency,
        release_reason: `Payout ${payoutId} failed: ${payload.status}`,
        request_id: `webhook_kb_${payload.notificationId}`,
      });

      if (!releaseResult.success) {
        this.logger.error(`CRITICAL: Failed to release blocked amount for payout ${payoutId}: ${releaseResult.error_message || releaseResult.message}`);
        throw new Error('Wallet release failed - manual intervention required');
      }

      this.logger.log(`Blocked amount released successfully for payout ${payoutId}. Available balance restored.`);
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
          timestamp: payload.timestamp,
          tspProvider: 'kingdom_bank',
          tspTransactionId: payload.transactionId?.toString(),
        });
        this.logger.log(`Merchant webhook notification sent for payout ${payoutId}`);
      } catch (error) {
        this.logger.error(`Failed to send merchant webhook for payout ${payoutId}:`, error.message);
      }
    }

    return {
      transactionId: payoutId,
      status: newStatus,
      updated: true,
    };
  }

  private mapStatusToPayoutStatus(status: KingdomBankNotificationStatus): PayoutStatus {
    switch (status) {
      case KingdomBankNotificationStatus.PROCESSED:
        return PayoutStatus.COMPLETED;
      case KingdomBankNotificationStatus.PENDING:
        return PayoutStatus.PROCESSING;
      case KingdomBankNotificationStatus.SCHEDULED:
        return PayoutStatus.PROCESSING;
      case KingdomBankNotificationStatus.FAILED:
        return PayoutStatus.FAILED;
      case KingdomBankNotificationStatus.CANCELLED:
        return PayoutStatus.CANCELLED;
      default:
        return PayoutStatus.PROCESSING;
    }
  }

  private mapStatusToTransactionStatus(status: KingdomBankNotificationStatus): string {
    switch (status) {
      case KingdomBankNotificationStatus.PROCESSED:
        return 'success';
      case KingdomBankNotificationStatus.PENDING:
        return 'processing';
      case KingdomBankNotificationStatus.SCHEDULED:
        return 'processing';
      case KingdomBankNotificationStatus.FAILED:
        return 'failed';
      case KingdomBankNotificationStatus.CANCELLED:
        return 'cancelled';
      default:
        return 'processing';
    }
  }

  private mapStatusToResponseCode(status: KingdomBankNotificationStatus, error?: any): string {
    switch (status) {
      case KingdomBankNotificationStatus.PROCESSED:
        return '0';
      case KingdomBankNotificationStatus.PENDING:
        return '1088';
      case KingdomBankNotificationStatus.SCHEDULED:
        return '1088';
      case KingdomBankNotificationStatus.FAILED:
        return '1009';
      case KingdomBankNotificationStatus.CANCELLED:
        return '1030';
      default:
        return '1088';
    }
  }

  private mapTypeToMerchantWebhookEvent(type: string, status: KingdomBankNotificationStatus): any {
    const isSuccess = status === KingdomBankNotificationStatus.PROCESSED;
    const isFailed = status === KingdomBankNotificationStatus.FAILED || status === KingdomBankNotificationStatus.CANCELLED;

    switch (type) {
      case 'PAYMENT':
        if (isSuccess) return 'payment.success';
        if (isFailed) return 'payment.failed';
        return 'payment.pending';
      case 'REFUND':
        return 'refund.completed';
      case 'PAYOUT':
        return 'payout.completed';
      case 'EXTERNAL_TRANSFER':
      case 'INTERNAL_TRANSFER':
        return isSuccess ? 'transfer.completed' : 'transfer.failed';
      case 'CHARGEBACK':
        return 'chargeback.created';
      default:
        return 'payment.pending';
    }
  }
}

