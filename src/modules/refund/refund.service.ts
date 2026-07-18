import { Injectable, NotFoundException, BadRequestException, ConflictException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Refund, RefundStatus, RefundType } from '@/entities/refund.entity';
import { PaymentTransaction } from '@/entities/payment-transaction.entity';
import { PaymentIntent } from '@/entities/payment-intent.entity';
import { LoggerService } from '@/common/services/logger.service';
import { TSPFactoryService } from '@/tsp/tsp-factory.service';
import { CreateRefundDto } from '@/dto/refund/create-refund.dto';
import { ApproveRefundDto, RefundAction } from '@/dto/refund/approve-refund.dto';
import { RefundDto } from '@/dto/refund/refund-response.dto';
import { ClientGrpc } from '@nestjs/microservices';
import { Inject } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { MerchantWebhookService } from '@/webhooks/merchant/merchant-webhook.service';
import { KafkaProducerService } from '@/events/kafka-producer.service';
import { RefundEvent } from '@/events/types/event.types';

interface WalletServiceGrpc {
  BlockAmount(data: any): any;
  ReleaseBlockedAmount(data: any): any;
  DebitBlockedAmount(data: any): any;
}

interface MerchantServiceGrpc {
  GetCustomer(data: any): any;
  GetMerchant(data: any): any;
  UpdateCustomerTransactionStats(data: any): any;
}

interface CommunicationServiceGrpc {
  SendNotification(data: any): any;
}

@Injectable()
export class RefundService implements OnModuleInit {
  private walletService: WalletServiceGrpc;
  private merchantService: MerchantServiceGrpc;
  private communicationService: CommunicationServiceGrpc;

  constructor(
    @InjectRepository(Refund)
    private readonly refundRepository: Repository<Refund>,
    
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepository: Repository<PaymentTransaction>,
    
    @InjectRepository(PaymentIntent)
    private readonly paymentIntentRepository: Repository<PaymentIntent>,
    
    private readonly logger: LoggerService,
    private readonly tspFactory: TSPFactoryService,
    private readonly merchantWebhookService: MerchantWebhookService,
    private readonly kafkaProducer: KafkaProducerService,
    
    @Inject('WALLET_SERVICE')
    private readonly walletClient: ClientGrpc,
    
    @Inject('MERCHANT_SERVICE')
    private readonly merchantClient: ClientGrpc,

    @Inject('COMMUNICATION_SERVICE')
    private readonly communicationClient: ClientGrpc,
  ) {}

  onModuleInit() {
    this.walletService = this.walletClient.getService<WalletServiceGrpc>('WalletService');
    this.merchantService = this.merchantClient.getService<MerchantServiceGrpc>('MerchantService');
    this.communicationService = this.communicationClient.getService<CommunicationServiceGrpc>('CommunicationService');
  }

  private async publishRefundEvent(
    refund: Refund,
    eventType: 'refund.created' | 'refund.approved' | 'refund.processing' | 'refund.completed' | 'refund.failed' | 'refund.rejected',
    processingTimeMs?: number
  ): Promise<void> {
    const event: RefundEvent = {
      eventId: `refund_event_${refund.id}_${Date.now()}`,
      eventType,
      timestamp: new Date().toISOString(),
      source: 'payment-engine',
      version: '1.0',
      refundId: refund.refundId,
      transactionId: refund.transactionId,
      merchantId: refund.merchantId,
      data: {
        amount: refund.amount,
        currency: refund.currency,
        status: refund.status,
        refundType: refund.refundType,
        reason: refund.reason,
        customerId: refund.customerId,
        externalRefundId: refund.externalRefundId,
        failureReason: refund.failureReason,
        processingTimeMs,
        metadata: {
          approvedBy: refund.approvedBy,
          approvalNotes: refund.approvalNotes,
        },
      },
    };

    await this.kafkaProducer.publishRefundEvent(event);
  }

  /**
   * Creates a new refund request
   * - Validates customer and transaction
   * - Checks merchant's auto_refund_enabled feature flag
   * - Blocks funds in merchant wallet
   * - If auto: Proceeds to TSP processing
   * - If manual: Waits for admin approval
   */
  /**
   * Creates multiple refunds in batch
   * Processes all refunds independently, returning both successes and failures
   */
  async createBatchRefund(
    merchantId: string,
    refunds: Array<{
      customerId: string;
      transactionId: string;
      reason: string;
    }>,
    requestId: string
  ): Promise<{
    successful: RefundDto[];
    failed: Array<{
      transactionId: string;
      customerId: string;
      error: string;
    }>;
    totalRequested: number;
    totalSuccessful: number;
    totalFailed: number;
  }> {
    this.logger.log(`Creating batch refund for merchant: ${merchantId}, count: ${refunds.length}`);

    const successful: RefundDto[] = [];
    const failed: Array<{ transactionId: string; customerId: string; error: string }> = [];

    for (let i = 0; i < refunds.length; i++) {
      const item = refunds[i];
      const itemRequestId = `${requestId}_batch_${i}`;

      try {
        const refund = await this.createRefund(merchantId, {
          customerId: item.customerId,
          transactionId: item.transactionId,
          reason: item.reason,
          requestId: itemRequestId
        });

        successful.push(refund);
      } catch (error) {
        this.logger.error(`Batch refund item failed: ${item.transactionId}`, error.message);
        failed.push({
          transactionId: item.transactionId,
          customerId: item.customerId,
          error: error.message || 'Refund creation failed'
        });
      }
    }

    this.logger.log(`Batch refund completed: ${successful.length} successful, ${failed.length} failed`);

    return {
      successful,
      failed,
      totalRequested: refunds.length,
      totalSuccessful: successful.length,
      totalFailed: failed.length
    };
  }

