import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PaymentIntent } from '@/entities/payment-intent.entity';
import { PaymentTransaction } from '@/entities/payment-transaction.entity';
import { TSPConfiguration } from '@/entities/tsp-configuration.entity';
import { TSPProvider } from '@/enums/tsp-provider.enum';
import { LoggerService } from '@/common/services/logger.service';
import { ResponseCodeManager, STATE_TRANSITION_RULES } from '@/common/response-codes';
import { TSPFactoryService } from '@/tsp/tsp-factory.service';
import { FraudManagementService } from '@/fraud/fraud-management.service';
import { SmartRoutingService } from '@/modules/smart-routing/smart-routing.service';
import { CustomerResolutionService } from '@/modules/customer-resolution/customer-resolution.service';
import { ParallelTSPProcessor, TSPRequest } from '@/adapters/parallel-tsp-processor';
import {
  CreatePaymentIntentRequest,
  CreatePaymentIntentResponse,
  ProcessPaymentRequest,
  ProcessPaymentResponse,
  ProcessPaymentInternalResponse,
  GetPaymentStatusResponse,
  ExpirationCheckResult,
  CleanupResult,
  PaymentMethodDetails,
  Currency
} from '@/types';
import { ConfigService } from '@nestjs/config';
import { PaymentTransactionService } from '@/modules/payment-transaction/payment-transaction.service';
import { KafkaProducerService } from '@/events/kafka-producer.service';
import { PaymentStatusEvent } from '@/events/types/event.types';

/**
 * Payment Intent Service
 * Core payment processing with TSP integration
 */
@Injectable()
export class PaymentIntentService {
  private readonly environment: string;

