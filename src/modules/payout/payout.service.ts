import { Injectable, Logger, NotFoundException, BadRequestException, Inject, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { ClientGrpc } from '@nestjs/microservices';
import { v4 as uuidv4 } from 'uuid';
import { Payout, PayoutStatus, PayoutType } from '../../entities/payout.entity';
import { TSPFactoryService } from '../../tsp/tsp-factory.service';
import { SmartRoutingService } from '../smart-routing/smart-routing.service';
import { CreatePayoutDto, PayoutResponseDto, GetPayoutStatusDto, PayoutStatusResponseDto, ListPayoutsDto, RetryPayoutDto } from '../../dto/payout/payout.dto';
import { WalletServiceGrpc } from '../../types/grpc/wallet-service.types';
import { AuthenticatedGrpcService } from '../../grpc/authenticated-grpc.service';
import { KafkaProducerService } from '../../events/kafka-producer.service';
import { PayoutEvent } from '../../events/types/event.types';
import { ComparisonMetrics, PayoutDashboardAnalytics, PayoutPaymentsAnalyticsFilters, TimeSeriesPoint, TransactionSummary } from '../payment-transaction/types/all.types';

@Injectable()
export class PayoutService implements OnModuleInit {
  private readonly logger = new Logger(PayoutService.name);
  private walletService: WalletServiceGrpc;

  constructor(
    @InjectRepository(Payout)
    private readonly payoutRepository: Repository<Payout>,
    private readonly tspFactory: TSPFactoryService,
    private readonly smartRoutingService: SmartRoutingService,
    @Inject('WALLET_SERVICE')
    private readonly walletGrpcClient: ClientGrpc,
    private readonly authenticatedGrpc: AuthenticatedGrpcService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  onModuleInit() {
    this.walletService = this.authenticatedGrpc.wrapGrpcClient<WalletServiceGrpc>(
      this.walletGrpcClient,
      'WalletService',
      'wallet-service'
    );
  }

  private async publishPayoutEvent(
    payout: Payout,
    eventType: 'payout.created' | 'payout.processing' | 'payout.completed' | 'payout.failed',
    processingTimeMs?: number
  ): Promise<void> {
    const event: PayoutEvent = {
      eventId: `payout_event_${payout.id}_${Date.now()}`,
      eventType,
      timestamp: new Date().toISOString(),
      source: 'payment-engine',
      version: '1.0',
      payoutId: payout.payoutId,
      merchantId: payout.merchantId,
      data: {
        amount: payout.amount,
        currency: payout.currency,
        status: payout.status,
        payoutType: payout.payoutType,
        tspProvider: payout.tspProvider,
        beneficiaryAccount: payout.beneficiaryAccount,
        beneficiaryName: payout.beneficiaryName,
        beneficiaryIfsc: payout.beneficiaryIfsc,
        beneficiarySwift: payout.beneficiarySwift,
        beneficiaryIban: payout.beneficiaryIban,
        beneficiaryBankName: payout.bankName,
        beneficiaryMobile: payout.beneficiaryMobile,
        beneficiaryVpa: payout.beneficiaryVpa,
        processingFee: payout.processingFee,
        totalDebitedAmount: payout.totalDebitedAmount,
        externalPayoutId: payout.externalPayoutId,
        failureReason: payout.failureReason,
        processingTimeMs,
        metadata: {
          customerId: payout.customerId,
          purpose: payout.purpose,
          environment: payout.environment,
        },
      },
    };

    await this.kafkaProducer.publishPayoutEvent(event);
  }

  async createPayout(dto: CreatePayoutDto): Promise<PayoutResponseDto> {
    const startTime = Date.now();
    const requestId = dto.requestId || `req_${uuidv4()}`;
    
    try {
      let walletBalance;
      try {  
        walletBalance = await this.walletService.GetCurrencyWalletBalance({
          merchant_id: dto.merchantId,
          currency: dto.currency || 'USD',
          request_id: requestId,
        });

      } catch (error) {
        throw new BadRequestException(`Failed to connect to wallet service: ${error.message}`);
      }

      if (!walletBalance || !walletBalance.success || !walletBalance.wallet) {
        throw new BadRequestException(`Unable to fetch wallet balance: ${walletBalance?.error_message || walletBalance?.message || 'No response from wallet service'}`);
      }

      const totalDebitAmount = dto.amount;

      if (walletBalance.wallet.available_balance < totalDebitAmount) {
        throw new BadRequestException(
          `Insufficient wallet balance. Available: ${walletBalance.wallet.available_balance} ${dto.currency || 'USD'}, Required: ${totalDebitAmount} ${dto.currency || 'USD'}`
        );
      }

      const country = this.extractCountryFromPayoutDetails(dto);
      
      const routingDecision = await this.smartRoutingService.getRoutingDecision({
        merchantId: dto.merchantId.toString(),
        amount: dto.amount,
        currency: dto.currency || 'INR',
        paymentMethod: this.mapPayoutTypeToPaymentMethod(dto.payoutType),
        customerLocation: country,
        environment: dto.environment || 'sandbox',
      }, requestId);

      if (!routingDecision.selectedTSP) {
        throw new BadRequestException('No suitable payment provider available for this payout');
      }
      
      const payoutId = `payout_${Date.now()}_${uuidv4().split('-')[0]}`;
      
      const tspAdapter = await this.tspFactory.getTSPAdapter(
        routingDecision.selectedTSP as any,
        dto.environment || 'sandbox' as any
      );

      if (!tspAdapter) {
        throw new BadRequestException(`TSP adapter not available: ${routingDecision.selectedTSP}`);
      }
      
      const tspResponse = await tspAdapter.createPayout({
        payoutId,
        amount: dto.amount,
        currency: dto.currency || 'INR',
        country: country || dto.country || 'IN',
        beneficiaryAccount: dto.beneficiaryAccount,
        beneficiaryIban: dto.beneficiaryIban,
        beneficiaryIfsc: dto.beneficiaryIfsc,
        beneficiarySwift: dto.beneficiarySwift,
        beneficiaryBic: dto.beneficiaryBic,
        beneficiaryRoutingNumber: dto.beneficiaryRoutingNumber,
        beneficiaryBankCode: dto.beneficiaryBankCode,
        beneficiaryName: dto.beneficiaryName,
        beneficiaryEmail: dto.beneficiaryEmail,
        beneficiaryMobile: dto.beneficiaryMobile,
        beneficiaryAddress: dto.beneficiaryAddress,
        beneficiaryCity: dto.beneficiaryCity,
        beneficiaryState: dto.beneficiaryState,
        beneficiaryPostalCode: dto.beneficiaryPostalCode,
        beneficiaryDocumentId: dto.beneficiaryDocumentId,
        customerDocumentId: dto.customerDocumentId,
        beneficiaryVpa: dto.beneficiaryVpa,
        beneficiaryAccountType: dto.beneficiaryAccountType,
        beneficiaryTag: dto.beneficiaryTag,
        beneficiaryMemo: dto.beneficiaryMemo,
        bankName: dto.bankName,
        beneficiaryBankName: dto.beneficiaryBankName,
        customerId: dto.customerId,
        customerEmail: dto.customerEmail,
        customerPhone: dto.customerPhone,
        payoutType: dto.payoutType,
        purpose: dto.purpose,
      });

      if (!tspResponse.success) {
        this.logger.error(`[${requestId}] TSP payout creation failed: ${tspResponse.message}`);
        throw new BadRequestException(`Payout creation failed: ${tspResponse.message}`);
      }

      const estimatedCompletionMinutes = this.getEstimatedCompletionTime(dto.payoutType);
      const estimatedCompletion = new Date(Date.now() + estimatedCompletionMinutes * 60 * 1000);
      
      const payout = this.payoutRepository.create({
        payoutId,
        merchantId: dto.merchantId.toString(),
        customerId: dto.customerId,
        customerEmail: dto.customerEmail,
        customerPhone: dto.customerPhone,
        beneficiaryAccount: dto.beneficiaryAccount,
        beneficiaryIfsc: dto.beneficiaryIfsc,
        beneficiarySwift: dto.beneficiarySwift,
        beneficiaryName: dto.beneficiaryName,
        beneficiaryMobile: dto.beneficiaryMobile,
        beneficiaryVpa: dto.beneficiaryVpa,
        bankName: dto.bankName,
        amount: dto.amount,
        currency: dto.currency || 'INR',
        payoutType: dto.payoutType,
        purpose: dto.purpose,
        description: dto.description,
        status: PayoutStatus.PROCESSING,
        tspProvider: routingDecision.selectedTSP,
        externalPayoutId: tspResponse.providerTransactionId,
        processingFee: 0,
        totalDebitedAmount: dto.amount,
        estimatedCompletion,
        requestId,
        environment: dto.environment || 'sandbox',
        webhookUrl: dto.webhookUrl,
        metadata: {
          ...dto.metadata,
          bankCode: dto.beneficiaryBankCode,
        },
        tspResponse: tspResponse.providerResponse,
        responseTime: Date.now() - startTime,
      });

      await this.payoutRepository.save(payout);

      const blockResult = await this.walletService.BlockAmount({
        merchant_id: dto.merchantId,
        amount: payout.totalDebitedAmount,
        currency: payout.currency,
        reference_id: payoutId,
        block_reason: `Payout ${payoutId}: ${dto.purpose}`,
        request_id: requestId,
      });

      if (!blockResult.success) {
        await this.payoutRepository.update(
          { payoutId },
          { 
            status: PayoutStatus.FAILED,
            failureReason: 'Balance blocking failed: ' + blockResult.message
          }
        );

        throw new BadRequestException('Failed to block balance for payout');
      }


      payout.walletTransactionId = blockResult.block_id;
      payout.metadata = { ...payout.metadata, blockId: blockResult.block_id };
      await this.payoutRepository.save(payout);

      this.publishPayoutEvent(payout, 'payout.created', Date.now() - startTime).catch(error =>
        this.logger.error(`Failed to publish payout created event: ${error.message}`)
      );

      return {
        payoutId: payout.payoutId,
        merchantId: payout.merchantId,
        amount: payout.amount,
        currency: payout.currency,
        status: payout.status,
        tspProvider: payout.tspProvider,
        externalPayoutId: payout.externalPayoutId,
        processingFee: payout.processingFee,
        totalDebitedAmount: payout.totalDebitedAmount,
        estimatedCompletion: payout.estimatedCompletion,
        createdAt: payout.createdAt,
        metadata: payout.metadata,
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(`[${requestId}] Payout creation failed (${processingTime}ms):`, error);
      throw error;
    }
  }

  async getPayoutStatus(dto: GetPayoutStatusDto): Promise<PayoutStatusResponseDto> {
    const { payoutId, requestId } = dto;

    try {
      this.logger.log(`[${requestId}] Getting payout status for ${payoutId}`);

      const payout = await this.payoutRepository.findOne({
        where: { payoutId },
      });

      if (!payout) {
        throw new NotFoundException(`Payout ${payoutId} not found`);
      }

      if (payout.status === PayoutStatus.PROCESSING) {
        const tspAdapter = await this.tspFactory.getTSPAdapter(
          payout.tspProvider as any,
          payout.environment as any
        );
        
        if (tspAdapter) {
          const tspStatus = await tspAdapter.verifyPayment(payout.externalPayoutId);

          if (tspStatus.status !== payout.status) {
            const mappedStatus = this.mapTspStatusToPayoutStatus(tspStatus.status);
            payout.status = mappedStatus;
            
            if (mappedStatus === PayoutStatus.COMPLETED) {
              payout.completedAt = new Date();
            } else if (mappedStatus === PayoutStatus.FAILED) {
              payout.failureReason = tspStatus.message;
            }
            await this.payoutRepository.save(payout);
          }
        }
      }

      return {
        payoutId: payout.payoutId,
        merchantId: payout.merchantId,
        amount: payout.amount,
        currency: payout.currency,
        status: payout.status,
        tspProvider: payout.tspProvider,
        externalPayoutId: payout.externalPayoutId,
        bankReferenceNumber: payout.bankReferenceNumber,
        processingFee: payout.processingFee,
        failureReason: payout.failureReason,
        completedAt: payout.completedAt,
        createdAt: payout.createdAt,
      };

    } catch (error) {
      this.logger.error(`[${requestId}] Failed to get payout status:`, error);
      throw error;
    }
  }

  /**
   * Create a manual payment with enhanced verification
   */
  async createManualPayment(dto: {
    merchantId: string;
    orderId: string;
    amount: number;
    currency: string;
    paymentMethod: string;
    customerName: string;
    bankReferenceUtr: string;
    reasonForManualPayment: string;
    requestId?: string;
  }): Promise<{
    success: boolean;
    message: string;
    paymentId: string;
    status: string;
    createdAt: string;
    errorMessage?: string;
  }> {
    const startTime = Date.now();
    const requestId = dto.requestId || `req_${uuidv4()}`;
    
    try {
      this.logger.log(`Creating manual payment for merchant ${dto.merchantId}, order ${dto.orderId}, amount ${dto.amount} ${dto.currency}`);

      // Validate required fields
      if (!dto.merchantId || !dto.orderId || !dto.amount || !dto.customerName || !dto.reasonForManualPayment) {
        throw new BadRequestException('Missing required fields for manual payment creation');
      }

      if (dto.amount <= 0) {
        throw new BadRequestException('Amount must be greater than 0');
      }

      // Generate unique payment ID
      const paymentId = `manual_payment_${Date.now()}_${uuidv4().split('-')[0]}`;
      
      // Create manual payment record
      const manualPayment = new Payout();
      manualPayment.payoutId = paymentId;
      manualPayment.merchantId = dto.merchantId;
      manualPayment.customerId = `manual_${dto.orderId}`;
      manualPayment.customerEmail = `manual_${dto.orderId}@manual.com`;
      manualPayment.customerPhone = '';
      manualPayment.beneficiaryAccount = '';
      manualPayment.beneficiaryIfsc = '';
      manualPayment.beneficiarySwift = '';
      manualPayment.beneficiaryName = dto.customerName;
      manualPayment.beneficiaryMobile = '';
      manualPayment.beneficiaryVpa = '';
      manualPayment.bankName = '';
      manualPayment.amount = dto.amount;
      manualPayment.currency = dto.currency || 'INR';
      // Map payment method from form to PayoutType enum
      const paymentMethodMap: Record<string, PayoutType> = {
        'bank_transfer': PayoutType.BANK_TRANSFER,
        'cash_deposit': PayoutType.BANK_TRANSFER, // Cash deposit still goes through bank
        'cheque': PayoutType.BANK_TRANSFER, // Cheque also goes through bank
        'government_treasury': PayoutType.BANK_TRANSFER, // Government treasury via bank
        'upi': PayoutType.UPI,
        'imps': PayoutType.IMPS,
        'neft': PayoutType.NEFT,
        'rtgs': PayoutType.RTGS,
      };
      const payoutType = paymentMethodMap[dto.paymentMethod?.toLowerCase()] || PayoutType.BANK_TRANSFER;
      
      manualPayment.payoutType = payoutType;
      manualPayment.purpose = 'MANUAL_PAYMENT';
      manualPayment.description = `Manual payment for order ${dto.orderId}. Reason: ${dto.reasonForManualPayment}`;
      manualPayment.status = PayoutStatus.PROCESSING;
      manualPayment.tspProvider = 'manual';
      manualPayment.externalPayoutId = dto.bankReferenceUtr || '';
      manualPayment.processingFee = 0;
      manualPayment.totalDebitedAmount = dto.amount;
      manualPayment.requestId = requestId;
      manualPayment.estimatedCompletion = null;
      manualPayment.failureReason = '';
      manualPayment.createdAt = new Date();
      manualPayment.completedAt = null;
      manualPayment.bankReferenceNumber = dto.bankReferenceUtr || '';
      manualPayment.metadata = {
        orderId: dto.orderId,
        reasonForManualPayment: dto.reasonForManualPayment,
        paymentMethod: dto.paymentMethod,
        originalPaymentMethod: dto.paymentMethod, // Store original form value
        manualPaymentId: paymentId,
        requestId: requestId,
        createdBy: 'admin', // This should come from authentication context
        verificationRequired: true,
        isManualPayment: true,
      };

      await this.payoutRepository.save(manualPayment);

      this.logger.log(`Manual payment created successfully: ${paymentId} in ${Date.now() - startTime}ms`);

      return {
        success: true,
        message: 'Manual payment created successfully',
        paymentId: manualPayment.payoutId,
        status: manualPayment.status,
        createdAt: manualPayment.createdAt.toISOString(),
      };

    } catch (error) {
      this.logger.error(`Failed to create manual payment: ${error.message}`, error.stack);
      
      return {
        success: false,
        message: 'Failed to create manual payment',
        paymentId: '',
        status: 'failed',
        createdAt: new Date().toISOString(),
        errorMessage: error.message,
      };
    }
  }

  async listPayouts(dto: ListPayoutsDto) {
    const {
      merchantId,
      status,
      currency,
      payoutType,
      tspProvider,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = dto;

    const queryBuilder = this.payoutRepository
      .createQueryBuilder('payout')
      .where('payout.merchantId = :merchantId', { merchantId: merchantId.toString() });

    if (status) {
      queryBuilder.andWhere('payout.status = :status', { status });
    }

    if (currency) {
      queryBuilder.andWhere('payout.currency = :currency', { currency: currency.toUpperCase() });
    }

    if (payoutType) {
      queryBuilder.andWhere('payout.payoutType = :payoutType', { payoutType });
    }

    if (tspProvider) {
      queryBuilder.andWhere('payout.tspProvider = :tspProvider', { tspProvider });
    }

    if (startDate && endDate) {
      queryBuilder.andWhere('payout.createdAt BETWEEN :startDate AND :endDate', {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      });
    }

    const [payouts, total] = await queryBuilder
      .orderBy('payout.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      payouts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async retryPayout(dto: RetryPayoutDto): Promise<PayoutResponseDto> {
    const { payoutId, forceTsp, requestId } = dto;

    try {
      this.logger.log(`[${requestId}] Retrying payout ${payoutId}`);

      const payout = await this.payoutRepository.findOne({
        where: { payoutId },
      });

      if (!payout) {
        throw new NotFoundException(`Payout ${payoutId} not found`);
      }

      if (payout.status !== PayoutStatus.FAILED) {
        throw new BadRequestException(`Cannot retry payout with status: ${payout.status}`);
      }

      const retryPayoutDto: CreatePayoutDto = {
        merchantId: payout.merchantId,
        beneficiaryAccount: payout.beneficiaryAccount,
        beneficiaryIfsc: payout.beneficiaryIfsc,
        beneficiarySwift: payout.beneficiarySwift,
        beneficiaryName: payout.beneficiaryName,
        beneficiaryMobile: payout.beneficiaryMobile,
        beneficiaryVpa: payout.beneficiaryVpa,
        bankName: payout.bankName,
        amount: payout.amount,
        currency: payout.currency,
        payoutType: payout.payoutType,
        purpose: payout.purpose,
        description: `Retry of ${payoutId}: ${payout.description}`,
        webhookUrl: payout.webhookUrl,
        metadata: { ...payout.metadata, retryOf: payoutId },
        requestId,
        environment: payout.environment,
      };

      await this.payoutRepository.update(
        { payoutId },
        {
          retryCount: payout.retryCount + 1,
          lastRetryAt: new Date(),
        }
      );

      return await this.createPayout(retryPayoutDto);

    } catch (error) {
      this.logger.error(`[${requestId}] Failed to retry payout:`, error);
      throw error;
    }
  }

  async handlePayoutWebhook(payload: any): Promise<void> {
    const startTime = Date.now();
    
    try {
      const { payoutId, status, bankReferenceNumber, failureReason } = payload;

      this.logger.log(`Handling payout webhook for ${payoutId}: ${status}`);

      const payout = await this.payoutRepository.findOne({
        where: { externalPayoutId: payoutId },
      });

      if (!payout) {
        this.logger.warn(`Payout not found for external ID: ${payoutId}`);
        return;
      }

      const updateData: Partial<Payout> = {
        status: this.mapWebhookStatusToPayoutStatus(status),
      };

      if (status === 'completed' || status === 'success') {
        updateData.completedAt = new Date();
        updateData.bankReferenceNumber = bankReferenceNumber;
      } else if (status === 'failed') {
        updateData.failureReason = failureReason;
      }

      await this.payoutRepository.update({ payoutId: payout.payoutId }, updateData);

      const updatedPayout = await this.payoutRepository.findOne({
        where: { payoutId: payout.payoutId },
      });

      if (updatedPayout) {
        const eventType = status === 'completed' || status === 'success' 
          ? 'payout.completed' 
          : status === 'failed' 
          ? 'payout.failed' 
          : 'payout.processing';

        this.publishPayoutEvent(updatedPayout, eventType, Date.now() - startTime).catch(error =>
          this.logger.error(`Failed to publish payout webhook event: ${error.message}`)
        );
      }

      this.logger.log(`Payout ${payout.payoutId} updated to status: ${updateData.status}`);

    } catch (error) {
      this.logger.error('Failed to handle payout webhook:', error);
    }
  }


  private extractCountryFromPayoutDetails(dto: CreatePayoutDto): string {
    const normalizeCountry = (country?: string): string | undefined => {
      if (!country) {
        return undefined;
      }
      const trimmed = country.trim();
      if (!trimmed) {
        return undefined;
      }
      if (trimmed.length === 2) {
        return trimmed.toUpperCase();
      }
      if (trimmed.length === 3) {
        return trimmed.toUpperCase();
      }
      return trimmed.slice(0, 2).toUpperCase();
    };

    const explicitCountry =
      normalizeCountry(dto.country) ||
      normalizeCountry(dto.metadata?.country) ||
      normalizeCountry(dto.metadata?.beneficiaryCountry);

    if (explicitCountry) {
      return explicitCountry;
    }

    const currency = dto.currency?.toUpperCase();

    const currencyToCountry: Record<string, string> = {
      INR: 'IN',
      USD: 'US',
      EUR: 'DE',
      GBP: 'GB',
      AED: 'AE',
      SGD: 'SG',
      AUD: 'AU',
      CAD: 'CA',
      NGN: 'NG',
      GHS: 'GH',
      KES: 'KE',
      TZS: 'TZ',
      UGX: 'UG',
      XAF: 'CM',
      XOF: 'BJ',
      ZAR: 'ZA',
    };

    if (currency && currencyToCountry[currency]) {
      return currencyToCountry[currency];
    }

    if (currency === 'INR') {
      return 'IN';
    }

    if ((!currency || currency === 'INR') && dto.beneficiaryVpa) {
      return 'IN';
    }

    if ((!currency || currency === 'INR') && dto.beneficiaryIfsc && dto.beneficiaryIfsc.match(/^[A-Z]{4}0[A-Z0-9]{6}$/)) {
      return 'IN';
    }

    return 'US';
  }

  private mapPayoutTypeToPaymentMethod(payoutType: PayoutType): string {
    const mapping = {
      [PayoutType.UPI]: 'upi',
      [PayoutType.IMPS]: 'imps',
      [PayoutType.NEFT]: 'neft',
      [PayoutType.RTGS]: 'rtgs',
      [PayoutType.BANK_TRANSFER]: 'bank_transfer',
      [PayoutType.CRYPTO]: 'crypto',
    };
    return mapping[payoutType] || 'bank_transfer';
  }

  private getEstimatedCompletionTime(payoutType: PayoutType): number {
    const timeInMinutes = {
      [PayoutType.UPI]: 5,
      [PayoutType.IMPS]: 30,
      [PayoutType.NEFT]: 240,
      [PayoutType.RTGS]: 120,
      [PayoutType.BANK_TRANSFER]: 1440,
      [PayoutType.CRYPTO]: 30,
    };
    return timeInMinutes[payoutType] || 1440;
  }

  async listPayoutsByCustomer(dto: any) {
    const { merchantId, customerId, page = 1, limit = 20 } = dto;

    const queryBuilder = this.payoutRepository
      .createQueryBuilder('payout')
      .where('payout.merchantId = :merchantId', { merchantId: merchantId.toString() })
      .andWhere('payout.customerId = :customerId', { customerId });

    const [payouts, total] = await queryBuilder
      .orderBy('payout.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      payouts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private mapWebhookStatusToPayoutStatus(webhookStatus: string): PayoutStatus {
    const statusMapping = {
      'success': PayoutStatus.COMPLETED,
      'completed': PayoutStatus.COMPLETED,
      'failed': PayoutStatus.FAILED,
      'processing': PayoutStatus.PROCESSING,
      'pending': PayoutStatus.PROCESSING,
      'cancelled': PayoutStatus.CANCELLED,
      'reversed': PayoutStatus.REVERSED,
    };
    return statusMapping[webhookStatus.toLowerCase()] || PayoutStatus.PROCESSING;
  }

  async getAvailablePayoutMethods(): Promise<any> {
    return {
      success: true,
      message: 'Payout methods retrieved successfully',
      data: [
        {
          methodId: 'bank_account_inr',
          displayName: 'Bank Account Transfer (INR)',
          description: 'Standard bank account transfer via NEFT/RTGS/IMPS for Indian banks',
          supportedCurrencies: ['INR'],
          supportedCountries: ['IN'],
          estimatedTime: '5 minutes - 24 hours',
          minAmount: 10,
          maxAmount: 1000000,
          feePercentage: 0.2,
          fixedFee: 5,
          isActive: true,
          requiredFields: [
            {
              fieldName: 'beneficiaryAccount',
              label: 'Beneficiary Account Number',
              type: 'text',
              required: true,
              placeholder: 'Enter bank account number',
              pattern: '^[0-9]{9,18}$',
              validationMessage: 'Account number must be 9-18 digits',
              minLength: 9,
              maxLength: 18,
            },
            {
              fieldName: 'beneficiaryIfsc',
              label: 'IFSC Code',
              type: 'text',
              required: true,
              placeholder: 'e.g., HDFC0001234',
              pattern: '^[A-Z]{4}0[A-Z0-9]{6}$',
              validationMessage: 'IFSC code must be 11 characters',
              minLength: 11,
              maxLength: 11,
            },
            {
              fieldName: 'beneficiaryName',
              label: 'Beneficiary Name',
              type: 'text',
              required: true,
              placeholder: 'Account holder full name',
              minLength: 2,
              maxLength: 100,
            },
            {
              fieldName: 'beneficiaryMobile',
              label: 'Beneficiary Mobile',
              type: 'tel',
              required: true,
              placeholder: '+91XXXXXXXXXX',
              pattern: '^\\+91[6-9][0-9]{9}$',
              validationMessage: 'Mobile number must be in format +91XXXXXXXXXX',
            },
            {
              fieldName: 'bankName',
              label: 'Bank Name',
              type: 'text',
              required: false,
              placeholder: 'e.g., HDFC Bank',
            },
            {
              fieldName: 'payoutType',
              label: 'Transfer Type',
              type: 'select',
              required: true,
              options: ['IMPS', 'NEFT', 'RTGS'],
            },
            {
              fieldName: 'purpose',
              label: 'Purpose',
              type: 'text',
              required: true,
              placeholder: 'Reason for payout',
              minLength: 3,
              maxLength: 200,
            },
          ],
        },
        {
          methodId: 'upi',
          displayName: 'UPI Transfer',
          description: 'Instant UPI-based transfers using VPA',
          supportedCurrencies: ['INR'],
          supportedCountries: ['IN'],
          estimatedTime: '5-10 minutes',
          minAmount: 1,
          maxAmount: 100000,
          feePercentage: 0.1,
          fixedFee: 0,
          isActive: true,
          requiredFields: [
            {
              fieldName: 'beneficiaryVpa',
              label: 'UPI ID / VPA',
              type: 'text',
              required: true,
              placeholder: 'user@upi',
              pattern: '^[\\w.-]+@[\\w.-]+$',
              validationMessage: 'Enter valid UPI ID',
            },
            {
              fieldName: 'beneficiaryName',
              label: 'Beneficiary Name',
              type: 'text',
              required: true,
              placeholder: 'Account holder name',
              minLength: 2,
              maxLength: 100,
            },
            {
              fieldName: 'purpose',
              label: 'Purpose',
              type: 'text',
              required: true,
              placeholder: 'Reason for payout',
              minLength: 3,
              maxLength: 200,
            },
          ],
        },
        {
          methodId: 'bank_account_international',
          displayName: 'International Bank Transfer',
          description: 'Cross-border bank transfers via SWIFT',
          supportedCurrencies: ['USD', 'EUR', 'GBP', 'AED'],
          supportedCountries: ['US', 'GB', 'AE', 'SG', 'AU', 'CA'],
          estimatedTime: '1-3 business days',
          minAmount: 100,
          maxAmount: 100000,
          feePercentage: 0.5,
          fixedFee: 25,
          isActive: true,
          requiredFields: [
            {
              fieldName: 'beneficiaryAccount',
              label: 'Account Number / IBAN',
              type: 'text',
              required: true,
              placeholder: 'Enter account number or IBAN',
              minLength: 8,
              maxLength: 34,
            },
            {
              fieldName: 'beneficiarySwift',
              label: 'SWIFT/BIC Code',
              type: 'text',
              required: true,
              placeholder: 'e.g., HDFCINBB',
              pattern: '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$',
              validationMessage: 'Enter valid SWIFT/BIC code',
              minLength: 8,
              maxLength: 11,
            },
            {
              fieldName: 'beneficiaryName',
              label: 'Beneficiary Name',
              type: 'text',
              required: true,
              placeholder: 'Full name as per bank records',
              minLength: 2,
              maxLength: 100,
            },
            {
              fieldName: 'bankName',
              label: 'Bank Name',
              type: 'text',
              required: true,
              placeholder: 'Beneficiary bank name',
              minLength: 2,
              maxLength: 100,
            },
            {
              fieldName: 'purpose',
              label: 'Purpose',
              type: 'text',
              required: true,
              placeholder: 'Reason for international transfer',
              minLength: 3,
              maxLength: 200,
            },
          ],
        },
        {
          methodId: 'crypto_wallet',
          displayName: 'Cryptocurrency Wallet',
          description: 'Direct cryptocurrency transfers to wallet addresses',
          supportedCurrencies: ['BTC', 'ETH', 'USDT', 'USDC'],
          supportedCountries: ['GLOBAL'],
          estimatedTime: '10-30 minutes',
          minAmount: 10,
          maxAmount: 50000,
          feePercentage: 0.3,
          fixedFee: 2,
          isActive: true,
          requiredFields: [
            {
              fieldName: 'beneficiaryAccount',
              label: 'Wallet Address',
              type: 'text',
              required: true,
              placeholder: 'Enter cryptocurrency wallet address',
              pattern: '^(0x[a-fA-F0-9]{40}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{39,59})$',
              validationMessage: 'Enter valid wallet address',
              minLength: 26,
              maxLength: 62,
            },
            {
              fieldName: 'beneficiaryName',
              label: 'Beneficiary Name',
              type: 'text',
              required: true,
              placeholder: 'Wallet owner name',
              minLength: 2,
              maxLength: 100,
            },
            {
              fieldName: 'currency',
              label: 'Cryptocurrency',
              type: 'select',
              required: true,
              options: ['BTC', 'ETH', 'USDT', 'USDC'],
            },
            {
              fieldName: 'purpose',
              label: 'Purpose',
              type: 'text',
              required: true,
              placeholder: 'Reason for crypto payout',
              minLength: 3,
              maxLength: 200,
            },
          ],
        },
      ],
      error: null,
    };
  }

  async getPayoutStats(merchantId: string, fromDate?: string, toDate?: string, requestId?: string, currency?: string): Promise<any> {
    const reqId = requestId || `req_${uuidv4()}`;
    
    try {
      this.logger.log(`[${reqId}] Fetching payout stats for merchant ${merchantId}`);

      const where: any = { merchantId };
      if (currency) {
        where.currency = currency;
      }

      if (fromDate && toDate) {
        where.createdAt = Between(new Date(fromDate), new Date(toDate));
      }

      const payouts = await this.payoutRepository.find({ where });

      const stats = {
        totalPayouts: payouts.length,
        completedPayouts: payouts.filter(p => p.status === PayoutStatus.COMPLETED).length,
        pendingPayouts: payouts.filter(p => p.status === PayoutStatus.PROCESSING).length,
        failedPayouts: payouts.filter(p => p.status === PayoutStatus.FAILED || p.status === PayoutStatus.CANCELLED).length,
        totalAmount: payouts.reduce((sum, p) => sum + Number(p.amount), 0),
        completedAmount: payouts.filter(p => p.status === PayoutStatus.COMPLETED).reduce((sum, p) => sum + Number(p.amount), 0),
        pendingAmount: payouts.filter(p => p.status === PayoutStatus.PROCESSING).reduce((sum, p) => sum + Number(p.amount), 0),
        totalFees: payouts.reduce((sum, p) => sum + Number(p.processingFee || 0), 0),
        successRate: payouts.length > 0 ? (payouts.filter(p => p.status === PayoutStatus.COMPLETED).length / payouts.length) * 100 : 0,
        currency: payouts.length > 0 ? payouts[0].currency : 'USD',
        payoutsByMethod: payouts.reduce((acc, p) => {
          acc[p.payoutType] = (acc[p.payoutType] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        payoutsByStatus: payouts.reduce((acc, p) => {
          acc[p.status] = (acc[p.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      };

      this.logger.log(`[${reqId}] Stats calculated: ${stats.totalPayouts} payouts, ${stats.completedPayouts} completed`);

      return {
        success: true,
        stats,
        error: null,
      };
    } catch (error) {
      this.logger.error(`[${reqId}] Failed to get payout stats: ${error.message}`, error.stack);
      return {
        success: false,
        stats: null,
        error: error.message,
      };
    }
  }

  async getTotalTransactions(merchantId?: string): Promise<number> {
    const queryBuilder = this.payoutRepository
      .createQueryBuilder('payout')
      .select('COUNT(*)', 'total');
    if (merchantId) {
      queryBuilder.where('payout.merchantId = :merchantId', { merchantId });
    }
    const result = await queryBuilder.getRawOne();
    return result?.total ? parseInt(result.total) : 0;
  }

  async getTransactionSuccessRate(
    merchantId?: string,
    options?: { startDate?: Date; endDate?: Date }
  ): Promise<number> {
    const queryBuilder = this.payoutRepository
      .createQueryBuilder('payout')
      .select('COUNT(*)', 'total')
      .addSelect(
        `SUM(CASE WHEN payout.status = 'success' THEN 1 ELSE 0 END)`,
        'successful'
      );

    if (merchantId) {
      queryBuilder.where('payout.merchantId = :merchantId', { merchantId: parseInt(merchantId) });
    }

    if (options?.startDate) {
      queryBuilder.andWhere('payout.createdAt >= :startDate', { startDate: options.startDate });
    }

    if (options?.endDate) {
      queryBuilder.andWhere('payout.createdAt <= :endDate', { endDate: options.endDate });
    }

    const result = await queryBuilder.getRawOne();

    if (!result || !result.total || parseInt(result.total) === 0) {
      return 0;
    }

    const successRate = (parseInt(result.successful) / parseInt(result.total)) * 100;
    return Math.round(successRate * 100) / 100; // Round to 2 decimal places
  }
  async getFailedTransactions(merchantId?: string): Promise<number> {
    const queryBuilder = this.payoutRepository
      .createQueryBuilder('payout')
      .select('COUNT(*)', 'total');
      if (merchantId) {
        queryBuilder.where('payout.merchantId = :merchantId', { merchantId: parseInt(merchantId) });
      }
      queryBuilder.andWhere('payout.status = :status', { status: 'failed' });
    const result = await queryBuilder.getRawOne();
    return result?.total ? parseInt(result.total) : 0;
  }


  async getPendingTransactions(merchantId?: string): Promise<number> {
    const queryBuilder = this.payoutRepository
      .createQueryBuilder('payout')
      .select('COUNT(*)', 'total')
      .where('payout.status = :status', { status: 'processing' });

    if (merchantId) {
      queryBuilder.andWhere('payout.merchantId = :merchantId', { merchantId: parseInt(merchantId) });
    }

    const result = await queryBuilder.getRawOne();
    return result?.total ? parseInt(result.total) : 0;
  }

  async getAverageTransactionValue(merchantId?: string): Promise<number> {
    const queryBuilder  = await this.payoutRepository
      .createQueryBuilder('payout')
      .select('AVG(transaction.amount)', 'average');
      if (merchantId) {
        queryBuilder.where('payout.merchantId = :merchantId', { merchantId });
      }
      const result = await queryBuilder.getRawOne();

    return result?.average ? parseFloat(result.average) : 0;
  }

  async getTransactionVolume(
    merchantId?: string,
    options?: { status?: string; startDate?: Date; endDate?: Date }
  ): Promise<number> {
    const queryBuilder = this.payoutRepository
      .createQueryBuilder('payout')
      .select('COALESCE(SUM(payout.amount), 0)', 'total');

    if (merchantId) {
      queryBuilder.andWhere('payout.merchantId = :merchantId', { merchantId });
    }

    if (options?.status) {
      queryBuilder.andWhere('payout.status = :status', { status: options.status });
    }

    if (options?.startDate) {
      queryBuilder.andWhere('payout.createdAt >= :startDate', { startDate: options.startDate });
    }

    if (options?.endDate) {
      queryBuilder.andWhere('payout.createdAt <= :endDate', { endDate: options.endDate });
    }

    const result = await queryBuilder.getRawOne();
    return result?.total ? parseFloat(result.total) : 0;
  }

    /**
   * Search transactions with filters (for merchant dashboard)
   */
    async getAllPayoutTransactions(filters: {
      customerId?: string;
      search?: string;
      page?: number;
      limit?: number;
      merchantId?: number | string;
      startDate?: string;
      endDate?: string;
      status?: string;
      currency?: string;
      minAmount?: number;
      maxAmount?: number;
    }): Promise<{ payouts: Payout[]; total: number }> {
      try {
        this.logger.log(`[getAllPayoutTransactions] Filters received: ${JSON.stringify(filters)}`);
        
        const query = this.payoutRepository
          .createQueryBuilder('payout');
  
        const conditions: string[] = [];
        const params: any = {};
  
        if (filters.merchantId && filters.merchantId.toString().trim() !== '') {
          conditions.push('payout.merchantId = :merchantId');
          params.merchantId = filters.merchantId;
        }
  
        if (filters.status) {
          conditions.push('payout.status = :status');
          params.status = filters.status;
        }
        
        if (filters.startDate) {
          conditions.push('payout.createdAt >= :startDate');
          params.startDate = filters.startDate;
        }
        
        if (filters.endDate) {
          conditions.push('payout.createdAt <= :endDate');
          params.endDate = filters.endDate;
        }
        
        if (filters.currency && filters.currency.trim() !== '') {
          conditions.push('payout.currency = :currency');
          params.currency = filters.currency.trim().toUpperCase();
          this.logger.log(`[getAllPayoutTransactions] Applying currency filter: ${params.currency}`);
        } else {
          this.logger.log(`[getAllPayoutTransactions] No currency filter applied - currency value: "${filters.currency}"`);
        }
        
        if (filters.minAmount) {
          conditions.push('payout.amount >= :minAmount');
          params.minAmount = filters.minAmount;
        }
        
        if (filters.maxAmount) {
          conditions.push('payout.amount <= :maxAmount');
          params.maxAmount = filters.maxAmount;
        }
        
        if (filters.customerId) {
          conditions.push('payout.customerId = :customerId');
          params.customerId = filters.customerId;
        }
        
        if (conditions.length > 0) {
          query.where(conditions.join(' AND '), params);
          this.logger.log(`[getAllPayoutTransactions] WHERE clause: ${conditions.join(' AND ')}, params: ${JSON.stringify(params)}`);
        } else {
          this.logger.log(`[getAllPayoutTransactions] No WHERE conditions applied`);
        }
        
        if (filters.search) {
          const searchTerm = `%${filters.search}%`;
          query.andWhere(
            '(payout.payoutId LIKE :search OR payout.customerEmail LIKE :search OR payout.customerPhone LIKE :search)',
            { search: searchTerm }
          );
          this.logger.log(`[getAllPayoutTransactions] Applied search filter: ${searchTerm}`);
        }
  
        const page = filters.page || 1;
        const limit = filters.limit || 20;
        const skip = (page - 1) * limit;

        this.logger.log(`[getAllPayoutTransactions] Query pagination: page=${page}, limit=${limit}, skip=${skip}`);
  
        const [payouts, total] = await query
              .orderBy('payout.createdAt', 'DESC')
          .skip(skip)
          .take(limit)
          .getManyAndCount();

        this.logger.log(`[getAllPayoutTransactions] Found ${total} total payouts, returning ${payouts.length} on page ${page}`);
        this.logger.log(`[getAllPayoutTransactions] Sample currencies in results: ${payouts.slice(0, 5).map(p => p.currency).join(', ')}`);
        
        return { payouts, total };
      } catch (error) {
        this.logger.error('Failed to search transactions:', error);
        throw error;
      }
    }
  
  //     /**
  //  * Get comprehensive transaction volume metrics
  //  */
  //     async getPayoutTransactionSummary(filters: PayoutPaymentsAnalyticsFilters): Promise<TransactionSummary> {
  //       this.logger.log(`Getting transaction summary with filters: ${JSON.stringify(filters)}`);
    
  //       try {
  //         const totalTransactions = await this.getTotalTransactions(filters?.merchantId);
  //         const transactionsSuccessRate = await this.getTransactionSuccessRate(filters?.merchantId);
  //         const failedTransactions = await this.getFailedTransactions(filters?.merchantId);
  //         const pendingTransactions = await this.getPendingTransactions(filters?.merchantId);
  //         const averageTicketSize = await this.getAverageTransactionValue(filters?.merchantId);
  //         const totalVolume = await this.getTransactionVolume(filters?.merchantId);
  
  //         const metrics: TransactionSummary = {
  //           totalTransactions,
  //           totalVolume,
  //           averageTicketSize,
  //           successfulTransactions: transactionsSuccessRate,  // number of successful transactions
  //           failedTransactions,  // number of failed transactions
  //           pendingTransactions,  // number of pending transactions
  //           successRate: transactionsSuccessRate,  // success rate
  //           failureRate: failedTransactions / totalTransactions,  // failure rate
  //           period: `${filters.startDate} to ${filters.endDate}`,  // period
  //           currency: filters.currency || 'INR',  // currency
  //         }
    
  //         // Add time series if requested
  //         if (filters.includeTimeSeries) {
  //           metrics.timeSeries = await this.getTimeSeriesData(filters);
  //         }
    
  //         // Add comparison if requested
  //         if (filters.includeComparison) {
  //           metrics.comparison = await this.getComparisonMetrics(filters, metrics);
  //         }
    
  //         return metrics;
  //       } catch (error) {
  //         this.logger.error(`Failed to get transaction volume metrics: ${error.message}`, error.stack);
  //         throw error;
  //       }
  //     }

      /**
       * Get dashboard analytics for 7 summary cards
       */
      async getPayoutTransactionSummary(filters: PayoutPaymentsAnalyticsFilters): Promise<PayoutDashboardAnalytics> {
        this.logger.log(`[getPayoutTransactionSummary] Getting dashboard analytics with filters: ${JSON.stringify(filters)}`);
    
        try {
          const buildBaseQuery = () => {
            const query = this.payoutRepository.createQueryBuilder('payout');
            
            const conditions: string[] = [];
            const params: any = {};
            
            if(filters.merchantId && filters.merchantId.trim() !== '') {
              conditions.push('payout.merchantId = :merchantId');
              params.merchantId = filters.merchantId;
            }
            
            if(filters.startDate) {
              conditions.push('payout.createdAt >= :startDate');
              params.startDate = filters.startDate;
            }
            if(filters.endDate) {
              conditions.push('payout.createdAt <= :endDate');
              params.endDate = filters.endDate;
            }
            if(filters.status) {
              conditions.push('payout.status = :status');
              params.status = filters.status;
            }
            if(filters.currency) {
              conditions.push('payout.currency = :currency');
              params.currency = filters.currency;
            }
            
            // Apply all conditions at once
            if (conditions.length > 0) {
              query.where(conditions.join(' AND '), params);
            }
            
            return query;
          };

          // 1. TOTAL MANUAL PAYMENTS - All payout transactions
          const totalManualPayments = await buildBaseQuery()
            .select('COUNT(payout.id)', 'count')
            .getRawOne()
            .then(result => {
              const count = parseInt(result.count) || 0;
              this.logger.log(`[getPayoutTransactionSummary] Total manual payments: ${count}`);
              return count;
            });

          // 2. PAYMENT AMOUNT - Total volume of all payments
          const paymentAmount = await buildBaseQuery()
            .select('COALESCE(SUM(payout.amount), 0)', 'total')
            .getRawOne()
            .then(result => {
              const total = parseFloat(result.total) || 0;
              this.logger.log(`[getPayoutTransactionSummary] Payment amount: ${total}`);
              return total;
            });

          // 3. APPROVED PAYMENTS - Successfully completed payments
          const approvedPaymentsQuery = buildBaseQuery();
          approvedPaymentsQuery.andWhere('payout.status = :completedStatus', { completedStatus: 'completed' });
          const approvedPayments = await approvedPaymentsQuery
            .select('COUNT(payout.id)', 'count')
            .getRawOne()
            .then(result => parseInt(result.count) || 0);

          // 4. AVG PROCESSING TIME - Average time from creation to completion
          const avgProcessingTimeQuery = buildBaseQuery();
          avgProcessingTimeQuery.andWhere('payout.completedAt IS NOT NULL');
          const avgProcessingTime = await avgProcessingTimeQuery
            .select('COALESCE(AVG(EXTRACT(EPOCH FROM (payout.completedAt - payout.createdAt))/60), 0)', 'avgMinutes')
            .getRawOne()
            .then(result => Math.round(parseFloat(result.avgMinutes)) || 0);

          // 5. APPROVED TODAY - Payments approved today
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const approvedTodayQuery = buildBaseQuery();
          approvedTodayQuery.andWhere('payout.status = :completedStatus', { completedStatus: 'completed' });
          approvedTodayQuery.andWhere('payout.completedAt >= :today', { today });
          const approvedToday = await approvedTodayQuery
            .select('COUNT(payout.id)', 'count')
            .getRawOne()
            .then(result => parseInt(result.count) || 0);

          // 6. PENDING APPROVAL - Payments awaiting approval (processing status)
          const pendingApprovalQuery = buildBaseQuery();
          pendingApprovalQuery.andWhere('payout.status = :processingStatus', { processingStatus: 'processing' });
          const pendingApproval = await pendingApprovalQuery
            .select('COUNT(payout.id)', 'count')
            .getRawOne()
            .then(result => parseInt(result.count) || 0);

          // 7. APPROVAL RATE - Percentage of approved payments
          const totalProcessedQuery = buildBaseQuery();
          totalProcessedQuery.andWhere('payout.status IN (:...statuses)', { statuses: ['completed', 'failed'] });
          const totalProcessed = await totalProcessedQuery
            .select('COUNT(payout.id)', 'count')
            .getRawOne()
            .then(result => parseInt(result.count) || 0);

          const approvalRate = totalProcessed > 0 ? (approvedPayments / totalProcessed) * 100 : 0;

          let comparison;
          if (filters.includeComparison) {
            comparison = await this.calculateComparisonMetrics(filters, {
              totalManualPayments,
              paymentAmount,
              approvedPayments,
              avgProcessingTime,
              approvedToday,
              pendingApproval,
              approvalRate
            });
          }

          const analytics: PayoutDashboardAnalytics = {
            totalManualPayments,
            paymentAmount,
            approvedPayments,
            avgProcessingTime,
            approvedToday,
            pendingApproval,
            approvalRate,
            
            // Comparison data
            comparison,
            
            // Additional metadata
            period: `${filters.startDate} to ${filters.endDate}`,
            currency: filters.currency || 'INR',
            lastUpdated: new Date().toISOString()
          };
    
          return analytics;
        } catch (error) {
          this.logger.error(`Failed to get dashboard analytics: ${error.message}`, error.stack);
          throw error;
        }
      }

  private async calculateComparisonMetrics(filters: PayoutPaymentsAnalyticsFilters, currentMetrics: any) {
    try {
      const startDate = new Date(filters.startDate);
      const endDate = new Date(filters.endDate);
      const periodLength = endDate.getTime() - startDate.getTime();
      
      const previousEndDate = new Date(startDate.getTime() - 1);
      const previousStartDate = new Date(previousEndDate.getTime() - periodLength);

      const previousBaseQuery = this.payoutRepository.createQueryBuilder('payout')
        .where('payout.createdAt >= :startDate', { startDate: previousStartDate })
        .andWhere('payout.createdAt <= :endDate', { endDate: previousEndDate });

      if(filters.merchantId) {
        previousBaseQuery.andWhere('payout.merchantId = :merchantId', { merchantId: filters.merchantId });
      }

      const previousTotalManualPayments = await previousBaseQuery
        .clone()
        .select('COUNT(payout.id)', 'count')
        .getRawOne()
        .then(result => parseInt(result.count) || 0);

      const previousPaymentAmount = await previousBaseQuery
        .clone()
        .select('SUM(payout.amount)', 'total')
        .getRawOne()
        .then(result => parseFloat(result.total) || 0);

      const previousApprovedPayments = await previousBaseQuery
        .clone()
        .select('COUNT(payout.id)', 'count')
        .where('payout.status = :status', { status: 'completed' })
        .getRawOne()
        .then(result => parseInt(result.count) || 0);

      const previousAvgProcessingTime = await previousBaseQuery
        .clone()
        .select('AVG(EXTRACT(EPOCH FROM (payout.completedAt - payout.createdAt))/60)', 'avgMinutes')
        .where('payout.completedAt IS NOT NULL')
        .getRawOne()
        .then(result => Math.round(parseFloat(result.avgMinutes)) || 0);

      const previousApprovedToday = await previousBaseQuery
        .clone()
        .select('COUNT(payout.id)', 'count')
        .where('payout.status = :status', { status: 'completed' })
        .andWhere('payout.completedAt >= :today', { today: previousEndDate })
        .getRawOne()
        .then(result => parseInt(result.count) || 0);

      const previousPendingApproval = await previousBaseQuery
        .clone()
        .select('COUNT(payout.id)', 'count')
        .where('payout.status = :status', { status: 'processing' })
        .getRawOne()
        .then(result => parseInt(result.count) || 0);

      const previousTotalProcessed = await previousBaseQuery
        .clone()
        .select('COUNT(payout.id)', 'count')
        .where('payout.status IN (:...statuses)', { statuses: ['completed', 'failed'] })
        .getRawOne()
        .then(result => parseInt(result.count) || 0);

      const previousApprovalRate = previousTotalProcessed > 0 ? (previousApprovedPayments / previousTotalProcessed) * 100 : 0;

      const calculateChange = (current: number, previous: number) => {
        if (previous === 0) return { changePercentage: current > 0 ? 100 : 0, trend: current > 0 ? 'UP' : 'STABLE' };
        const changePercentage = ((current - previous) / previous) * 100;
        const trend = changePercentage > 0 ? 'UP' : changePercentage < 0 ? 'DOWN' : 'STABLE';
        return { changePercentage: Math.abs(changePercentage), trend };
      };

      return {
        totalManualPayments: {
          previousValue: previousTotalManualPayments,
          ...calculateChange(currentMetrics.totalManualPayments, previousTotalManualPayments)
        },
        paymentAmount: {
          previousValue: previousPaymentAmount,
          ...calculateChange(currentMetrics.paymentAmount, previousPaymentAmount)
        },
        approvedPayments: {
          previousValue: previousApprovedPayments,
          ...calculateChange(currentMetrics.approvedPayments, previousApprovedPayments)
        },
        avgProcessingTime: {
          previousValue: previousAvgProcessingTime,
          ...calculateChange(currentMetrics.avgProcessingTime, previousAvgProcessingTime)
        },
        approvedToday: {
          previousValue: previousApprovedToday,
          ...calculateChange(currentMetrics.approvedToday, previousApprovedToday)
        },
        pendingApproval: {
          previousValue: previousPendingApproval,
          ...calculateChange(currentMetrics.pendingApproval, previousPendingApproval)
        },
        approvalRate: {
          previousValue: previousApprovalRate,
          ...calculateChange(currentMetrics.approvalRate, previousApprovalRate)
        }
      };
    } catch (error) {
      this.logger.error(`Failed to calculate comparison metrics: ${error.message}`, error.stack);
      return null;
    }
  }

            /**
   * Get comparison metrics for previous period
   */
  private async getComparisonMetrics(filters: PayoutPaymentsAnalyticsFilters, currentMetrics: PayoutDashboardAnalytics): Promise<ComparisonMetrics> {
    // Calculate previous period dates
    const startDate = new Date(filters.startDate);
    const endDate = new Date(filters.endDate);
    const periodDuration = endDate.getTime() - startDate.getTime();
    
    const previousStartDate = new Date(startDate.getTime() - periodDuration);
    const previousEndDate = new Date(endDate.getTime() - periodDuration);

    const previousFilters: PayoutPaymentsAnalyticsFilters = {
      ...filters,
      startDate: previousStartDate.toISOString(),
      endDate: previousEndDate.toISOString(),
      includeTimeSeries: false,
      includeComparison: false,
    };

    const previousMetrics = await this.getPayoutTransactionSummary(previousFilters);

    const volumeChange = currentMetrics.paymentAmount - previousMetrics.paymentAmount;
    const changePercentage = previousMetrics.paymentAmount > 0 ?
      (volumeChange / previousMetrics.paymentAmount) * 100 : 0;

    let trend: 'UP' | 'DOWN' | 'STABLE';
    if (Math.abs(changePercentage) < 5) {
      trend = 'STABLE';
    } else if (changePercentage > 0) {
      trend = 'UP';
    } else {
      trend = 'DOWN';
    }

    return {
      previousPeriod: {
        totalTransactions: previousMetrics.totalManualPayments,
        totalVolume: previousMetrics.paymentAmount,
        averageTicketSize: previousMetrics.totalManualPayments > 0 ? previousMetrics.paymentAmount / previousMetrics.totalManualPayments : 0,
        successfulTransactions: previousMetrics.approvedPayments,
        failedTransactions: previousMetrics.totalManualPayments - previousMetrics.approvedPayments,
        pendingTransactions: previousMetrics.pendingApproval,
        successRate: previousMetrics.approvalRate,
        failureRate: previousMetrics.totalManualPayments > 0 ? ((previousMetrics.totalManualPayments - previousMetrics.approvedPayments) / previousMetrics.totalManualPayments) * 100 : 0,
        period: previousMetrics.period,
        currency: previousMetrics.currency,
      },
      changePercentage: Math.abs(changePercentage),
      trend,
    };
  }
/**
   * Get time series data for transaction metrics
   */
private async getTimeSeriesData(filters: PayoutPaymentsAnalyticsFilters): Promise<TimeSeriesPoint[]> {
  const granularity = filters.granularity || 'day';
  let timeFunction: string;

  switch (granularity) {
    case 'hour':
      timeFunction = 'toStartOfHour(created_at)';
      break;
    case 'day':
      timeFunction = 'toStartOfDay(created_at)';
      break;
    case 'week':
      timeFunction = 'toMonday(created_at)';
      break;
    case 'month':
      timeFunction = 'toStartOfMonth(created_at)';
      break;
    default:
      timeFunction = 'toStartOfDay(created_at)';
  }

  const query = this.payoutRepository.createQueryBuilder('payout')
    .select([
      `${timeFunction} as time_bucket`,
      'COUNT(payout_id) as payout_count',
      'SUM(payout.amount) as payout_volume',
      'AVG(payout.amount) as average_ticket_size',
    ])
    .where('payout.createdAt >= :startDate', { startDate: filters.startDate })
    .where('payout.createdAt <= :endDate', { endDate: filters.endDate })
    .groupBy('time_bucket')
    .orderBy('time_bucket', 'ASC');
    
    if(filters.merchantId) {
      query.andWhere('payout.merchantId = :merchantId', { merchantId: filters.merchantId });
    }
    if(filters.status) {
      query.andWhere('payout.status = :status', { status: filters.status });
    }
    if(filters.startDate) {
      query.andWhere('payout.createdAt >= :startDate', { startDate: filters.startDate });
    }
    if(filters.endDate) {
      query.andWhere('payout.createdAt <= :endDate', { endDate: filters.endDate });
    }
    if(filters.granularity) {
      query.groupBy(filters.granularity);
    }
    if(filters.currency) {
      query.andWhere('payout.currency = :currency', { currency: filters.currency });
    }
  
  
  const results = await query.getRawMany();

  return results.map((row: any) => ({
    timestamp: new Date(row.time_bucket).toISOString(),
    value: parseFloat(row.transaction_volume || '0'),
    count: parseInt(row.transaction_count || '0', 10),
    additionalMetrics: {
      averageTicketSize: parseFloat(row.average_ticket_size || '0'),
    },
  }));
}

  /**
   * Map TSP status to PayoutStatus enum
   */
  private mapTspStatusToPayoutStatus(tspStatus: string): PayoutStatus {
    switch (tspStatus.toLowerCase()) {
      case 'completed':
      case 'success':
      case 'captured':
        return PayoutStatus.COMPLETED;
      case 'failed':
      case 'failure':
      case 'error':
        return PayoutStatus.FAILED;
      case 'processing':
      case 'pending':
      case 'in_progress':
        return PayoutStatus.PROCESSING;
      case 'cancelled':
      case 'canceled':
        return PayoutStatus.CANCELLED;
      case 'reversed':
      case 'refunded':
        return PayoutStatus.REVERSED;
      default:
        this.logger.warn(`Unknown TSP status: ${tspStatus}, defaulting to PROCESSING`);
        return PayoutStatus.PROCESSING;
    }
  }


    /**
   * Search transactions with filters (for merchant dashboard)
   */
    async searchTransactions(filters: {
      merchantId: number | string;
      status?: string;
      startDate?: string;
      endDate?: string;
      minAmount?: number;
      maxAmount?: number;
      customerId?: string;
      customerEmail?: string;
      customerPhone?: string;
      transactionId?: string;
      responseTime?: number;
      environment?: string;
      bankName?: string;
      page?: number;
      limit?: number;
    }): Promise<{ payouts: Payout[]; total: number }> {
      try {
        const query = this.payoutRepository
          .createQueryBuilder('payout');
          if (filters.merchantId) {
            query.where('payout.merchantId = :merchantId', { merchantId: String(filters.merchantId) });
          }
        // Apply filters
        if (filters.status) {
          query.andWhere('payout.status = :status', { status: filters.status });
        } 
        if (filters.startDate) {
          query.andWhere('payout.createdAt >= :startDate', { startDate: filters.startDate });
        }
        
        if (filters.endDate) {
          query.andWhere('payout.createdAt <= :endDate', { endDate: filters.endDate });
        }
        
        if (filters.minAmount) {
          query.andWhere('payout.amount >= :minAmount', { minAmount: filters.minAmount });
        }
        
        if (filters.maxAmount) {
          query.andWhere('payout.amount <= :maxAmount', { maxAmount: filters.maxAmount });
        }
        
        if (filters.customerId) {
          query.andWhere('payout.customerId = :customerId', { customerId: filters.customerId });
        }
        if (filters.environment) {
          query.andWhere('payout.environment = :environment', { environment: filters.environment });
        }
  
        // Add pagination
        const page = filters.page || 1;
        const limit = filters.limit || 20;
        const skip = (page - 1) * limit;
  
        const [payouts, total] = await query
          .orderBy('payout.createdAt', 'DESC')
          .skip(skip)
          .take(limit)
          .getManyAndCount();
  
        return { payouts, total };
      } catch (error) {
        this.logger.error('Failed to search payouts:', error);
        throw error;
      }
    }
}

