import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentTransaction } from '@/entities/payment-transaction.entity';
import { PaymentIntent } from '@/entities/payment-intent.entity';
import { Payout, PayoutStatus } from '@/entities/payout.entity';
import { TSPConfiguration } from '@/entities/tsp-configuration.entity';
import { LoggerService } from '@/common/services/logger.service';
import { TSPProvider } from '@/enums/tsp-provider.enum';
import { PayazaAdapter } from '@/tsp/adapters/payaza.adapter';
import { PaymentTransactionService } from '@/modules/payment-transaction/payment-transaction.service';
import { PaymentStatusGateway } from '@/modules/payment-status/payment-status.gateway';
import { MerchantWebhookService } from '../merchant/merchant-webhook.service';
import { WalletServiceGrpc } from '@/types';
import axios from 'axios';

/**
 * Payaza Webhook Handler
 * 
 * Handles webhook notifications from Payaza payment gateway including:
 * - Payment (card charge) updates
 * - Transfer (payout) status updates
 * - Refund confirmations
 * - Chargeback notifications
 */
@Injectable()
export class PayazaWebhookHandler {
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

  /**
   * Main webhook processing entry point
   */
  async processWebhook(
    payload: any,
    signature: string,
    walletService: WalletServiceGrpc
  ): Promise<{
    transactionId: string;
    status: string;
    updated: boolean;
  }> {
    try {
      this.logger.log(`Processing Payaza webhook: ${payload.event || 'transaction_update'} for ${payload.data?.reference || payload.reference}`);

      const environment = process.env.NODE_ENV === 'production' ? 'production' : 'sandbox';
      const tspConfig = await this.tspConfigRepo.findOne({
        where: {
          providerName: TSPProvider.PAYAZA,
          environment,
          isActive: true,
        },
      });

      if (!tspConfig) {
        throw new Error('Payaza configuration not found');
      }

      const adapter = new PayazaAdapter(tspConfig, this.logger);

      const isValidSignature = adapter.verifyWebhookSignature(payload, signature);

      if (!isValidSignature) {
        this.logger.error('Invalid Payaza webhook signature');
        throw new Error('Invalid webhook signature');
      }

      this.logger.log('Payaza webhook signature verified successfully');

      const transactionData = payload.data || payload;
      const eventType = payload.event || this.detectEventType(transactionData);

      if (this.isPaymentEvent(eventType)) {
        return await this.processPaymentWebhook(transactionData, adapter, walletService);
      } else if (this.isTransferEvent(eventType)) {
        return await this.processTransferWebhook(transactionData, adapter, walletService);
      } else if (this.isRefundEvent(eventType)) {
        return await this.processRefundWebhook(transactionData, adapter, walletService);
      } else if (this.isChargebackEvent(eventType)) {
        return await this.processChargebackWebhook(transactionData, adapter, walletService);
      } else {
        this.logger.warn(`Unknown Payaza webhook event type: ${eventType}`);
        return await this.processPaymentWebhook(transactionData, adapter, walletService);
      }
    } catch (error) {
      this.logger.error('Payaza webhook processing failed:', error);
      throw error;
    }
  }