  constructor(
    @InjectRepository(PaymentIntent)
    private readonly paymentRepository: Repository<PaymentIntent>,

    @InjectRepository(PaymentTransaction)
    private readonly transactionRepository: Repository<PaymentTransaction>,

    @InjectRepository(TSPConfiguration)
    private readonly tspConfigRepository: Repository<TSPConfiguration>,

    private readonly logger: LoggerService,
    private readonly tspFactory: TSPFactoryService,
    private readonly fraudService: FraudManagementService,
    private readonly routingService: SmartRoutingService,
    private readonly customerResolutionService: CustomerResolutionService,
    private readonly parallelTSPProcessor: ParallelTSPProcessor,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => PaymentTransactionService))
    private readonly paymentTransactionService: PaymentTransactionService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {
    this.environment = this.configService.get<string>(
      'NODE_ENV',
      'sandbox'
    );
  }

  /**
   * Create a new payment intent
   */
  async createPaymentIntent(request: CreatePaymentIntentRequest): Promise<CreatePaymentIntentResponse> {
    try {
      this.logger.log(`Creating payment intent for merchant: ${request.merchantId}, amount: ${request.amount}`);

      this.validateCryptoMinimumAmount(request.amount, request.currency);

      // Step 1: Initial Customer Resolution (Minimal data at intent creation)
      let resolvedCustomerId = request.customerId;

      this.logger.debug(`[${request.requestId}] Customer resolution check: resolvedCustomerId=${resolvedCustomerId}, customerEmail=${request.customerEmail}, customerPhone=${request.customerPhone}`);

      if (!resolvedCustomerId && (request.customerEmail || request.customerPhone)) {

        const customerDetails = {
          email: request.customerEmail,
          phone: request.customerPhone,
          firstName: request.customerFirstName || '',
          lastName: request.customerLastName || '',
          country: request.customerCountry || '',
        };

        try {
          const customerResult = await this.customerResolutionService.resolveCustomer(
            request.merchantId,
            undefined,
            customerDetails,
            request.requestId,
            true
          );

          if (customerResult.success && customerResult.customer) {
            resolvedCustomerId = customerResult.customer.customerId;
          } else {
            this.logger.warn(`[${request.requestId}] Failed to resolve/create customer: ${customerResult.error?.message}`);
          }
        } catch (error) {
          this.logger.error(`[${request.requestId}] Exception in customer resolution:`, error.message);
        }
      }

      // Step 2: Initial Smart Routing (will be re-evaluated with customer intelligence)
      const initialRoutingContext = {
        merchantId: request.merchantId,
        customerId: resolvedCustomerId,
        amount: request.amount,
        currency: request.currency,
        paymentMethod: request.paymentMethod || 'upi',
        customerEmail: request.customerEmail,
        environment: this.environment,
        timestamp: new Date(),
      };


      const initialRoutingDecision = await this.routingService.getRoutingDecision(initialRoutingContext, request.requestId);


      // Step 3: Create payment intent with resolved data
      const intentId = `pi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const savedIntent = await this.paymentRepository.save({
        intentId,
        merchantId: request.merchantId,
        customerId: resolvedCustomerId,
        amount: request.amount,
        currency: request.currency as any,
        description: request.description,
        customerEmail: request.customerEmail || '',
        customerPhone: request.customerPhone,
        preferredPaymentMethod: request.paymentMethod,
        status: 'requires_payment_method' as any,
        returnUrl: request.returnUrl,
        // webhookUrl: request.webhookUrl,
        clientSecret: `pi_${Date.now()}_secret_${Math.random().toString(36).substring(7)}`,
        expiresAt: new Date(Date.now() + STATE_TRANSITION_RULES.paymentIntent.expirationTimeoutMs),
        metadata: request.metadata || {},
        requestId: request.requestId,
        environment: this.environment as any,
      });

      // Calculate processing fee based on initial TSP configuration
      const processingFee = await this.calculateProcessingFee(request.amount, initialRoutingDecision);

      // Generate payment page URL for customer redirection
      const paymentPageUrl = `${process.env.PAYMENT_PAGE_BASE_URL || 'http://localhost:5173'}/pay/${savedIntent.intentId}?token=${savedIntent.clientSecret}`;

      return {
        intentId: savedIntent.intentId,
        merchantId: savedIntent.merchantId,
        customerId: savedIntent.customerId,
        amount: savedIntent.amount,
        currency: savedIntent.currency,
        status: savedIntent.status,
        // selectedTSP: initialRoutingDecision.selectedTSP,
        description: savedIntent.description,
        expiresAt: savedIntent.expiresAt,
        estimatedCompletionTime: 30000,
        processingFee: processingFee,
        createdAt: savedIntent.createdAt,
        metadata: savedIntent.metadata,
        paymentPageUrl: paymentPageUrl,
        // routingDecision: {
        //   selectedProvider: initialRoutingDecision.selectedTSP,
        //   reason: 'Initial routing - will be optimized with customer intelligence',
        //   alternativeProviders: initialRoutingDecision.alternatives.map(alt => alt.provider) || [],
        //   routingScore: initialRoutingDecision.score || 0.95,
        //   estimatedSuccessRate: initialRoutingDecision.confidence || 0.87
        // },
      };

    } catch (error) {
      this.logger.error(`Payment intent creation failed: ${request.merchantId}`, error);
      throw error;
    }
  }

  /**
   * Update payment intent with customer intelligence (called when user visits payment page)
   */
  async updatePaymentIntentWithCustomerIntelligence(
    intentId: string,
    digitalIntelligence: {
      ipAddress?: string;
      userAgent?: string;
      deviceFingerprint?: string;
      geolocation?: {
        country: string;
        state?: string;
        city?: string;
        timezone?: string;
        coordinates?: { lat: number; lng: number };
      };
      browserData?: {
        language: string;
        platform: string;
        screenResolution: string;
        colorDepth: number;
        timezoneOffset: number;
      };
    },
    additionalCustomerDetails?: {
      firstName?: string;
      lastName?: string;
      phone?: string;
    },
    requestId?: string
  ): Promise<{
    updatedIntent: any;
    optimizedTSP: string;
    customerProfile: any;
  }> {
    try {
      this.logger.log(`[${requestId}] Updating payment intent ${intentId} with customer intelligence`);

      // 1. Get existing payment intent
      const existingIntent = await this.paymentRepository.findOne({
        where: { intentId }
      });

      if (!existingIntent) {
        throw new Error(`Payment intent not found: ${intentId}`);
      }

      if (existingIntent.status !== 'requires_payment_method' && existingIntent.status !== 'requires_confirmation') {
        throw new Error(`Payment intent ${intentId} cannot be updated (status: ${existingIntent.status})`);
      }

      // Check if intent has expired
      if (existingIntent.expiresAt && new Date() > existingIntent.expiresAt) {
        throw new Error(`Payment intent ${intentId} has expired`);
      }

      // 2. Resolve/enhance customer with digital intelligence
      let enhancedCustomer;
      const customerDetails = {
        email: existingIntent.customerEmail,
        phone: additionalCustomerDetails?.phone,
        firstName: additionalCustomerDetails?.firstName,
        lastName: additionalCustomerDetails?.lastName,
        country: digitalIntelligence.geolocation?.country || 'IN'
      };

      if (existingIntent.customerId) {
        // Enhance existing customer
        enhancedCustomer = await this.customerResolutionService.resolveCustomerWithIntelligence(
          existingIntent.merchantId,
          existingIntent.customerId,
          customerDetails,
          digitalIntelligence,
          requestId,
          false
        );
      } else {
        // Create new customer with intelligence
        enhancedCustomer = await this.customerResolutionService.resolveCustomerWithIntelligence(
          existingIntent.merchantId,
          undefined,
          customerDetails,
          digitalIntelligence,
          requestId,
          true
        );
      }

      // 3. Re-evaluate smart routing with enhanced customer intelligence
      const intelligentRoutingContext = {
        merchantId: existingIntent.merchantId,
        customerId: enhancedCustomer.customer?.customerId,
        amount: existingIntent.amount,
        currency: existingIntent.currency,
        paymentMethod: existingIntent.preferredPaymentMethod || 'upi',
        environment: existingIntent.environment,
        timestamp: new Date(),
        customerIntelligence: {
          ipAddress: digitalIntelligence.ipAddress,
          userAgent: digitalIntelligence.userAgent,
          deviceFingerprint: digitalIntelligence.deviceFingerprint,
          geolocation: digitalIntelligence.geolocation,
          deviceInfo: {
            platform: digitalIntelligence.browserData?.platform || 'Unknown',
            browser: this.extractBrowserFromUserAgent(digitalIntelligence.userAgent),
            isMobile: this.isMobileDevice(digitalIntelligence.userAgent),
            language: digitalIntelligence.browserData?.language || 'Unknown',
            screenResolution: digitalIntelligence.browserData?.screenResolution,
          },
          riskProfile: enhancedCustomer.customer?.riskProfile,
          transactionHistory: {
            totalTransactions: enhancedCustomer.customer?.totalTransactionCount || 0,
            lastTransactionAt: enhancedCustomer.customer?.lastTransactionAt,
            preferredPaymentMethods: [], // Can be enhanced from history
            averageTransactionAmount: enhancedCustomer.customer?.totalTransactionAmount || 0,
          },
          isNewCustomer: enhancedCustomer.customer?.isNewCustomer || false,
        },
      };

      this.logger.log(`[${requestId}] Re-evaluating smart routing with customer intelligence...`);
      const optimizedRoutingDecision = await this.routingService.getRoutingDecision(intelligentRoutingContext, requestId);

      // 4. Update payment intent with enhanced data
      const updatedIntent = await this.paymentRepository.save({
        ...existingIntent,
        customerId: enhancedCustomer.customer?.customerId || existingIntent.customerId,
        customerEmail: existingIntent.customerEmail,
        clientIpAddress: digitalIntelligence.ipAddress,
        metadata: {
          ...existingIntent.metadata,
          digitalIntelligence: {
            ipAddress: digitalIntelligence.ipAddress,
            userAgent: digitalIntelligence.userAgent,
            deviceFingerprint: digitalIntelligence.deviceFingerprint,
            geolocation: digitalIntelligence.geolocation,
            browserData: digitalIntelligence.browserData,
            updatedAt: new Date(),
          },
          routingOptimized: true,
          originalTSP: 'initial',
          optimizedTSP: optimizedRoutingDecision.selectedTSP,
        },
        updatedAt: new Date(),
      });

      this.logger.log(`[${requestId}] Payment intent updated with intelligence. TSP optimized to: ${optimizedRoutingDecision.selectedTSP}`);

      return {
        updatedIntent,
        optimizedTSP: optimizedRoutingDecision.selectedTSP,
        customerProfile: enhancedCustomer.customer,
      };

    } catch (error) {
      this.logger.error(`[${requestId}] Failed to update payment intent with customer intelligence:`, error);
      throw error;
    }
  }

  // Helper methods for device detection
  private extractBrowserFromUserAgent(userAgent?: string): string {
    if (!userAgent) return 'Unknown';
    if (/Chrome/i.test(userAgent)) return 'Chrome';
    if (/Firefox/i.test(userAgent)) return 'Firefox';
    if (/Safari/i.test(userAgent)) return 'Safari';
    if (/Edge/i.test(userAgent)) return 'Edge';
    return 'Unknown';
  }

  private isMobileDevice(userAgent?: string): boolean {
    if (!userAgent) return false;
    return /Mobile|Android|iPhone|iPad/i.test(userAgent);
  }

  /**
   * Confirm payment with TSP and get redirect URL
   */
  async confirmPaymentWithTSP(request: {
    intentId: string;
    customerDetails: any;
    paymentMethodDetails?: any;
    deviceInfo?: any;
    requestId: string;
  }): Promise<{
    intentId: string;
    redirectUrl: string;
    tspProvider: string;
    externalTransactionId: string;
    status: string;
    message: string;
    requiresCardDetails?: boolean;
    nextAction?: any;
    cryptoAddress?: {
      address: string;
      currency: string;
    };
    supportedCurrencies?: string[];
    supportedCountries?: string[];
  }> {
    this.logger.log(`Confirming payment with TSP for intent: ${request.intentId}`);

    // Get payment intent
    const intent = await this.paymentRepository.findOne({
      where: { intentId: request.intentId }
    });

    if (!intent) {
      throw new Error('Payment intent not found');
    }

    if (intent.status !== 'requires_payment_method') {
      const statusMessages: Record<string, string> = {
        'processing': 'This payment is already being processed. Please wait for the current transaction to complete.',
        'succeeded': 'This payment has already been completed successfully.',
        'canceled': 'This payment was cancelled. Please create a new payment request.',
        'failed': 'This payment has failed. Please try again with a new payment.',
        'abandoned': 'This payment session has expired. Please request a new payment link from the merchant.',
        'requires_capture': 'This payment is awaiting capture. Please contact support if you need assistance.'
      };

      const userMessage = statusMessages[intent.status] ||
        `Cannot process this payment. Current status: ${intent.status}. Please try again or contact support.`;

      throw new Error(userMessage);
    }

    // Check if expired
    if (intent.isExpired()) {
      throw new Error('Payment intent has expired');
    }

    let tspProvider = intent.metadata?.routingDecision?.selectedTSP;
    
    if (!tspProvider) {
      this.logger.log(`No TSP in metadata, running smart routing for intent: ${request.intentId}`);
    const routingDecision = await this.routingService.getRoutingDecision({
        merchantId: intent.merchantId,
        customerId: intent.customerId,
        amount: intent.amount,
        currency: intent.currency,
        paymentMethod: intent.preferredPaymentMethod || 'upi',
        environment: this.environment,
        timestamp: new Date(),
      }, request.requestId);
      
      tspProvider = routingDecision.selectedTSP;
      this.logger.log(`Smart routing selected: ${tspProvider}`);
    }
    
    const environment = intent.environment == 'development'? 'sandbox' : intent.environment;

    const normalizedProvider = (tspProvider || '').toString().toLowerCase();

    if (normalizedProvider === 'payaza' && !this.hasCardPaymentDetails(request.paymentMethodDetails)) {
      this.logger.log(`Payaza selected but card details missing for intent: ${request.intentId} - requesting card capture`);
      return {
        intentId: intent.intentId,
        redirectUrl: '',
        tspProvider: 'payaza',
        externalTransactionId: '',
        status: 'requires_card_details',
        message: 'Card details required to proceed with Payaza.',
        requiresCardDetails: true,
      };
    }

    this.logger.log(`Getting TSP adapter: provider=${tspProvider}, environment=${environment}`);

    const tspAdapter = await this.tspFactory.getTSPAdapter(
      tspProvider as any,
      environment as any
    );

    if (!tspAdapter) {
      this.logger.error(`TSP adapter not available: provider=${tspProvider}, environment=${environment}`);
      throw new Error(`TSP adapter not available for ${tspProvider} in ${environment} environment`);
    }

    const tspConfig = await this.tspConfigRepository.findOne({
      where: {
        providerName: tspProvider as any,
        environment: environment as any,
      },
    });

    const supportedCurrencies = tspConfig?.supportedCurrencies || (intent.metadata as any)?.supportedCurrencies;
    const supportedCountries = tspConfig?.supportedCountries || (intent.metadata as any)?.supportedCountries;

    const selectedPaymentMethod = request.deviceInfo?.metadata?.selectedPaymentMethod || 'fiat';
    const intentCurrency = intent.currency;
    const isCryptoIntent = ['BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'XRP', 'SOL', 'DOGE', 'ADA', 'TRX'].includes(intentCurrency);
    
    this.logger.log(`Payment routing: intentCurrency=${intentCurrency}, selectedPaymentMethod=${selectedPaymentMethod}, isCryptoIntent=${isCryptoIntent}`);

    const tspRequest = {
      merchantId: intent.merchantId,
      customerId: intent.customerId,
      amount: intent.amount,
      currency: intent.currency,
      description: intent.description,
      customerDetails: {
        name: request.customerDetails.name,
        email: request.customerDetails.email || intent.customerEmail,
        phone: request.customerDetails.phone || intent.customerPhone,
        country: request.customerDetails.address?.country || 'IN'
      },
      paymentMethodDetails: request.paymentMethodDetails,
      returnUrl: intent.returnUrl,
      cancelUrl: intent.returnUrl,
      webhookUrl: `${process.env.PAYMENT_ENGINE_BASE_URL || 'http://localhost:3004'}/webhooks/${tspProvider.toLowerCase()}`,
      requestId: request.requestId,
      metadata: {
        intentId: intent.intentId,
        deviceInfo: request.deviceInfo,
        selectedPaymentMethod,
      }
    };

    let tspResponse;

    if (selectedPaymentMethod === 'crypto' && isCryptoIntent) {
      this.logger.log(`Direct crypto payment: User paying ${intentCurrency} for ${intentCurrency} intent`);
      tspResponse = await tspAdapter.createPayment(tspRequest);
    } else if (selectedPaymentMethod === 'fiat' && isCryptoIntent) {
      this.logger.log(`On-ramping: User paying with fiat for ${intentCurrency} intent`);
      tspResponse = await tspAdapter.createPayment(tspRequest);
    } else if (selectedPaymentMethod === 'crypto' && !isCryptoIntent) {
      this.logger.log(`Off-ramping: User paying with crypto for ${intentCurrency} intent`);
      tspResponse = await tspAdapter.createPayment(tspRequest);
    } else {
      this.logger.log(`Normal fiat payment: User paying fiat for ${intentCurrency} intent`);
      tspResponse = await tspAdapter.createPayment(tspRequest);
    }

    console.log('tspResponse: ', tspResponse);

    if (!tspResponse.success) {
      throw new Error(`TSP payment creation failed: ${tspResponse.error || tspResponse.message || 'Unknown error'}`);
    }

    const isCryptoPayment = tspResponse.providerResponse?.cryptoAddress;
    const redirectUrl = tspResponse.redirectUrl || (isCryptoPayment ? '' : null);
    const hasNextAction = !!tspResponse.nextAction;

    if (!redirectUrl && !isCryptoPayment && !hasNextAction) {
      throw new Error(`TSP payment creation failed: No redirect URL, next action, or crypto address provided`);
    }

    // Update payment intent with customer details and status
    await this.paymentRepository.update(intent.id, {
      status: 'processing' as any,
      customerName: request.customerDetails.name,
      customerEmail: request.customerDetails.email || intent.customerEmail,
      customerPhone: request.customerDetails.phone || intent.customerPhone,
      clientIpAddress: request.deviceInfo?.ipAddress,
      userAgent: request.deviceInfo?.userAgent,
      metadata: {
        ...(intent.metadata || {}),
        redirectUrl: tspResponse.redirectUrl || undefined,
        cryptoAddress: isCryptoPayment ? tspResponse.providerResponse?.cryptoAddress?.address : undefined,
        cryptoCurrency: isCryptoPayment ? tspResponse.providerResponse?.cryptoAddress?.currency : undefined,
        tspResponse: {
          transactionId: tspResponse.transactionId,
          providerTransactionId: tspResponse.providerTransactionId,
          redirectUrl: tspResponse.redirectUrl,
          cryptoAddress: isCryptoPayment ? tspResponse.providerResponse?.cryptoAddress : undefined
        },
        nextAction: tspResponse.nextAction
          ? {
              type: tspResponse.nextAction.type,
              threeDsUrl: tspResponse.nextAction.threeDsUrl,
              formData: tspResponse.nextAction.formData,
              threeDsHtml: tspResponse.nextAction.threeDsHtml,
            }
          : (intent.metadata as any)?.nextAction,
        customerDetails: {
          name: request.customerDetails.name,
          email: request.customerDetails.email,
          phone: request.customerDetails.phone,
        },
        deviceType: request.deviceInfo?.deviceType,
        browserInfo: request.deviceInfo?.browserInfo,
        customerCountry: request.deviceInfo?.geolocation?.country,
        customerState: request.deviceInfo?.geolocation?.state,
        customerCity: request.deviceInfo?.geolocation?.city,
        customer_country: request.deviceInfo?.geolocation?.country,
        customer_state: request.deviceInfo?.geolocation?.state,
        customer_city: request.deviceInfo?.geolocation?.city,
        supportedCurrencies,
        supportedCountries,
      }
    } as any);

    await this.paymentTransactionService.createTransaction(
      intent.intentId,
      tspProvider,
      1,
      request.requestId,
      tspResponse.transactionId || tspResponse.providerTransactionId,
      {
        customerName: request.customerDetails.name,
        customerEmail: request.customerDetails.email || intent.customerEmail,
        customerPhone: request.customerDetails.phone || intent.customerPhone,
      }
    );

    this.logger.log(`Payment confirmed with ${tspAdapter.getProviderName()}: ${tspResponse.transactionId}`);

    // Check if sandbox environment for auto-completion
    const isSandbox = environment !== 'production';

    // if (isSandbox && tspResponse.providerTransactionId) {
    //   this.logger.log(`Sandbox mode detected - auto-completing payment for transaction: ${tspResponse.providerTransactionId}`);

    //   try {
    //     intent.status = 'succeeded';
    //     await this.paymentRepository.save(intent);

    //     const transaction = await this.transactionRepository.findOne({
    //       where: { externalTransactionId: tspResponse.providerTransactionId }
    //     });

    //     if (transaction) {
    //       transaction.status = 'success';
    //       transaction.statusDescription = 'Sandbox auto-completed';
    //       await this.transactionRepository.save(transaction);
    //     }

    //     await new Promise(resolve => setTimeout(resolve, 1500));

    //     this.logger.log(`Payment auto-completed successfully in sandbox mode`);

    //     return {
    //       intentId: intent.intentId,
    //       redirectUrl: '',
    //       tspProvider: tspAdapter.getProviderName(),
    //       externalTransactionId: tspResponse.transactionId || tspResponse.providerTransactionId || '',
    //       status: 'success',
    //       message: 'Payment processed successfully in sandbox mode'
    //     };
    //   } catch (error) {
    //     this.logger.error(`Sandbox auto-complete error: ${error.message} - returning normal flow`);
    //   }
    // }

    return {
      intentId: intent.intentId,
      redirectUrl: redirectUrl || '',
      tspProvider: tspAdapter.getProviderName(),
      externalTransactionId: tspResponse.transactionId || tspResponse.providerTransactionId || '',
      status: tspResponse.status || 'processing',
      message: isCryptoPayment 
        ? 'Crypto payment initiated. Please send crypto to the provided address.' 
        : 'Payment confirmed successfully. Redirecting to TSP.',
      nextAction: tspResponse.nextAction,
      cryptoAddress: isCryptoPayment ? tspResponse.providerResponse?.cryptoAddress : undefined,
      requiresCardDetails: false,
      supportedCurrencies,
      supportedCountries,
    };
  }


  /**
   * Process payment with TSP integration
   */
  async processPayment(request: ProcessPaymentRequest): Promise<ProcessPaymentInternalResponse> {
    try {
      this.logger.log(`Processing payment for intent: ${request.intentId}`);

      // Get payment intent
      const intent = await this.paymentRepository.findOne({
        where: { intentId: request.intentId },
      });

      if (!intent) {
        throw new Error('Payment intent not found');
      }

      // Check if payment intent has expired (5 minutes)
      const expirationCheck = this.checkPaymentIntentExpiration(intent);
      if (expirationCheck.isExpired) {
        // Automatically abandon expired payment intent
        await this.abandonExpiredPaymentIntent(intent, request.requestId);

        const expiredResponseCode = '1090'; // Payment intent expired
        const expiredCategory = ResponseCodeManager.categorizeTransaction(expiredResponseCode);
        const expiredRetryInfo = ResponseCodeManager.canRetryTransaction(expiredResponseCode, 0);

        return {
          intentId: intent.intentId,
          transactionId: 'abandoned_' + Date.now(),
          status: 'canceled',
          responseCode: expiredResponseCode,
          message: ResponseCodeManager.getCustomerMessage(expiredResponseCode),
          merchantMessage: ResponseCodeManager.getMerchantMessage(expiredResponseCode),
          isSuccessful: false,
          requiresFollowup: false,
          transactionCategory: expiredCategory,
          settlement: {
            isEligible: false,
            amount: 0,
            type: 'none',
            reason: 'Payment expired',
          },
          retry: expiredRetryInfo,
          tspProvider: 'EXPIRED',
          parallelProcessingResult: {
            provider: 'EXPIRED',
            ranking: 0,
            confidence: 0,
            responseTime: 0,
          },
          fraudAnalysis: {
            riskScore: 0,
            riskLevel: 'low',
            fraudFlags: ['expired'],
            recommendation: 'decline',
            reasons: ['Payment intent expired'],
            confidence: 1.0,
            analysisTime: 0,
          },
          routingDecision: {
            selectedTSP: 'EXPIRED',
            confidence: 0,
            score: 0,
            reasoning: ['Payment intent expired'],
            factors: {},
            alternatives: [],
            fallbackChain: [],
            routingTime: 0,
            timestamp: new Date(),
            analyticsData: null,
          },
          httpStatusCode: ResponseCodeManager.getHttpStatusCode(expiredResponseCode),
          // DTO fields
          externalTransactionId: undefined,
          amount: intent.amount,
          currency: intent.currency as Currency,
          processingTimeMs: 0,
          failureReason: `Payment intent expired after ${expirationCheck.expiredMinutes} minutes`,
          error: {
            code: expiredResponseCode,
            type: expiredCategory.type,
            category: expiredCategory.category,
            details: `Payment intent expired after ${expirationCheck.expiredMinutes} minutes`,
          },
        };
      }

      // Enhanced fraud analysis with all detection methods
      // TODO: Update fraud service to accept string merchantId  
      const fraudAnalysis = await this.fraudService.performEnhancedFraudAnalysis(
        parseInt(intent.merchantId, 10) || 0,
        request.customerDetails?.customerId || `cust_${Date.now()}`,
        intent.amount,
        intent.currency,
        request.paymentMethodDetails,
        request.deviceInfo,
        request.customerDetails,
        request.deviceInfo?.ipAddress
      );

      // Check if payment should be declined due to fraud
      if (fraudAnalysis.recommendation === 'decline') {
        this.logger.warn(`Payment declined due to fraud: ${request.intentId}, risk: ${fraudAnalysis.riskScore}`);

        const transaction = await this.transactionRepository.save({
          paymentIntentId: intent.intentId,
          tspProvider: null,
          status: 'failed',
          amount: intent.amount,
          currency: intent.currency as Currency,
          responseCode: '1072', // Payment declined due to fraud
          failureReason: `Fraud risk too high: ${fraudAnalysis.riskLevel}`,
          paymentMethodDetails: request.paymentMethodDetails,
          customerDetails: request.customerDetails,
          deviceInfo: request.deviceInfo,
          metadata: {
            ...request.metadata,
            fraudAnalysis,
          },
          requestId: request.requestId,
        } as any);

        await this.paymentRepository.update(intent.id, {
          status: 'requires_payment_method' as any,
        });

        const fraudCategory = ResponseCodeManager.categorizeTransaction('1072');
        const fraudRetryInfo = ResponseCodeManager.canRetryTransaction('1072', 0);
        const fraudSettlement = ResponseCodeManager.getSettlementEligibility('1072', intent.amount);

        return {
          intentId: intent.intentId,
          transactionId: transaction.id,
          status: 'failed',
          responseCode: '1072',
          message: ResponseCodeManager.getCustomerMessage('1072'),
          merchantMessage: ResponseCodeManager.getMerchantMessage('1072'),
          isSuccessful: false,
          requiresFollowup: false,
          transactionCategory: fraudCategory,
          settlement: {
            isEligible: fraudSettlement.isEligible,
            amount: fraudSettlement.settlementAmount,
            type: fraudSettlement.settlementType,
            reason: fraudSettlement.reason,
          },
          retry: fraudRetryInfo,
          tspProvider: 'FRAUD_BLOCKED',
          parallelProcessingResult: {
            provider: 'FRAUD_BLOCKED',
            ranking: 0,
            confidence: 0,
            responseTime: 0,
          },
          fraudAnalysis,
          routingDecision: {
            selectedTSP: 'FRAUD_BLOCKED',
            confidence: 0,
            score: 0,
            reasoning: ['Transaction blocked due to fraud'],
            factors: {},
            alternatives: [],
            fallbackChain: [],
            routingTime: 0,
            timestamp: new Date(),
            analyticsData: null,
          },
          httpStatusCode: ResponseCodeManager.getHttpStatusCode('1072'),
          // DTO fields
          externalTransactionId: undefined,
          amount: intent.amount,
          currency: intent.currency as Currency,
          processingTimeMs: 0,
          failureReason: 'Security check failed',
        };
      }

      // Ultra-Fast Smart Routing Decision
      const routingContext = {
        merchantId: intent.merchantId,
        amount: intent.amount,
        currency: intent.currency as Currency,
        paymentMethod: request.paymentMethodDetails?.type || 'card',
        customerEmail: intent.customerEmail,
        customerCountry: request.customerDetails?.address?.country || 'IN',
        riskLevel: fraudAnalysis.riskLevel,
        transactionHistory: [], // TODO: Add customer transaction history
        timeOfDay: new Date().getHours(),
      metadata: {
        ...request.metadata,
        supportedCurrencies: (intent.metadata as any)?.supportedCurrencies,
        supportedCountries: (intent.metadata as any)?.supportedCountries,
      },
      };

      this.logger.log(`Getting smart routing decision for payment (risk: ${fraudAnalysis.riskLevel})`);
      const routingDecision = await this.routingService.getRoutingDecision(routingContext, request.requestId);

      // Get TSP candidates with fallback chain
      const extractTSPName = (item: any): string => {
        return typeof item === 'string' ? item : item?.provider || item?.name || item;
      };

      const tspCandidates = [
        routingDecision.selectedTSP,
        ...(routingDecision.fallbackChain || []).map(extractTSPName),
        ...(routingDecision.alternatives || []).map(extractTSPName)
      ]
        .filter((tsp): tsp is string => typeof tsp === 'string' && tsp.length > 0)
        .filter((tsp, index, arr) => arr.indexOf(tsp) === index); // Remove duplicates

      // Create initial payment transaction record
      const transaction = await this.transactionRepository.save({
        paymentIntentId: intent.intentId,
        tspProvider: 'PARALLEL_PROCESSING', // Will be updated after processing
        status: 'processing',
        amount: intent.amount,
        currency: intent.currency as Currency,
        responseCode: '1088', // Processing
        paymentMethodDetails: request.paymentMethodDetails,
        customerDetails: request.customerDetails,
        deviceInfo: request.deviceInfo,
        metadata: {
          ...request.metadata,
          fraudAnalysis,
          routingDecision,
          tspCandidates,
        },
        requestId: request.requestId,
      } as any);

      const tspRequest: TSPRequest = {
        provider: routingDecision.selectedTSP,
        merchantId: intent.merchantId,
        amount: intent.amount,
        currency: intent.currency as Currency,
        customerDetails: {
          customerId: request.customerDetails?.customerId,
          email: intent.customerEmail,
          name: request.customerDetails?.name,
          phone: request.customerDetails?.phone,
          address: request.customerDetails?.address,
        },
        paymentMethod: {
          type: request.paymentMethodDetails?.type,
          details: request.paymentMethodDetails,
        },
        metadata: {
          description: intent.description,
          returnUrl: intent.returnUrl,
          cancelUrl: intent.returnUrl,
          webhookUrl: intent.webhookUrl,
          requestId: request.requestId,
          fraudRiskLevel: fraudAnalysis.riskLevel,
          ...request.metadata,
          supportedCurrencies: (intent.metadata as any)?.supportedCurrencies,
          supportedCountries: (intent.metadata as any)?.supportedCountries,
        },
      };

      // Execute Ultra-Fast Parallel TSP Processing
      this.logger.log(`Processing payment with ${tspCandidates.length} TSP candidates (primary: ${routingDecision.selectedTSP})`);

      const parallelResult = await this.parallelTSPProcessor.processPayment(
        tspRequest,
        tspCandidates,
        {
          maxParallel: Math.min(3, tspCandidates.length),
          failureTolerance: 1,
          timeoutMs: 15000,
          requireAllSuccess: false,
        }
      );

      // Update transaction with parallel processing result
      await this.transactionRepository.update(transaction.id, {
        tspProvider: parallelResult.provider,
        externalTransactionId: parallelResult.response.externalTransactionId,
        status: this.mapParallelTSPStatusToTransactionStatus(parallelResult.response.status),
        responseCode: this.mapParallelTSPStatusToResponseCode(parallelResult.response.status, parallelResult.response.success),
        tspResponse: parallelResult.response,
        responseTimeMs: parallelResult.response.responseTime,
        metadata: {
          ...(transaction.metadata || {}),
          parallelProcessing: {
            selectedProvider: parallelResult.provider,
            ranking: parallelResult.ranking,
            confidence: parallelResult.confidence,
            routingTime: parallelResult.response.responseTime || 0,
          },
        },
      } as any);

      // Map TSP response to standardized response code
      const responseCode = this.mapParallelTSPStatusToResponseCode(parallelResult.response.status, parallelResult.response.success);

      // Use ResponseCodeManager for intelligent intent status transition
      const intentTransition = ResponseCodeManager.shouldUpdatePaymentIntent(responseCode);

      if (intentTransition.shouldUpdate) {
        await this.paymentRepository.update(intent.id, {
          status: intentTransition.newIntentStatus as any,
        });
        this.logger.log(`Payment intent status updated: ${intentTransition.newIntentStatus} (${intentTransition.reason})`);
      }

      // Get comprehensive transaction categorization
      const transactionCategory = ResponseCodeManager.categorizeTransaction(responseCode);

      // Check settlement eligibility
      const settlementInfo = ResponseCodeManager.getSettlementEligibility(responseCode, intent.amount);

      // Get retry information for failed transactions
      const retryInfo = ResponseCodeManager.canRetryTransaction(responseCode, 0);

      // Process settlement for eligible transactions (async, non-blocking)
      if (settlementInfo.isEligible) {
        setImmediate(() => {
          this.processSettlement(
            responseCode,
            intent.amount,
            parseInt(intent.merchantId, 10) || 0,
            transaction.id,
            parallelResult.provider
          );
        });
      }

      this.logger.log(`Payment processing completed: ${request.intentId} -> ${parallelResult.response.status} via ${parallelResult.provider} (${parallelResult.response.responseTime}ms)`);
      this.logger.log(`Response Code: ${responseCode} | Category: ${transactionCategory.category} | Settlement: ${settlementInfo.isEligible ? `${settlementInfo.settlementType} ${settlementInfo.settlementAmount}` : 'none'}`);

      // Enhanced return object with full ResponseCodeManager integration
      return {
        intentId: intent.intentId,
        transactionId: transaction.id,
        status: intentTransition.newIntentStatus,
        responseCode,

        // Customer & Merchant Messages
        message: ResponseCodeManager.getCustomerMessage(responseCode),
        merchantMessage: ResponseCodeManager.getMerchantMessage(responseCode),

        // Transaction Classification
        isSuccessful: ResponseCodeManager.isSuccessfulTransaction(responseCode),
        requiresFollowup: ResponseCodeManager.requiresFollowup(responseCode),
        transactionCategory: {
          isSuccessful: transactionCategory.isSuccessful,
          isFailed: transactionCategory.isFailed,
          isPending: transactionCategory.isPending,
          requiresCustomerAction: transactionCategory.requiresCustomerAction,
          canRetry: transactionCategory.canRetry,
          category: transactionCategory.category,
          type: transactionCategory.type,
        },

        // Settlement Information
        settlement: {
          isEligible: settlementInfo.isEligible,
          amount: settlementInfo.settlementAmount,
          type: settlementInfo.settlementType,
          reason: settlementInfo.reason,
        },

        // Retry Information (for failed transactions)
        retry: {
          canRetry: retryInfo.canRetry,
          maxRetries: retryInfo.maxRetries,
          retryDelaySeconds: retryInfo.retryDelaySeconds,
          reason: retryInfo.reason,
        },

        // TSP Processing Results
        tspProvider: parallelResult.provider,
        parallelProcessingResult: {
          provider: parallelResult.provider,
          ranking: parallelResult.ranking,
          confidence: parallelResult.confidence,
          responseTime: parallelResult.response.responseTime,
        },

        // Additional Context
        fraudAnalysis,
        routingDecision: {
          selectedTSP: routingDecision.selectedTSP,
          confidence: routingDecision.confidence,
          score: routingDecision.score || 0,
          reasoning: routingDecision.reasoning || [],
          factors: routingDecision.factors || {},
          alternatives: Array.isArray(routingDecision.alternatives) ?
            routingDecision.alternatives.map(alt =>
              typeof alt === 'string'
                ? { provider: alt, score: 0, reasoning: [] }
                : alt
            ) : [],
          fallbackChain: Array.isArray(routingDecision.fallbackChain) ? routingDecision.fallbackChain : [],
          routingTime: routingDecision.routingTime || 0,
          timestamp: new Date(),
          analyticsData: routingDecision.analyticsData || null,
        },
        httpStatusCode: ResponseCodeManager.getHttpStatusCode(responseCode),
        redirectUrl: parallelResult.response.metadata?.redirectUrl,
        // DTO fields required by ProcessPaymentResponse
        externalTransactionId: parallelResult.response.externalTransactionId,
        amount: intent.amount,
        currency: intent.currency as Currency,
        processingTimeMs: parallelResult.response.responseTime || 0,
        completedAt: transactionCategory.isSuccessful ? new Date() : undefined,
        failureReason: transactionCategory.isFailed ? ResponseCodeManager.getCustomerMessage(responseCode) : undefined,
      };

    } catch (error) {
      this.logger.error(`Payment processing failed: ${request.intentId}`, error);

      // Map error to appropriate response code
      const errorResponseCode = this.mapErrorToResponseCode(error);
      const errorCategory = ResponseCodeManager.categorizeTransaction(errorResponseCode);
      const errorRetryInfo = ResponseCodeManager.canRetryTransaction(errorResponseCode, 0);

      // Update intent status based on error type
      const errorIntentTransition = ResponseCodeManager.shouldUpdatePaymentIntent(errorResponseCode);
      if (errorIntentTransition.shouldUpdate) {
        try {
          const intent = await this.paymentRepository.findOne({
            where: { intentId: request.intentId }
          });
          if (intent) {
            await this.paymentRepository.update(intent.id, {
              status: errorIntentTransition.newIntentStatus as any,
            });
            this.logger.log(`Payment intent error status: ${errorIntentTransition.newIntentStatus} (${errorIntentTransition.reason})`);
          }
        } catch (updateError) {
          this.logger.error('Failed to update intent status after error', updateError);
        }
      }

      // Return structured error response with retry information
      return {
        intentId: request.intentId,
        transactionId: 'error_' + Date.now(),
        status: errorIntentTransition.newIntentStatus || 'requires_payment_method',
        responseCode: errorResponseCode,
        message: ResponseCodeManager.getCustomerMessage(errorResponseCode),
        merchantMessage: ResponseCodeManager.getMerchantMessage(errorResponseCode),
        isSuccessful: false,
        requiresFollowup: errorCategory.requiresCustomerAction,
        transactionCategory: errorCategory,
        settlement: {
          isEligible: false,
          amount: 0,
          type: 'none',
          reason: 'Transaction failed',
        },
        retry: errorRetryInfo,
        tspProvider: 'ERROR',
        parallelProcessingResult: {
          provider: 'ERROR',
          ranking: 0,
          confidence: 0,
          responseTime: 0,
        },
        fraudAnalysis: {
          riskScore: 0,
          riskLevel: 'low',
          fraudFlags: [],
          recommendation: 'decline',
          reasons: ['Transaction error'],
        },
        routingDecision: {
          selectedTSP: 'ERROR',
          confidence: 0,
          score: 0,
          reasoning: ['Payment processing error'],
          factors: {},
          alternatives: [],
          fallbackChain: [],
          routingTime: 0,
          timestamp: new Date(),
          analyticsData: null,
        },
        httpStatusCode: ResponseCodeManager.getHttpStatusCode(errorResponseCode),
        // DTO fields
        externalTransactionId: undefined,
        amount: 0,
        currency: Currency.INR,
        processingTimeMs: 0,
        failureReason: process.env.NODE_ENV === 'development' ? error.message : 'Transaction error',
        error: {
          code: errorResponseCode,
          type: errorCategory.type,
          category: errorCategory.category,
          details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        },
      };
    }
  }

  /**
   * Get payment status with transaction details
   */
  async getPaymentStatus(intentId: string): Promise<GetPaymentStatusResponse> {
    try {
      this.logger.log(`Getting payment status for intent: ${intentId}`);

      // Get intent with latest transaction
      const intent = await this.paymentRepository.findOne({
        where: { intentId },
        relations: ['transactions'],
      });

      if (!intent) {
        throw new Error('Payment intent not found');
      }

      // Get latest transaction
      const latestTransaction = intent.getLatestTransaction();

      if (!latestTransaction) {
        return {
          intentId: intent.intentId,
          status: intent.status,
          amount: intent.amount,
          currency: intent.currency as Currency,
          transactionId: undefined,
          externalTransactionId: undefined,
          tspProvider: 'unknown',
          createdAt: intent.createdAt,
          completedAt: intent.completedAt,
          failureReason: undefined,
          metadata: intent.metadata,
        };
      }

      return {
        intentId: intent.intentId,
        status: intent.status,
        amount: intent.amount,
        currency: intent.currency as Currency,
        transactionId: latestTransaction.transactionId,
        externalTransactionId: latestTransaction.externalTransactionId,
        tspProvider: latestTransaction.tspProvider,
        createdAt: intent.createdAt,
        completedAt: latestTransaction.completedAt,
        failureReason: latestTransaction.statusDescription,
        metadata: intent.metadata,
      };

    } catch (error) {
      this.logger.error(`Get payment status failed: ${intentId}`, error);
      throw error;
    }
  }

  /**
   * Cancel a payment intent
   */
  async cancelPaymentIntent(intentId: string, requestId: string): Promise<{ intentId: string; status: string; message: string }> {
    try {
      this.logger.log(`Cancelling payment intent: ${intentId}`);

      const intent = await this.paymentRepository.findOne({
        where: { intentId },
        relations: ['transactions'],
      });

      if (!intent) {
        throw new Error('Payment intent not found');
      }

      if (intent.status === 'succeeded') {
        throw new Error('Cannot cancel a completed payment');
      }

      if (intent.status === 'canceled') {
        return {
          intentId: intent.intentId,
          status: 'canceled',
          message: 'Payment intent already canceled',
        };
      }

      const previousStatus = intent.status;
      intent.status = 'canceled';
      intent.updatedAt = new Date();
      await this.paymentRepository.save(intent);

      // Publish Kafka event for payment cancellation
      try {
        const latestTransaction = intent.getLatestTransaction();
        const metadata = intent.metadata as any || {};
        
        const event: PaymentStatusEvent = {
          eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          eventType: 'payment.intent.cancelled',
          timestamp: new Date().toISOString(),
          source: 'payment-engine',
          version: '1.0',
          environment: this.environment,
          data: {
            intentId: intent.intentId,
            merchantId: intent.merchantId,
            amount: intent.amount,
            currency: intent.currency,
            status: 'canceled',
            previousStatus: previousStatus,
            transactionId: latestTransaction?.transactionId,
            paymentMethod: latestTransaction?.paymentMethod || 'unknown',
            tspProvider: latestTransaction?.tspProvider || 'unknown',
            customerEmail: intent.customerEmail,
            customerPhone: intent.customerPhone,
            customerName: metadata.customerName || metadata.customer_name,
            customerIp: intent.clientIpAddress || metadata.customerIp || metadata.customer_ip,
            reason: 'Manual cancellation',
            metadata: {
              orderId: intent.description,
              environment: this.environment,
              requestId,
              ...metadata,
            },
          },
        };

        await this.kafkaProducer.publishPaymentStatusEvent(event);
        this.logger.log(`✅ Kafka event published for canceled payment intent: ${intentId}`);
      } catch (kafkaError) {
        // Log error but don't fail the cancellation
        this.logger.error(`Failed to publish Kafka event for payment cancellation: ${intentId}`, kafkaError);
      }

      this.logger.log(`Payment intent ${intentId} canceled successfully`);

      return {
        intentId: intent.intentId,
        status: 'canceled',
        message: 'Payment intent canceled successfully',
      };
    } catch (error) {
      this.logger.error(`Cancel payment intent failed: ${intentId}`, error);
      throw error;
    }
  }

  /**
   * Extract bank code from payment method details
   */
  private extractBankCode(paymentMethodDetails: PaymentMethodDetails): string | undefined {
    if (paymentMethodDetails?.type === 'upi' && paymentMethodDetails.upi?.vpa) {
      // Extract bank from UPI VPA (e.g., user@paytm -> paytm)
      const vpaParts = paymentMethodDetails.upi.vpa.split('@');
      return vpaParts[1]?.toUpperCase();
    }

    if (paymentMethodDetails?.type === 'netbanking') {
      return paymentMethodDetails.netbanking?.bankCode;
    }

    if (paymentMethodDetails?.type === 'card') {
      // Cards don't have bank codes directly, could extract from BIN if needed
      return undefined;
    }

    return undefined;
  }

  /**
   * Map TSP response to standard response code
   */
  private mapTspStatusToResponseCode(tspResponse: any): string {
    if (tspResponse.success && tspResponse.status === 'completed') {
      return '0'; // Success
    }

    if (tspResponse.status === 'pending' || tspResponse.status === 'processing') {
      return '1088'; // Processing
    }

    if (tspResponse.status === 'requires_action') {
      return '3000'; // Requires action
    }

    if (tspResponse.status === 'cancelled') {
      return '1043'; // Cancelled
    }

    // Default to generic failure
    return '1000'; // Transaction failed
  }

  /**
   * Map TSP status to Payment Intent status
   */
  private mapTspStatusToIntentStatus(tspResponse: any): string {
    if (tspResponse.success && tspResponse.status === 'completed') {
      return 'succeeded';
    }

    if (tspResponse.status === 'pending' || tspResponse.status === 'processing') {
      return 'processing';
    }

    if (tspResponse.status === 'requires_action') {
      return 'requires_action';
    }

    if (tspResponse.status === 'cancelled') {
      return 'canceled';
    }

    // For failures, go back to requiring payment method
    return 'requires_payment_method';
  }

  /**
   * Map Parallel TSP response status to response code
   */
  private mapParallelTSPStatusToResponseCode(status: 'processing' | 'completed' | 'failed' | 'timeout', success: boolean): string {
    if (success && status === 'completed') {
      return '0'; // Success
    }

    if (status === 'processing') {
      return '1088'; // Processing
    }

    if (status === 'timeout') {
      return '1089'; // Timeout
    }

    if (status === 'failed') {
      return '1000'; // Transaction failed
    }

    // Default to processing
    return '1088';
  }

  /**
   * Map Parallel TSP status to Payment Intent status
   */
  private mapParallelTSPStatusToIntentStatus(response: any): string {
    if (response.success && response.status === 'completed') {
      return 'succeeded';
    }

    if (response.status === 'processing') {
      return 'processing';
    }

    if (response.status === 'timeout') {
      return 'requires_payment_method'; // Allow retry
    }

    if (response.status === 'failed') {
      // Check if error is retryable
      if (response.error?.retryable) {
        return 'requires_payment_method'; // Allow retry
      }
      return 'canceled'; // Permanent failure
    }

    // Default to processing
    return 'processing';
  }

  /**
   * Map Parallel TSP status to transaction status
   */
  private mapParallelTSPStatusToTransactionStatus(status: 'processing' | 'completed' | 'failed' | 'timeout'): string {
    switch (status) {
      case 'completed':
        return 'completed';
      case 'processing':
        return 'processing';
      case 'failed':
        return 'failed';
      case 'timeout':
        return 'timeout';
      default:
        return 'processing';
    }
  }

  /**
   * Map error to appropriate response code using ResponseCodeManager system
   */
  private mapErrorToResponseCode(error: any): string {
    const errorMessage = error.message?.toLowerCase() || '';

    // Map specific error types to response codes
    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      return '4000'; // TSP request timeout
    }

    if (errorMessage.includes('network') || errorMessage.includes('connection')) {
      return '1051'; // Database/network connection error
    }

    if (errorMessage.includes('insufficient')) {
      return '1015'; // Insufficient funds
    }

    if (errorMessage.includes('declined') || errorMessage.includes('rejected')) {
      return '1009'; // Transaction declined by bank
    }

    if (errorMessage.includes('fraud') || errorMessage.includes('blocked')) {
      return '2000'; // Transaction blocked due to fraud
    }

    if (errorMessage.includes('expired') || errorMessage.includes('invalid')) {
      return '1072'; // Card blocked or expired
    }

    if (errorMessage.includes('limit')) {
      return '1075'; // Daily transaction limit exceeded
    }

    if (errorMessage.includes('tsp') || errorMessage.includes('integration')) {
      return '1050'; // TSP integration error
    }

    // Default to general system error
    return '1000'; // General transaction failure
  }

  /**
   * Process settlement for successful transactions
   */
  private async processSettlement(
    responseCode: string,
    amount: number,
    merchantId: number,
    transactionId: string,
    tspProvider: string
  ): Promise<void> {
    const settlementInfo = ResponseCodeManager.getSettlementEligibility(responseCode, amount);

    if (!settlementInfo.isEligible) {
      this.logger.debug(`Transaction ${transactionId} not eligible for settlement: ${settlementInfo.reason}`);
      return;
    }

    try {
      this.logger.log(`Processing settlement: ${settlementInfo.settlementType} ${Math.abs(settlementInfo.settlementAmount)} for merchant ${merchantId}`);

      // TODO: Integrate with Wallet Service for actual settlement
      // Example: await this.walletService.creditMerchantWallet(merchantId, settlementInfo.settlementAmount, transactionId);

      // For now, just log the settlement action
      this.logger.log(`Settlement processed: ${transactionId} | Type: ${settlementInfo.settlementType} | Amount: ${settlementInfo.settlementAmount} | TSP: ${tspProvider}`);

    } catch (error) {
      this.logger.error(`Settlement processing failed for transaction ${transactionId}:`, error);
      // Don't throw - settlement failures shouldn't affect payment success
    }
  }

  /**
   * Select TSP based on fraud risk level
   */
  private selectTSPBasedOnRisk(fraudAnalysis: { riskLevel: string }): string {
    // Route high-risk transactions to more secure TSPs
    if (fraudAnalysis.riskLevel === 'high' || fraudAnalysis.riskLevel === 'critical') {
      return 'stripe'; // Stripe has better fraud protection
    }

    if (fraudAnalysis.riskLevel === 'medium') {
      return 'razorpay'; // Balanced option
    }

    // Low risk can use any TSP (cost optimization)
    return 'paytara'; // Usually has lower fees
  }

  /**
   * Map TSP status to transaction status
   */
  private mapTSPStatusToTransactionStatus(tspStatus: string): string {
    switch (tspStatus) {
      case 'completed':
        return 'success';
      case 'created':
      case 'pending':
        return 'processing';
      case 'failed':
        return 'failed';
      case 'cancelled':
        return 'cancelled';
      case 'requires_action':
        return 'waiting_customer';
      default:
        return 'processing';
    }
  }

  /**
   * Map TSP status to Valorapays response code
   */
  private mapTSPStatusToResponseCode(tspStatus: string, success: boolean): string {
    if (success && tspStatus === 'completed') {
      return '0'; // Success
    }

    switch (tspStatus) {
      case 'created':
      case 'pending':
        return '1088'; // Processing
      case 'requires_action':
        return '3000'; // Requires action
      case 'failed':
        return '1000'; // Generic failure
      case 'cancelled':
        return '1043'; // Cancelled
      default:
        return '1088'; // Processing
    }
  }

  /**
   * Check if payment intent has expired (5 minutes timeout)
   */
  private checkPaymentIntentExpiration(intent: PaymentIntent): ExpirationCheckResult {
    const now = new Date();
    const createdAt = new Date(intent.createdAt);
    const elapsedMs = now.getTime() - createdAt.getTime();
    const expirationTimeoutMs = STATE_TRANSITION_RULES.paymentIntent.expirationTimeoutMs;

    const isExpired = elapsedMs >= expirationTimeoutMs;
    const expiredMinutes = Math.floor(elapsedMs / (60 * 1000));
    const remainingMs = Math.max(0, expirationTimeoutMs - elapsedMs);

    this.logger.debug(`Payment intent ${intent.intentId} expiration check: ${expiredMinutes} minutes elapsed, ${remainingMs}ms remaining, expired: ${isExpired}`);

    return {
      isExpired,
      expiredMinutes,
      remainingMs,
    };
  }

  /**
   * Abandon expired payment intent and create abandonment transaction
   */
  private async abandonExpiredPaymentIntent(intent: PaymentIntent, requestId: string): Promise<void> {
    try {
      this.logger.log(`Abandoning expired payment intent: ${intent.intentId} (${requestId})`);

      // Update payment intent status to canceled
      await this.paymentRepository.update(intent.id, {
        status: 'canceled' as any,
        updatedAt: new Date(),
      });

      // Create an abandonment transaction record for tracking
      const abandonmentTransaction = await this.transactionRepository.save({
        paymentIntentId: intent.intentId,
        merchantId: intent.merchantId,
        tspProvider: 'SYSTEM_EXPIRATION',
        status: 'abandoned',
        amount: intent.amount,
        currency: intent.currency as Currency,
        responseCode: '1090', // Payment intent expired
        responseType: 'EXPIRED',
        statusDescription: 'Payment intent expired (5 minute limit)',
        isFinalStatus: true,
        requiresFollowup: false,
        settlementEligible: false,
        abandonedAt: new Date(),
        attemptNumber: 1,
        metadata: {
          abandonmentReason: 'PAYMENT_INTENT_EXPIRED',
          expirationTimeMinutes: 5,
          requestId,
        },
        requestId,
      } as any);

      this.logger.log(`Created abandonment transaction: ${abandonmentTransaction.id} for expired intent: ${intent.intentId}`);

    } catch (error) {
      this.logger.error(`Failed to abandon expired payment intent ${intent.intentId}:`, error);
      // Don't throw - expiration handling shouldn't fail the request
    }
  }

  /**
   * Finalize payment intent status based on final transaction result
   * This method should be called by PaymentTransactionService after transaction completion
   */
  async finalizePaymentIntentFromTransaction(
    transactionId: string,
    responseCode: string,
    requestId: string
  ): Promise<void> {
    try {
      // Get transaction with intent
      const transaction = await this.transactionRepository.findOne({
        where: { transactionId: transactionId },
        relations: ['paymentIntent']
      });

      if (!transaction || !transaction.intent) {
        this.logger.error(`Transaction ${transactionId} or associated payment intent not found`);
        return;
      }

      const intent = transaction.intent;

      // Use ResponseCodeManager to determine final intent status
      const intentTransition = ResponseCodeManager.shouldUpdatePaymentIntent(responseCode);

      if (intentTransition.shouldUpdate) {
        // Update payment intent with final status
        await this.paymentRepository.update(intent.id, {
          status: intentTransition.newIntentStatus as any,
          updatedAt: new Date(),
        });

        // Check if settlement is needed
        const settlementInfo = ResponseCodeManager.getSettlementEligibility(responseCode, intent.amount);
        if (settlementInfo.isEligible) {
          // Process settlement asynchronously
          setImmediate(() => {
            this.processSettlement(
              responseCode,
              intent.amount,
              parseInt(intent.merchantId, 10) || 0,
              transactionId,
              transaction.tspProvider
            );
          });
        }

        this.logger.log(
          `Payment intent ${intent.intentId} finalized: ${intentTransition.newIntentStatus} ` +
          `(${intentTransition.reason}) via transaction ${transactionId} | ` +
          `Settlement: ${settlementInfo.isEligible ? `${settlementInfo.settlementType} ${settlementInfo.settlementAmount}` : 'none'}`
        );
      }

    } catch (error) {
      this.logger.error(`Failed to finalize payment intent from transaction ${transactionId}:`, error);
      // Don't throw - finalization failures shouldn't affect transaction success
    }
  }

  /**
   * Batch cleanup of expired payment intents (can be called by scheduled job)
   */
  async cleanupExpiredPaymentIntents(batchSize: number = 100): Promise<CleanupResult> {
    const results: CleanupResult = {
      processedCount: 0,
      abandonedCount: 0,
      errors: []
    };

    try {
      // Find expired payment intents that are still in processing state
      const cutoffTime = new Date(Date.now() - STATE_TRANSITION_RULES.paymentIntent.expirationTimeoutMs);

      const { LessThan, In } = await import('typeorm');

      const expiredIntents = await this.paymentRepository.find({
        where: {
          status: In(['requires_payment_method', 'requires_confirmation', 'processing']),
          createdAt: LessThan(cutoffTime),
        },
        take: batchSize,
        order: { createdAt: 'ASC' }
      });

      this.logger.log(`Found ${expiredIntents.length} expired payment intents to cleanup`);

      for (const intent of expiredIntents) {
        try {
          results.processedCount++;

          // Check expiration to get detailed info
          const expirationCheck = this.checkPaymentIntentExpiration(intent);

          if (expirationCheck.isExpired) {
            await this.abandonExpiredPaymentIntent(intent, `cleanup_job_${Date.now()}`);
            results.abandonedCount++;
          }

        } catch (error) {
          this.logger.error(`Failed to cleanup expired intent ${intent.id}:`, error);
          results.errors.push({ intentId: intent.intentId, error: error.message });
        }
      }

      this.logger.log(
        `Expired payment intents cleanup completed: ` +
        `${results.processedCount} processed, ${results.abandonedCount} abandoned, ${results.errors.length} errors`
      );

      return results;

    } catch (error) {
      this.logger.error('Failed to cleanup expired payment intents:', error);
      throw error;
    }
  }

  /**
   * Calculate processing fee based on TSP configuration from database
   */
  private async calculateProcessingFee(amount: number, routingDecision: any): Promise<number> {
    try {
      // Get the actual TSP configuration from database through routing decision
      if (routingDecision.tspConfiguration) {
        const tspConfig = routingDecision.tspConfiguration;
        const percentageFee = amount * (tspConfig.processingFeePercentage / 100);
        const totalFee = percentageFee + (tspConfig.processingFeeFixed || 0);

        return Math.round(totalFee * 100) / 100; // Round to 2 decimal places
      }

      // Fallback: query TSP configuration directly from database
      const tspConfig = await this.getTSPConfiguration(routingDecision.selectedTSP);
      if (tspConfig) {
        const percentageFee = amount * (tspConfig.processingFeePercentage / 100);
        const totalFee = percentageFee + (tspConfig.processingFeeFixed || 0);

        return Math.round(totalFee * 100) / 100;
      }

      // Should never reach here in production - indicates missing TSP configuration
      this.logger.error(`No TSP configuration found for: ${routingDecision.selectedTSP}`);
      throw new Error(`TSP configuration not found: ${routingDecision.selectedTSP}`);

    } catch (error) {
      this.logger.error(`Failed to calculate processing fee for TSP: ${routingDecision.selectedTSP}`, error);
      throw error;
    }
  }

  /**
   * Get TSP configuration from database
   */
  private async getTSPConfiguration(providerName: TSPProvider): Promise<TSPConfiguration | null> {
    try {
      const tspConfig = await this.tspConfigRepository.findOne({
        where: {
          providerName: providerName,
          isActive: true
        }
      });

      if (!tspConfig) {
        this.logger.warn(`TSP configuration not found for provider: ${providerName}`);
        return null;
      }

      return tspConfig;
    } catch (error) {
      this.logger.error(`Failed to retrieve TSP configuration for ${providerName}:`, error);
      return null;
    }
  }

  /**
   * PUBLIC: Get payment intent details for payment page (No Authentication Required)
   * This method is used by the payment page to fetch payment intent details
   */
  async getPublicPaymentIntentDetails(intentId: string): Promise<any> {
    this.logger.log(`Fetching public payment intent details for: ${intentId}`);

    try {
      // Find the payment intent
      const paymentIntent = await this.paymentRepository.findOne({
        where: { intentId }
      });

      if (!paymentIntent) {
        this.logger.warn(`Payment intent not found: ${intentId}`);
        throw new Error('Payment intent not found');
      }

      // Check if expired
      const now = new Date();
      const isExpired = now > paymentIntent.expiresAt;

      if (isExpired) {
        this.logger.warn(`Payment intent expired: ${intentId}, expired at: ${paymentIntent.expiresAt}`);

        // Update status to canceled (closest to expired)
        if (paymentIntent.status !== 'canceled') {
          paymentIntent.status = 'canceled';
          paymentIntent.updatedAt = now;
          await this.paymentRepository.save(paymentIntent);
        }

        throw new Error('Payment intent has expired');
      }

      // Get merchant information from merchant service via gRPC
      let merchantInfo = {
        merchantName: 'Unknown Merchant',
        merchantLogo: null,
      };

      try {
        // For now, use a default merchant name based on merchantId
        // In a real implementation, this would call the merchant service
        merchantInfo = {
          merchantName: `Merchant ${paymentIntent.merchantId}`,
          merchantLogo: null,
        };
      } catch (error) {
        this.logger.warn(`Failed to fetch merchant info for ${paymentIntent.merchantId}:`, error.message);
      }

      // Determine supported payment methods based on amount and merchant configuration
      const supportedPaymentMethods = this.determineSupportedPaymentMethods(
        paymentIntent.amount,
        paymentIntent.currency,
        paymentIntent.merchantId
      );

      // Prepare response data
      const responseData = {
        intentId: paymentIntent.intentId,
        merchantId: paymentIntent.merchantId,
        merchantName: merchantInfo.merchantName,
        merchantLogo: merchantInfo.merchantLogo,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        description: paymentIntent.description,
        status: paymentIntent.status,
        expiresAt: paymentIntent.expiresAt.toISOString(),
        isExpired: false, // We already checked and threw error if expired
        timeRemaining: Math.max(0, Math.floor((paymentIntent.expiresAt.getTime() - now.getTime()) / 1000)), // seconds
        customerEmail: paymentIntent.customerEmail,
        customerPhone: paymentIntent.customerPhone,
        supportedPaymentMethods,
        processingFee: 0, // Calculate processing fee if needed
        returnUrl: (paymentIntent as any).returnUrl || undefined,
        cancelUrl: (paymentIntent as any).cancelUrl || undefined,
        createdAt: paymentIntent.createdAt.toISOString(),
        redirectUrl: paymentIntent.metadata?.redirectUrl || undefined,
        cryptoAddress: paymentIntent.metadata?.cryptoAddress || undefined,
        cryptoCurrency: paymentIntent.metadata?.cryptoCurrency || undefined,
        nextAction: paymentIntent.metadata?.nextAction || undefined,
      };

      this.logger.log(`Successfully retrieved public payment intent details for: ${intentId}`);
      return responseData;

    } catch (error) {
      this.logger.error(`Failed to fetch public payment intent details for ${intentId}:`, error);

      if (error.message === 'Payment intent not found') {
        throw new Error('Payment intent not found');
      }

      if (error.message === 'Payment intent has expired') {
        throw new Error('Payment intent has expired');
      }

      throw new Error('Failed to retrieve payment intent details');
    }
  }

  /**
   * Determine supported payment methods based on amount, currency, and merchant config
   */
  private hasCardPaymentDetails(paymentMethodDetails?: any): boolean {
    if (!paymentMethodDetails || typeof paymentMethodDetails !== 'object') {
      return false;
    }

    const { cardNumber, expiryMonth, expiryYear, cvv } = paymentMethodDetails;

    if (typeof cardNumber !== 'string' || cardNumber.replace(/\s+/g, '').length < 12) {
      return false;
    }

    if (expiryMonth === undefined || expiryYear === undefined) {
      return false;
    }

    if (cvv === undefined || cvv === null || cvv === '') {
      return false;
    }

    return true;
  }

  private determineSupportedPaymentMethods(amount: number, currency: string, merchantId: string): string[] {
    const allMethods = ['card', 'upi', 'netbanking', 'wallet'];
    const supportedMethods: string[] = [];

    // Basic amount-based filtering
    if (amount >= 100) {
      supportedMethods.push('card', 'netbanking');
    }

    if (amount >= 100 && amount <= 10000000) {
      supportedMethods.push('upi');
    }

    if (amount >= 100 && amount <= 5000000) { 
      supportedMethods.push('wallet');
    }

    // Currency-based filtering
    if (currency === 'INR') {
      // All Indian payment methods supported
      return supportedMethods.length > 0 ? supportedMethods : ['card', 'upi', 'netbanking'];
    }

    return supportedMethods.includes('card') ? ['card'] : ['card'];
  }

  private validateCryptoMinimumAmount(amount: number, currency: string): void {
    const cryptoMinimums: Record<string, { min: number; decimals: number }> = {
      BTC: { min: 0.00001, decimals: 8 },
      ETH: { min: 0.0001, decimals: 8 },
      USDT: { min: 10, decimals: 6 },
      USDC: { min: 10, decimals: 6 },
      BNB: { min: 0.001, decimals: 8 },
      XRP: { min: 1, decimals: 6 },
      SOL: { min: 0.01, decimals: 9 },
      DOGE: { min: 1, decimals: 8 },
      ADA: { min: 1, decimals: 6 },
      TRX: { min: 10, decimals: 6 },
    };

    const currencyUpper = currency.toUpperCase();
    const cryptoConfig = cryptoMinimums[currencyUpper];

    if (cryptoConfig && amount < cryptoConfig.min) {
      throw new Error(
        `Minimum amount for ${currency} is ${cryptoConfig.min.toFixed(cryptoConfig.decimals)} ${currency}`
      );
    }
  }
}