  /**
   * Creates a new refund request
   * - Validates customer and transaction
   * - Checks merchant's auto_refund_enabled feature flag
   * - Blocks funds in merchant wallet
   * - If auto: Proceeds to TSP processing
   * - If manual: Waits for admin approval
   */
  async createRefund(
    merchantId: string,
    createRefundDto: CreateRefundDto
  ): Promise<RefundDto> {
    const { customerId, transactionId, reason, requestId } = createRefundDto;
    const startTime = Date.now();

    this.logger.log(`Creating refund for transaction: ${transactionId}, customer: ${customerId}, merchant: ${merchantId}`);

    const existingRefund = await this.refundRepository.findOne({
      where: { requestId }
    });

    if (existingRefund) {
      this.logger.log(`Idempotent request detected: ${requestId}, returning existing refund: ${existingRefund.refundId}`);
      return this.mapRefundToDto(existingRefund);
    }

    await this.validateCustomer(customerId, merchantId);

    const transaction = await this.transactionRepository.findOne({
      where: { 
        transactionId,
        merchantId 
      },
      relations: ['intent']
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction ${transactionId} not found for merchant ${merchantId}`);
    }

    if (transaction.status !== 'success') {
      throw new BadRequestException(`Transaction ${transactionId} is not in success status. Current status: ${transaction.status}`);
    }

    const paymentIntent = transaction.intent || await this.paymentIntentRepository.findOne({
      where: { intentId: transaction.paymentIntentId }
    });

    if (!paymentIntent) {
      throw new NotFoundException(`Payment intent ${transaction.paymentIntentId} not found`);
    }

    if (paymentIntent.customerId !== customerId) {
      throw new BadRequestException(`Transaction ${transactionId} does not belong to customer ${customerId}`);
    }

    const transactionStatus = transaction.status as string;
    if (transactionStatus === 'refunded' || transactionStatus === 'partial_refund') {
      const existingRefundsCheck = await this.refundRepository.find({
        where: { 
          transactionId,
          status: RefundStatus.COMPLETED
        }
      });

      const totalRefundedCheck = existingRefundsCheck.reduce((sum, refund) => sum + Number(refund.amount), 0);
      if (totalRefundedCheck >= Number(transaction.amount)) {
        throw new ConflictException(`Transaction ${transactionId} has already been fully refunded`);
      }
    }

    const existingRefunds = await this.refundRepository.find({
      where: { 
        transactionId,
        status: RefundStatus.COMPLETED
      }
    });

    const totalRefunded = existingRefunds.reduce((sum, refund) => sum + Number(refund.amount), 0);
    const refundableAmount = Number(transaction.amount) - totalRefunded;

    if (refundableAmount <= 0) {
      throw new ConflictException(`Transaction ${transactionId} has already been fully refunded`);
    }

    const merchantConfig = await this.getMerchantConfig(merchantId);
    const autoProcess = merchantConfig.auto_refund_enabled || false;

    const refundId = this.generateRefundId();
    const autoCancelAt = new Date();
    autoCancelAt.setDate(autoCancelAt.getDate() + 2);
    
    const refund = this.refundRepository.create({
      refundId,
      merchantId,
      customerId,
      transactionId,
      paymentIntentId: transaction.paymentIntentId,
      amount: refundableAmount,
      originalAmount: transaction.amount,
      currency: transaction.currency,
      refundType: refundableAmount === Number(transaction.amount) ? RefundType.FULL : RefundType.PARTIAL,
      status: autoProcess ? RefundStatus.APPROVED : RefundStatus.PENDING_APPROVAL,
      autoProcess,
      tspProvider: transaction.tspProvider,
      reason,
      requestId,
      environment: process.env.NODE_ENV || 'sandbox',
      autoCancelAt,
      blockedAmount: 0,
      retryCount: 0
    });

    await this.refundRepository.save(refund);

    this.publishRefundEvent(refund, 'refund.created', Date.now() - startTime).catch(error =>
      this.logger.error(`Failed to publish refund created event: ${error.message}`)
    );

    this.logger.log(`Refund record created: ${refundId}, autoProcess: ${autoProcess}`);

    try {
      await this.blockMerchantFunds(merchantId, refundableAmount, transaction.currency, refundId, requestId, refund);

      if (autoProcess) {
        await this.processWithTSP(refund, transaction, requestId);
      } else {
        await this.sendNotification(merchantId, customerId, 'refund_pending_approval', refund);
      }

      return this.mapRefundToDto(refund);

    } catch (error) {
      this.logger.error(`Refund creation error: ${refundId}`, error.stack);
      
      refund.status = RefundStatus.FAILED;
      refund.failureReason = error.message || 'Refund creation failed';
      await this.refundRepository.save(refund);

      throw new BadRequestException(`Refund failed: ${error.message}`);
    }
  }

  /**
   * Approves or rejects a pending refund (Admin only)
   * - Validates refund is in pending_approval status
   * - If approved: Processes with TSP
   * - If rejected: Unblocks funds and notifies merchant
   */
  async approveRefund(
    refundId: string,
    approveDto: ApproveRefundDto,
    requestId: string
  ): Promise<RefundDto> {
    const { action, notes, approvedBy } = approveDto;

    const refund = await this.refundRepository.findOne({
      where: { refundId }
    });

    if (!refund) {
      throw new NotFoundException(`Refund ${refundId} not found`);
    }

    if (refund.status !== RefundStatus.PENDING_APPROVAL) {
      throw new BadRequestException(`Refund ${refundId} is not in pending_approval status. Current status: ${refund.status}`);
    }

    refund.approvedBy = approvedBy;
    refund.approvedAt = new Date();
    refund.approvalNotes = notes;

    if (action === RefundAction.APPROVE) {
      refund.status = RefundStatus.APPROVED;
      await this.refundRepository.save(refund);

      this.publishRefundEvent(refund, 'refund.approved').catch(error =>
        this.logger.error(`Failed to publish refund approved event: ${error.message}`)
      );

      this.logger.log(`Refund approved: ${refundId} by ${approvedBy}`);

      const transaction = await this.transactionRepository.findOne({
        where: { transactionId: refund.transactionId }
      });

      if (!transaction) {
        throw new NotFoundException(`Transaction ${refund.transactionId} not found`);
      }

      await this.processWithTSP(refund, transaction, requestId);
      await this.sendNotification(refund.merchantId, refund.customerId, 'refund_approved', refund);

    } else {
      refund.status = RefundStatus.REJECTED;
      await this.refundRepository.save(refund);

      this.publishRefundEvent(refund, 'refund.rejected').catch(error =>
        this.logger.error(`Failed to publish refund rejected event: ${error.message}`)
      );

      this.logger.log(`Refund rejected: ${refundId} by ${approvedBy}`);

      await this.unblockMerchantFunds(refund);
      await this.sendNotification(refund.merchantId, refund.customerId, 'refund_rejected', refund);
    }

    return this.mapRefundToDto(refund);
  }

  /**
   * Handles TSP webhook for refund completion
   * - Validates refund is in processing status
   * - If success: Unblocks and debits merchant wallet
   * - If failed: Unblocks funds only
   * - Updates customer stats and sends notifications
   */
  async handleTSPWebhook(
    refundId: string,
    webhookData: {
      status: 'completed' | 'failed';
      externalRefundId?: string;
      failureReason?: string;
      tspResponse?: any;
    }
  ): Promise<void> {
    const startTime = Date.now();
    const refund = await this.refundRepository.findOne({
      where: { refundId }
    });

    if (!refund) {
      this.logger.warn(`Webhook received for unknown refund: ${refundId}`);
      return;
    }

    if (refund.status !== RefundStatus.PROCESSING) {
      this.logger.warn(`Webhook received for refund in wrong status: ${refundId}, status: ${refund.status}`);
      return;
    }

    refund.externalRefundId = webhookData.externalRefundId;
    refund.tspResponse = webhookData.tspResponse;

    if (webhookData.status === 'completed') {
      refund.status = RefundStatus.COMPLETED;
      refund.completedAt = new Date();

      await this.refundRepository.save(refund);

      this.publishRefundEvent(refund, 'refund.completed', Date.now() - startTime).catch(error =>
        this.logger.error(`Failed to publish refund completed event: ${error.message}`)
      );

      await this.unblockAndDebitMerchantWallet(refund);

      const transaction = await this.transactionRepository.findOne({
        where: { transactionId: refund.transactionId }
      });

      if (transaction) {
        transaction.status = refund.refundType === RefundType.FULL ? 'refunded' : 'partial_refund';
        await this.transactionRepository.save(transaction);

        await this.updateCustomerTransactionStats(refund.customerId, refund.merchantId, transaction, 'refund');
      }

      await this.sendMerchantWebhook(refund, transaction);
      await this.sendNotification(refund.merchantId, refund.customerId, 'refund_completed', refund);

      this.logger.log(`Refund completed via TSP webhook: ${refundId}`);

    } else {
      refund.status = RefundStatus.FAILED;
      refund.failureReason = webhookData.failureReason || 'TSP refund failed';

      await this.refundRepository.save(refund);

      this.publishRefundEvent(refund, 'refund.failed', Date.now() - startTime).catch(error =>
        this.logger.error(`Failed to publish refund failed event: ${error.message}`)
      );

      await this.unblockMerchantFunds(refund);
      await this.sendNotification(refund.merchantId, refund.customerId, 'refund_failed', refund);

      this.logger.error(`Refund failed via TSP webhook: ${refundId}, reason: ${refund.failureReason}`);
    }
  }

  /**
   * Auto-cancels refunds that are pending approval beyond T+2 days
   * Called by cron job
   */
  async autoCancelExpiredRefunds(): Promise<number> {
    const expiredRefunds = await this.refundRepository.find({
      where: {
        status: RefundStatus.PENDING_APPROVAL,
      }
    });

    const now = new Date();
    let cancelledCount = 0;

    for (const refund of expiredRefunds) {
      if (refund.autoCancelAt && refund.autoCancelAt <= now) {
        refund.status = RefundStatus.CANCELLED;
        refund.failureReason = 'Auto-cancelled after T+2 days without approval';
        await this.refundRepository.save(refund);

        await this.unblockMerchantFunds(refund);
        await this.sendNotification(refund.merchantId, refund.customerId, 'refund_cancelled', refund);

        this.logger.log(`Auto-cancelled expired refund: ${refund.refundId}`);
        cancelledCount++;
      }
    }

    if (cancelledCount > 0) {
      this.logger.log(`Auto-cancelled ${cancelledCount} expired refunds`);
    }

    return cancelledCount;
  }

  async getRefund(refundId: string, merchantId: string): Promise<RefundDto> {
    const refund = await this.refundRepository.findOne({
      where: { 
        refundId,
        merchantId 
      }
    });

    if (!refund) {
      throw new NotFoundException(`Refund ${refundId} not found for merchant ${merchantId}`);
    }

    return this.mapRefundToDto(refund);
  }

  async listRefunds(
    merchantId: string,
    filters?: {
      customerId?: string;
      transactionId?: string;
      status?: RefundStatus;
      startDate?: Date;
      endDate?: Date;
      currency?: string;
    },
    pagination?: {
      page?: number;
      limit?: number;
    }
  ): Promise<{
    refunds: RefundDto[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const page = pagination?.page || 1;
    const limit = pagination?.limit || 20;
    const skip = (page - 1) * limit;

    const queryBuilder = this.refundRepository
      .createQueryBuilder('refund');

    // Only filter by merchantId if it's provided (for admin, empty merchantId means all refunds)
    if (merchantId && merchantId.trim() !== '') {
      queryBuilder.where('refund.merchantId = :merchantId', { merchantId });
    }

    if (filters?.customerId) {
      queryBuilder.andWhere('refund.customerId = :customerId', { customerId: filters.customerId });
    }

    if (filters?.transactionId) {
      queryBuilder.andWhere('refund.transactionId = :transactionId', { transactionId: filters.transactionId });
    }

    if (filters?.status) {
      queryBuilder.andWhere('refund.status = :status', { status: filters.status });
    }

    if (filters?.startDate) {
      queryBuilder.andWhere('refund.createdAt >= :startDate', { startDate: filters.startDate });
    }

    if (filters?.endDate) {
      queryBuilder.andWhere('refund.createdAt <= :endDate', { endDate: filters.endDate });
    }

    if (filters?.currency) {
      queryBuilder.andWhere('refund.currency = :currency', { currency: filters.currency });
    }

    const [refunds, total] = await queryBuilder
      .orderBy('refund.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

      console.log("Refunds ======== ", refunds);

    return {
      refunds: refunds.map(refund => this.mapRefundToDto(refund)),
      pagination: {
        page, 
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async cancelRefund(refundId: string, merchantId: string): Promise<RefundDto> {
    const refund = await this.refundRepository.findOne({
      where: { 
        refundId,
        merchantId 
      }
    });

    if (!refund) {
      throw new NotFoundException(`Refund ${refundId} not found for merchant ${merchantId}`);
    }

    if (refund.status !== RefundStatus.PENDING_APPROVAL && refund.status !== RefundStatus.APPROVED) {
      throw new BadRequestException(`Cannot cancel refund in ${refund.status} status`);
    }

    refund.status = RefundStatus.CANCELLED;
    await this.refundRepository.save(refund);

    await this.unblockMerchantFunds(refund);

    this.logger.log(`Refund cancelled: ${refundId}`);

    return this.mapRefundToDto(refund);
  }

  /**
   * Validates that customer exists and belongs to merchant
   */
  private async validateCustomer(customerId: string, merchantId: string): Promise<void> {
    try {
      const customerResponse: any = await firstValueFrom(
        this.merchantService.GetCustomer({
          customer_id: customerId,
          merchant_id: merchantId
        })
      );

      if (!customerResponse || !customerResponse.success) {
        throw new NotFoundException(`Customer ${customerId} not found for merchant ${merchantId}`);
      }

      this.logger.log(`Customer validated: ${customerId}`);
    } catch (error) {
      this.logger.error(`Customer validation failed: ${customerId}`, error.message);
      throw new NotFoundException(`Customer ${customerId} not found or inactive`);
    }
  }

  /**
   * Gets merchant configuration including auto_refund_enabled flag
   */
  private async getMerchantConfig(merchantId: string): Promise<any> {
    try {
      const merchantResponse: any = await firstValueFrom(
        this.merchantService.GetMerchant({
          merchant_id: merchantId
        })
      );

      if (!merchantResponse || !merchantResponse.success) {
        return { auto_refund_enabled: false };
      }

      return merchantResponse.merchant?.settings || { auto_refund_enabled: false };
    } catch (error) {
      this.logger.warn(`Failed to get merchant config: ${merchantId}, defaulting to manual approval`);
      return { auto_refund_enabled: false };
    }
  }

  /**
   * Blocks funds in merchant wallet
   * Creates a wallet transaction with type 'refund_block'
   */
  private async blockMerchantFunds(
    merchantId: string,
    amount: number,
    currency: string,
    refundId: string,
    requestId: string,
    refund: Refund
  ): Promise<void> {
    try {
      const walletResponse: any = await firstValueFrom(
        this.walletService.BlockAmount({
          merchant_id: merchantId,
          amount: amount,
          currency: currency,
          reference_id: refundId,
          block_reason: `Refund processing: ${refundId}`,
          request_id: `${requestId}_block`
        })
      );

      if (walletResponse && walletResponse.success) {
        refund.walletBlockTransactionId = walletResponse.block_id;
        refund.blockedAmount = walletResponse.blocked_amount;
        await this.refundRepository.save(refund);

        this.logger.log(`Merchant funds blocked: ${merchantId}, amount: ${walletResponse.blocked_amount} ${currency}, block_id: ${walletResponse.block_id}`);
      } else {
        throw new Error(walletResponse?.error_message || walletResponse?.message || 'Failed to block funds');
      }
    } catch (error) {
      this.logger.error(`Wallet block error for refund ${refundId}:`, error.message);
      throw new BadRequestException(`Cannot block funds: ${error.message}`);
    }
  }

  /**
   * Unblocks funds in merchant wallet
   * Releases the blocked amount back to available balance
   */
  private async unblockMerchantFunds(refund: Refund): Promise<void> {
    if (!refund.walletBlockTransactionId) {
      this.logger.warn(`No wallet block transaction to unblock for refund: ${refund.refundId}`);
      return;
    }

    try {
      const walletResponse: any = await firstValueFrom(
        this.walletService.ReleaseBlockedAmount({
          merchant_id: refund.merchantId,
          block_id: refund.walletBlockTransactionId,
          currency: refund.currency,
          release_reason: `Refund cancelled/failed: ${refund.refundId}`,
          request_id: `${refund.refundId}_release`
        })
      );

      if (walletResponse && walletResponse.success) {
        refund.blockedAmount = 0;
        await this.refundRepository.save(refund);

        this.logger.log(`Merchant funds unblocked: ${refund.merchantId}, amount: ${walletResponse.released_amount}, refund: ${refund.refundId}`);
      } else {
        this.logger.warn(`Wallet unblock failed for refund ${refund.refundId}: ${walletResponse?.error_message || walletResponse?.message || 'Unknown error'}`);
      }
    } catch (error) {
      this.logger.error(`Wallet unblock error for refund ${refund.refundId}:`, error.message);
    }
  }

  /**
   * Unblocks funds and debits from merchant wallet
   * Called when TSP confirms refund success
   */
  private async unblockAndDebitMerchantWallet(refund: Refund): Promise<void> {
    if (!refund.walletBlockTransactionId) {
      this.logger.warn(`No wallet block transaction to debit for refund: ${refund.refundId}`);
      return;
    }

    try {
      const walletResponse: any = await firstValueFrom(
        this.walletService.DebitBlockedAmount({
          merchant_id: refund.merchantId,
          block_id: refund.walletBlockTransactionId,
          currency: refund.currency,
          description: `Refund completed: ${refund.refundId}`,
          request_id: `${refund.refundId}_debit`
        })
      );

      if (walletResponse && walletResponse.success) {
        refund.walletDebitTransactionId = walletResponse.transaction_id;
        refund.blockedAmount = 0; // Amount is now debited, no longer blocked
        await this.refundRepository.save(refund);

        this.logger.log(`Merchant wallet debited: ${refund.merchantId}, amount: ${walletResponse.debited_amount} ${refund.currency}, balance_after: ${walletResponse.balance_after}, refund: ${refund.refundId}`);
      } else {
        this.logger.warn(`Wallet debit failed for refund ${refund.refundId}: ${walletResponse?.error_message || walletResponse?.message || 'Unknown error'}`);
      }
    } catch (error) {
      this.logger.error(`Wallet debit error for refund ${refund.refundId}:`, error.message);
    }
  }

  /**
   * Processes refund with TSP
   * Updates status to processing and calls TSP adapter
   */
  private async processWithTSP(
    refund: Refund,
    transaction: PaymentTransaction,
    requestId: string
  ): Promise<void> {
    try {
      const tspAdapter = await this.tspFactory.getTSPAdapter(
        transaction.tspProvider as any,
        refund.environment == 'production' ? 'production' : 'sandbox'
      );

      if (!tspAdapter) {
        throw new Error(`TSP adapter not found for provider: ${transaction.tspProvider}`);
      }

      refund.status = RefundStatus.PROCESSING;
      await this.refundRepository.save(refund);

      const tspResponse = await tspAdapter.refundPayment(
        transaction.externalTransactionId || transaction.transactionId,
        Number(refund.amount)
      );

      refund.tspResponse = tspResponse.providerResponse;

      if (tspResponse.success) {
        this.logger.log(`TSP refund initiated: ${refund.refundId}, waiting for webhook confirmation`);
      } else {
        refund.status = RefundStatus.FAILED;
        refund.failureReason = tspResponse.error || 'TSP refund initiation failed';
        await this.refundRepository.save(refund);

        await this.unblockMerchantFunds(refund);
        this.logger.error(`TSP refund failed: ${refund.refundId}, error: ${tspResponse.error}`);
      }

      await this.refundRepository.save(refund);

    } catch (error) {
      this.logger.error(`TSP processing error: ${refund.refundId}`, error.stack);
      
      refund.status = RefundStatus.FAILED;
      refund.failureReason = error.message || 'TSP processing failed';
      await this.refundRepository.save(refund);

      await this.unblockMerchantFunds(refund);
    }
  }

  /**
   * Updates customer transaction statistics with refund
   * Decrements customer's transaction totals (negative amount)
   */
  private async updateCustomerTransactionStats(
    customerId: string,
    merchantId: string,
    transaction: PaymentTransaction,
    type: 'refund'
  ): Promise<void> {
    try {
      const statsResponse: any = await firstValueFrom(
        this.merchantService.UpdateCustomerTransactionStats({
          customer_id: customerId,
          merchant_id: merchantId,
          currency: transaction.currency,
          amount: -Math.abs(Number(transaction.amount)),
          transaction_status: 'refunded',
          transaction_id: transaction.transactionId,
          payment_method: transaction.paymentMethod || 'unknown',
          transaction_date: new Date().toISOString()
        })
      );

      if (statsResponse && statsResponse.success) {
        this.logger.log(`Customer transaction stats updated: ${customerId}, type: ${type}`);
      } else {
        this.logger.warn(`Customer stats update failed: ${statsResponse?.message || 'Unknown error'}`);
      }
    } catch (error) {
      this.logger.error(`Customer stats update error:`, error.message);
    }
  }

  /**
   * Sends merchant webhook notification via communication service
   */
  private async sendMerchantWebhook(
    refund: Refund,
    transaction: PaymentTransaction | null
  ): Promise<void> {
    try {
      await this.sendNotification(
        refund.merchantId,
        refund.customerId,
        'refund_completed',
        refund
      );

      this.logger.log(`Refund webhook sent: ${refund.refundId}`);
    } catch (error) {
      this.logger.error(`Refund webhook error: ${refund.refundId}`, error.message);
    }
  }

  /**
   * Sends notification to communication service
   * Notifies customer and merchant about refund status changes
   */
  private async sendNotification(
    merchantId: string,
    customerId: string,
    notificationType: string,
    refund: Refund
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.communicationService.SendNotification({
          merchant_id: merchantId,
          customer_id: customerId,
          notification_type: notificationType,
          channel: ['email', 'sms'],
          template: notificationType,
          data: {
            refundId: refund.refundId,
            transactionId: refund.transactionId,
            amount: Number(refund.amount),
            currency: refund.currency,
            status: refund.status,
            reason: refund.reason
          }
        })
      );

      this.logger.log(`Notification sent: ${notificationType}, refund: ${refund.refundId}`);
    } catch (error) {
      this.logger.error(`Notification error: ${notificationType}, refund: ${refund.refundId}`, error.message);
    }
  }

  private mapRefundToDto(refund: Refund): RefundDto {
    return {
      refundId: refund.refundId,
      merchantId: refund.merchantId,
      customerId: refund.customerId,
      transactionId: refund.transactionId,
      paymentIntentId: refund.paymentIntentId,
      amount: Number(refund.amount),
      originalAmount: Number(refund.originalAmount),
      currency: refund.currency,
      refundType: refund.refundType,
      status: refund.status,
      tspProvider: refund.tspProvider,
      externalRefundId: refund.externalRefundId,
      reason: refund.reason,
      createdAt: refund.createdAt.toISOString(),
      completedAt: refund.completedAt?.toISOString(),
      failureReason: refund.failureReason,
      processingTimeMs: refund.processingTimeMs
    };
  }

  private generateRefundId(): string {
    return `refund_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }


  async getRefundStats(merchantId: string, startDate?: string, endDate?: string, currency?: string): Promise<any> {
    const buildBaseQuery = () => {
      const query = this.refundRepository.createQueryBuilder('refund');
      
      const conditions: string[] = [];
      const params: any = {};
      
      if (merchantId && merchantId.trim() !== '') {
        conditions.push('refund.merchantId = :merchantId');
        params.merchantId = merchantId;
      }
      
      if (startDate) {
        conditions.push('refund.createdAt >= :startDate');
        params.startDate = new Date(startDate);
      }
      if (endDate) {
        conditions.push('refund.createdAt <= :endDate');
        params.endDate = new Date(endDate);
      }
      if (currency) {
        conditions.push('refund.currency = :currency');
        params.currency = currency;
      }
      
      // Apply all conditions at once
      if (conditions.length > 0) {
        query.where(conditions.join(' AND '), params);
      }
      
      return query;
    };

    try {
      this.logger.log(`[getRefundStats] Calculating stats - merchantId: "${merchantId}", currency: "${currency}", startDate: "${startDate}", endDate: "${endDate}"`);
      
      const testQuery = this.refundRepository.createQueryBuilder('refund');
      if (merchantId && merchantId.trim() !== '') {
        testQuery.where('refund.merchantId = :merchantId', { merchantId });
      }
      const totalRefundsInDb = await testQuery.getCount();
      this.logger.log(`[getRefundStats] Total refunds in DB (no filters): ${totalRefundsInDb}`);
      
      const totalQuery = buildBaseQuery()
        .select('COUNT(refund.id)', 'count')
        .getRawOne()
        .then(result => {
          const count = parseInt(result.count) || 0;
          this.logger.log(`[getRefundStats] Total refunds after filters: ${count}`);
          return count;
        });

      const pendingQuery = buildBaseQuery()
        .select('COUNT(refund.id)', 'count')
        .andWhere('refund.status = :pendingStatus', { pendingStatus: RefundStatus.PENDING_APPROVAL })
        .getRawOne()
        .then(result => parseInt(result.count) || 0);

      const approvedQuery = buildBaseQuery()
        .select('COUNT(refund.id)', 'count')
        .andWhere('refund.status = :approvedStatus', { approvedStatus: RefundStatus.APPROVED })
        .getRawOne()
        .then(result => parseInt(result.count) || 0);

      const rejectedQuery = buildBaseQuery()
        .select('COUNT(refund.id)', 'count')
        .andWhere('refund.status = :rejectedStatus', { rejectedStatus: RefundStatus.REJECTED })
        .getRawOne()
        .then(result => parseInt(result.count) || 0);

      const processingQuery = buildBaseQuery()
        .select('COUNT(refund.id)', 'count')
        .andWhere('refund.status = :processingStatus', { processingStatus: RefundStatus.PROCESSING })
        .getRawOne()
        .then(result => parseInt(result.count) || 0);

      const completedQuery = buildBaseQuery()
        .select('COUNT(refund.id)', 'count')
        .andWhere('refund.status = :completedStatus', { completedStatus: RefundStatus.COMPLETED })
        .getRawOne()
        .then(result => parseInt(result.count) || 0);

      const failedQuery = buildBaseQuery()
        .select('COUNT(refund.id)', 'count')
        .andWhere('refund.status = :failedStatus', { failedStatus: RefundStatus.FAILED })
        .getRawOne()
        .then(result => parseInt(result.count) || 0);

      const cancelledQuery = buildBaseQuery()
        .select('COUNT(refund.id)', 'count')
        .andWhere('refund.status = :cancelledStatus', { cancelledStatus: RefundStatus.CANCELLED })
        .getRawOne()
        .then(result => parseInt(result.count) || 0);

      const totalAmountQuery = buildBaseQuery()
        .select('COALESCE(SUM(refund.amount), 0)', 'total')
        .getRawOne()
        .then(result => {
          const total = parseFloat(result.total) || 0;
          this.logger.log(`[getRefundStats] Total amount: ${total}`);
          return total;
        });

      const averageAmountQuery = buildBaseQuery()
        .select('COALESCE(AVG(refund.amount), 0)', 'avg')
        .andWhere('refund.status = :completedStatus', { completedStatus: RefundStatus.COMPLETED })
        .getRawOne()
        .then(result => parseFloat(result.avg) || 0);

      const averageProcessingTimeQuery = buildBaseQuery()
        .select('COALESCE(AVG(refund.processingTimeMs), 0)', 'avg')
        .andWhere('refund.processingTimeMs IS NOT NULL')
        .getRawOne()
        .then(result => parseFloat(result.avg) || 0);

      const [
        total,
        pending,
        approved,
        rejected,
        processing,
        completed,
        failed,
        cancelled,
        totalAmount,
        averageAmount,
        averageProcessingTime
      ] = await Promise.all([
        totalQuery,
        pendingQuery,
        approvedQuery,
        rejectedQuery,
        processingQuery,
        completedQuery,
        failedQuery,
        cancelledQuery,
        totalAmountQuery,
        averageAmountQuery,
        averageProcessingTimeQuery
      ]);

      this.logger.log(`[getRefundStats] Stats calculated - total: ${total}, completed: ${completed}, pending: ${pending}, processing: ${processing}, totalAmount: ${totalAmount}`);

      return {
        total,
        pending,
        approved,
        rejected,
        processing,
        completed,
        failed,
        cancelled,
        totalAmount,
        averageAmount,
        averageProcessingTime
      };
    } catch (error) {
      this.logger.error(`[getRefundStats] Error getting refund stats: ${error.message}`, error.stack);
      return {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        totalAmount: 0,
        averageAmount: 0,
        averageProcessingTime: 0
      };
    }
  }

  /**
   * Get refund analytics for a merchant (time-series data)
   */
  async getRefundAnalytics(
    merchantId: string, 
    startDate?: string, 
    endDate?: string, 
    granularity: 'day' | 'week' | 'month' = 'day'
  ): Promise<any> {
    const queryBuilder = this.refundRepository.createQueryBuilder('refund')
      .where('refund.merchantId = :merchantId', { merchantId });

    if (startDate) {
      queryBuilder.andWhere('refund.createdAt >= :startDate', { startDate: new Date(startDate) });
    }
    if (endDate) {
      queryBuilder.andWhere('refund.createdAt <= :endDate', { endDate: new Date(endDate) });
    }

    const refunds = await queryBuilder.getMany();

    // Group by time period
    const grouped = refunds.reduce((acc, refund) => {
      const date = new Date(refund.createdAt);
      let key: string;
      
      if (granularity === 'day') {
        key = date.toISOString().split('T')[0];
      } else if (granularity === 'week') {
        const startOfWeek = new Date(date);
        startOfWeek.setDate(date.getDate() - date.getDay());
        key = startOfWeek.toISOString().split('T')[0];
      } else {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }

      if (!acc[key]) {
        acc[key] = { count: 0, amount: 0, completed: 0, failed: 0 };
      }

      acc[key].count++;
      acc[key].amount += refund.amount;
      if (refund.status === RefundStatus.COMPLETED) acc[key].completed++;
      if (refund.status === RefundStatus.FAILED) acc[key].failed++;

      return acc;
    }, {} as Record<string, any>);

    const analytics = Object.entries(grouped).map(([date, data]) => ({
      date,
      ...data
    }));

    return { data: analytics, granularity };
  }

  /**
   * Export refunds to CSV format
   */
  async exportRefundsToCSV(merchantId: string, filters: {
    customerId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<string> {
    const queryBuilder = this.refundRepository.createQueryBuilder('refund')
      .where('refund.merchantId = :merchantId', { merchantId });

    if (filters.customerId) {
      queryBuilder.andWhere('refund.customerId = :customerId', { customerId: filters.customerId });
    }
    if (filters.status) {
      queryBuilder.andWhere('refund.status = :status', { status: filters.status });
    }
    if (filters.startDate) {
      queryBuilder.andWhere('refund.createdAt >= :startDate', { startDate: new Date(filters.startDate) });
    }
    if (filters.endDate) {
      queryBuilder.andWhere('refund.createdAt <= :endDate', { endDate: new Date(filters.endDate) });
    }

    const refunds = await queryBuilder.orderBy('refund.createdAt', 'DESC').getMany();

    // Generate CSV
    const headers = [
      'Refund ID',
      'Transaction ID',
      'Customer ID',
      'Amount',
      'Currency',
      'Status',
      'Type',
      'Reason',
      'Created At',
      'Completed At',
      'Failure Reason',
      'Processing Time (ms)'
    ];

    const rows = refunds.map(refund => [
      refund.refundId,
      refund.transactionId,
      refund.customerId,
      refund.amount.toString(),
      refund.currency,
      refund.status,
      refund.refundType,
      `"${refund.reason.replace(/"/g, '""')}"`,
      refund.createdAt.toISOString(),
      refund.completedAt?.toISOString() || '',
      refund.failureReason || '',
      refund.processingTimeMs?.toString() || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    return csvContent;
  }
}