  /**
   * Process payment (card charge) webhook
   */
  private async processPaymentWebhook(
    transactionData: any,
    adapter: PayazaAdapter,
    walletService: WalletServiceGrpc
  ): Promise<{
    transactionId: string;
    status: string;
    updated: boolean;
  }> {
    try {
      const transactionReference = transactionData.reference || transactionData.transaction_reference;

      const { status: resolvedStatus, responseCode: resolvedCode } = this.resolvePayazaStatus(transactionData);

      this.logger.log(`Processing Payaza PAYMENT webhook: ${transactionReference}, status: ${transactionData.status || resolvedStatus}`);

      if (!transactionReference) {
        throw new Error('Invalid Payaza webhook payload: missing transaction reference');
      }

      let transaction = await this.transactionRepo.findOne({
        where: { externalTransactionId: transactionReference },
        relations: ['intent'],
      });

      if (!transaction) {
        transaction = await this.transactionRepo.findOne({
          where: { requestId: transactionReference },
          relations: ['intent'],
        });
      }

      if (!transaction) {
        this.logger.warn(`Payaza webhook: payment transaction not found: ${transactionReference}`);
        return {
          transactionId: transactionReference,
          status: 'not_found',
          updated: false,
        };
      }

      this.logger.log(`Payment transaction found: ${transaction.transactionId}, merchantId: ${transaction.merchantId}`);

      const newStatus = this.mapPayazaStatusToTransactionStatus(resolvedStatus);
      const responseCode = resolvedCode || this.mapPayazaStatusToResponseCode(resolvedStatus);

      if (transaction.status === newStatus) {
        this.logger.log(`Payaza webhook: status unchanged (${newStatus}) for: ${transactionReference}`);
        return {
          transactionId: transactionReference,
          status: newStatus,
          updated: false,
        };
      }

      const updatedTransaction = await this.paymentTransactionService.updateTransactionStatus(
        transaction.transactionId,
        responseCode,
        transactionData,
        'payaza_payment_webhook'
      );

      this.logger.log(`Payment transaction updated: ${updatedTransaction.transactionId}, status: ${updatedTransaction.status}`);

      const paymentIntent = updatedTransaction.intent || await this.paymentIntentRepo.findOne({
        where: { intentId: updatedTransaction.paymentIntentId }
      });

      if (paymentIntent) {
        if (newStatus === 'success' || newStatus === 'completed') {
          await this.paymentIntentRepo.update(paymentIntent.id, {
            status: 'succeeded' as any
          });
          this.paymentStatusGateway.emitPaymentSuccess(
            paymentIntent.intentId,
            updatedTransaction.transactionId
          );
        } else if (newStatus === 'failed' || newStatus === 'declined') {
          await this.paymentIntentRepo.update(paymentIntent.id, {
            status: 'requires_payment_method' as any
          });
          this.paymentStatusGateway.emitPaymentFailure(
            paymentIntent.intentId,
            transactionData.message || 'Payment failed'
          );
        } else if (newStatus === 'cancelled') {
          await this.paymentIntentRepo.update(paymentIntent.id, {
            status: 'canceled' as any
          });
          this.paymentStatusGateway.emitPaymentFailure(
            paymentIntent.intentId,
            'Payment cancelled'
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
        const eventType = (newStatus === 'success' || newStatus === 'completed')
          ? 'payment.success'
          : 'payment.failed';
        await this.merchantWebhookService.deliverMerchantWebhook(
          updatedTransaction,
          eventType,
          'payaza_payment_webhook'
        );
      } catch (webhookError) {
        this.logger.warn(`Failed to deliver merchant webhook: ${webhookError.message}`);
      }

      return {
        transactionId: transactionReference,
        status: newStatus,
        updated: true,
      };
    } catch (error) {
      this.logger.error('Payaza payment webhook processing failed:', error);
      throw error;
    }
  }

  /**
   * Process transfer (payout) webhook
   */
  private async processTransferWebhook(
    transactionData: any,
    adapter: PayazaAdapter,
    walletService: WalletServiceGrpc
  ): Promise<{
    transactionId: string;
    status: string;
    updated: boolean;
  }> {
    try {
      const transferReference = transactionData.reference || transactionData.transaction_reference;

      const { status: resolvedStatus, responseCode: resolvedCode } = this.resolvePayazaStatus(transactionData);

      this.logger.log(`Processing Payaza TRANSFER webhook: ${transferReference}, status: ${transactionData.status || resolvedStatus}`);

      if (!transferReference) {
        throw new Error('Invalid Payaza webhook payload: missing transfer reference');
      }

      const payout = await this.payoutRepo.findOne({
        where: { payoutId: transferReference }
      });

      if (!payout) {
        this.logger.warn(`Payaza webhook: payout not found: ${transferReference}`);
        return {
          transactionId: transferReference,
          status: 'not_found',
          updated: false,
        };
      }

      this.logger.log(`Payout found: ${payout.payoutId}, merchantId: ${payout.merchantId}, current status: ${payout.status}`);

      const newStatus = this.mapPayazaStatusToPayoutStatus(resolvedStatus);

      const updateData: any = {
        status: newStatus,
        tspResponse: transactionData as any,
      };

      await this.payoutRepo.update({ payoutId: payout.payoutId }, updateData);
      this.logger.log(`Payout ${payout.payoutId} updated to status: ${newStatus}`);

      const blockId = payout.walletTransactionId || `block_${payout.payoutId}`;

      if (newStatus === PayoutStatus.COMPLETED) {
        this.logger.log(`Payout ${payout.payoutId} successful. Debiting blocked amount from merchant wallet.`);

        const debitResult = await walletService.DebitBlockedAmount({
          merchant_id: payout.merchantId,
          block_id: blockId,
          currency: payout.currency,
          description: `Payout ${payout.payoutId} to ${payout.beneficiaryName}`,
          request_id: 'payaza_payout_webhook',
        });

        if (!debitResult.success) {
          this.logger.error(`CRITICAL: Failed to debit blocked amount for payout ${payout.payoutId}: ${debitResult.error_message || debitResult.message}`);
          throw new Error('Wallet debit failed - manual intervention required');
        }

        this.logger.log(`Blocked amount debited successfully for payout ${payout.payoutId}. Transaction: ${debitResult.transaction_id}`);
      } else if (newStatus === PayoutStatus.FAILED) {
        this.logger.log(`Payout ${payout.payoutId} failed. Releasing blocked amount back to merchant wallet.`);

        const releaseResult = await walletService.ReleaseBlockedAmount({
          merchant_id: payout.merchantId,
          block_id: blockId,
          currency: payout.currency,
          release_reason: `Payout ${payout.payoutId} failed: ${transactionData.message || 'Unknown error'}`,
          request_id: 'payaza_payout_webhook',
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
            tspProvider: 'payaza',
            tspReference: transferReference,
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
        transactionId: transferReference,
        status: newStatus,
        updated: true,
      };
    } catch (error) {
      this.logger.error('Payaza transfer webhook processing failed:', error);
      throw error;
    }
  }

  /**
   * Process refund webhook
   */
  private async processRefundWebhook(
    transactionData: any,
    adapter: PayazaAdapter,
    walletService: WalletServiceGrpc
  ): Promise<{
    transactionId: string;
    status: string;
    updated: boolean;
  }> {
    try {
      const refundReference = transactionData.refund_reference || transactionData.reference;

      this.logger.log(`Processing Payaza REFUND webhook: ${refundReference}, status: ${transactionData.status}`);

      const transaction = await this.transactionRepo.findOne({
        where: { externalTransactionId: transactionData.original_reference || transactionData.transaction_reference },
        relations: ['intent'],
      });

      if (!transaction) {
        this.logger.warn(`Payaza refund webhook: original transaction not found`);
        return {
          transactionId: refundReference,
          status: 'not_found',
          updated: false,
        };
      }

      await this.transactionRepo.update(transaction.id, {
        tspResponse: {
          ...transaction.tspResponse,
          refund: transactionData
        }
      });

      this.logger.log(`Refund webhook processed for transaction: ${transaction.transactionId}`);

      return {
        transactionId: refundReference,
        status: 'refunded',
        updated: true,
      };
    } catch (error) {
      this.logger.error('Payaza refund webhook processing failed:', error);
      throw error;
    }
  }

  /**
   * Process chargeback webhook
   */
  private async processChargebackWebhook(
    transactionData: any,
    adapter: PayazaAdapter,
    walletService: WalletServiceGrpc
  ): Promise<{
    transactionId: string;
    status: string;
    updated: boolean;
  }> {
    try {
      const chargebackReference = transactionData.chargeback_reference || transactionData.reference;

      this.logger.log(`Processing Payaza CHARGEBACK webhook: ${chargebackReference}, status: ${transactionData.status}`);

      const transaction = await this.transactionRepo.findOne({
        where: { externalTransactionId: transactionData.transaction_reference },
        relations: ['intent'],
      });

      if (!transaction) {
        this.logger.warn(`Payaza chargeback webhook: original transaction not found`);
        return {
          transactionId: chargebackReference,
          status: 'not_found',
          updated: false,
        };
      }

      await this.transactionRepo.update(transaction.id, {
        tspResponse: {
          ...transaction.tspResponse,
          chargeback: transactionData
        }
      });

      this.logger.log(`Chargeback webhook processed for transaction: ${transaction.transactionId}`);

      return {
        transactionId: chargebackReference,
        status: 'chargeback',
        updated: true,
      };
    } catch (error) {
      this.logger.error('Payaza chargeback webhook processing failed:', error);
      throw error;
    }
  }

  private detectEventType(data: any): string {
    if (data.refund_reference) return 'refund';
    if (data.chargeback_reference) return 'chargeback';
    if (data.destination_identifier) return 'transfer';
    return 'payment';
  }

  private isPaymentEvent(eventType: string): boolean {
    return ['payment', 'transaction', 'charge', 'transaction.success', 'transaction.failed'].includes(eventType.toLowerCase());
  }

  private isTransferEvent(eventType: string): boolean {
    return ['transfer', 'payout', 'withdrawal', 'transfer.success', 'transfer.failed'].includes(eventType.toLowerCase());
  }

  private isRefundEvent(eventType: string): boolean {
    return ['refund', 'refund.success', 'refund.failed'].includes(eventType.toLowerCase());
  }

  private isChargebackEvent(eventType: string): boolean {
    return ['chargeback', 'chargeback.requested', 'chargeback.accepted', 'chargeback.rejected'].includes(eventType.toLowerCase());
  }

  private resolvePayazaStatus(data: any): { status: string; responseCode?: string } {
    if (!data) {
      return { status: 'processing' };
    }

    let statusValue = data.status ?? data.transaction_status ?? data.payment_status ?? data.state ?? data.result;
    const rawCode = data.response_code ?? data.status_code ?? data.code;
    let responseCode: string | undefined = rawCode !== undefined && rawCode !== null ? String(rawCode) : undefined;

    const normalizeNumericStatus = (value: number): string => {
      if (value === 1 || value === 200 || value === 201 || value === 202) {
        return 'successful';
      }
      if (value === 0) {
        return 'processing';
      }
      if (value === -1 || value === 400 || value === 401 || value === 402 || value === 500) {
        return 'failed';
      }
      return value.toString();
    };

    if (typeof statusValue === 'number') {
      statusValue = normalizeNumericStatus(statusValue);
    }

    if (typeof statusValue === 'boolean') {
      statusValue = statusValue ? 'successful' : 'failed';
    }

    if (typeof statusValue !== 'string' || !statusValue.trim()) {
      if (data.success === true || data.status === true) {
        statusValue = 'successful';
      } else if (responseCode === '00') {
        statusValue = 'successful';
      } else {
        statusValue = 'processing';
      }
    }

    statusValue = statusValue.toString().trim();

    const lowerStatus = statusValue.toLowerCase();

    if (['00', '01', '0%', 'one', 'approved'].includes(lowerStatus) || lowerStatus === '1') {
      statusValue = 'successful';
      if (!responseCode) {
        responseCode = '0';
      }
    } else if (['02', '03', '99', 'declined', 'denied', 'error', 'failed', 'failure', 'rejected'].includes(lowerStatus)) {
      statusValue = 'failed';
    } else if (['timeout', 'timed_out'].includes(lowerStatus)) {
      statusValue = 'timeout';
    } else if (['cancelled', 'canceled', 'void', 'voided'].includes(lowerStatus)) {
      statusValue = 'cancelled';
    } else if (['pending', 'processing', 'in-progress', 'awaiting', 'awaiting_auth', 'awaiting_authorization'].includes(lowerStatus)) {
      statusValue = 'processing';
    } else if (['reversed', 'refunded', 'chargeback'].includes(lowerStatus)) {
      statusValue = lowerStatus;
      if (!responseCode) {
        responseCode = '0';
      }
    }

    if (data.success === true && statusValue === 'processing') {
      statusValue = 'successful';
    }

    if (!responseCode) {
      if (statusValue === 'successful') {
        responseCode = '0';
      } else if (statusValue === 'processing') {
        responseCode = '1088';
      } else if (statusValue === 'cancelled') {
        responseCode = '1043';
      } else if (statusValue === 'refunded' || statusValue === 'reversed') {
        responseCode = '0';
      } else if (statusValue === 'failed') {
        responseCode = '1000';
      }
    }

    return {
      status: statusValue,
      responseCode,
    };
  }

  private mapPayazaStatusToTransactionStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'successful': 'success',
      'success': 'success',
      'completed': 'success',
      'pending': 'pending',
      'processing': 'processing',
      'failed': 'failed',
      'declined': 'failed',
      'cancelled': 'cancelled',
      'reversed': 'refunded',
      'refunded': 'refunded',
      'approved': 'success',
      '1': 'success',
      '00': 'success',
      'chargeback': 'chargeback',
      'timeout': 'timeout',
    };
    return statusMap[status?.toLowerCase()] || 'processing';
  }

  private mapPayazaStatusToResponseCode(status: string): string {
    const lowerStatus = status?.toLowerCase();
    if (['successful', 'success', 'completed', 'approved', '1', '01', '00'].includes(lowerStatus)) {
      return '0';
    } else if (['failed', 'declined', 'error', 'denied', 'rejected'].includes(lowerStatus)) {
      return '1000';
    } else if (lowerStatus === 'cancelled') {
      return '1043';
    } else if (lowerStatus === 'refunded' || lowerStatus === 'reversed') {
      return '0';
    }
    return '1088';
  }

  private mapPayazaStatusToPayoutStatus(status: string): PayoutStatus {
    const statusMap: Record<string, PayoutStatus> = {
      'successful': PayoutStatus.COMPLETED,
      'success': PayoutStatus.COMPLETED,
      'completed': PayoutStatus.COMPLETED,
      'approved': PayoutStatus.COMPLETED,
      'pending': PayoutStatus.PROCESSING,
      'processing': PayoutStatus.PROCESSING,
      'failed': PayoutStatus.FAILED,
      'declined': PayoutStatus.FAILED,
      'cancelled': PayoutStatus.FAILED,
      '1': PayoutStatus.COMPLETED,
      '00': PayoutStatus.COMPLETED,
    };
    return statusMap[status?.toLowerCase()] || PayoutStatus.PROCESSING;
  }
}

