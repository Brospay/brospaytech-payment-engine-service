import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import { TSPAdapter, TSPResponse, PaymentRequest } from '@/types/tsp';
import { TSPConfiguration } from '@/entities/tsp-configuration.entity';
import { LoggerService } from '@/common/services/logger.service';
import {
  KingdomBankAuth,
  KingdomBankHeaders,
  KingdomBankPaymentInitiationRequest,
  KingdomBankPaymentInitiationResponse,
  KingdomBankRefundRequest,
  KingdomBankPayoutRequest,
  KingdomBankTransactionSearchRequest,
  KingdomBankNotification,
  KingdomBankError,
  KingdomBankTransaction,
  KingdomBankTransactionStatus,
  KingdomBankPaymentMethodKey,
  KingdomBankDestinationType,
  KingdomBankValidateDestinationAccountResponse,
} from '@/types/kingdom-bank.types';
import {
  isCryptoCurrency,
  isFiatCurrency,
  mapToKingdomBankCurrency,
  mapFromKingdomBankCurrency,
} from '@/config/tsp-assets-reference';

/**
 * Kingdom Bank TSP Adapter
 * Implements The Kingdom Bank API specification
 */
export class KingdomBankAdapter implements TSPAdapter {
  private client: AxiosInstance;
  private auth: KingdomBankAuth;
  private baseURL: string;

  constructor(
    private config: TSPConfiguration,
    private logger: LoggerService,
  ) {
    // Extract authentication credentials
    this.auth = {
      apiKey: config.credentials['api_key'] as string,
      apiSecret: config.credentials['api_secret'] as string,
      signatureKey: config.credentials['signature_key'] as string,
      signatureKeyId: config.credentials['signature_key_id'] as string,
    };

    // Set base URL based on environment
    this.baseURL = config.environment === 'production' 
      ? 'https://api.thekingdombank.com'
      : 'https://api.sandbox.thekingdombank.com';

    // Initialize HTTP client with default configuration
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Valorapays-PaymentEngine/1.0',
      },
      timeout: 30000, 
    });

    // Validate required credentials
    this.validateCredentials();
    
    this.logger.log(`Kingdom Bank adapter initialized for ${config.environment} environment`);
  }


  async createPayment(request: PaymentRequest): Promise<TSPResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Creating Kingdom Bank payment for amount: ${request.amount} ${request.currency}`);
      
      const selectedPaymentMethod = (request as any).metadata?.selectedPaymentMethod || 'fiat';
      const intentCurrency = request.currency;
      const isCryptoIntentCurrency = isCryptoCurrency(intentCurrency);
      
      this.logger.log(`Kingdom Bank routing: currency=${intentCurrency}, selectedMethod=${selectedPaymentMethod}, isCrypto=${isCryptoIntentCurrency}`);
      
      if (selectedPaymentMethod === 'crypto' && isCryptoIntentCurrency) {
        this.logger.log(`Direct crypto payment: User selected crypto, intent is crypto`);
        
        const network = (request as any).network || 'TRC20';
        
        const cryptoRequest = {
          ...request,
          paymentCurrency: request.currency,
          settlementCurrency: request.currency,
          network,
        } as PaymentRequest & { paymentCurrency: string; settlementCurrency: string; network?: 'ERC20' | 'TRC20' };
        
        return this.createCryptoPayment(cryptoRequest);
      }
      
      if (selectedPaymentMethod === 'fiat' && isCryptoIntentCurrency) {
        this.logger.log(`On-ramping: User selected fiat, intent is ${intentCurrency} (crypto)`);
        
        const network = (request as any).network || 'TRC20';
        const mappedCurrency = mapToKingdomBankCurrency(intentCurrency, network);
        
        this.logger.log(`On-ramping currency mapping: ${intentCurrency} -> ${mappedCurrency}`);
      }
      
      if (selectedPaymentMethod === 'crypto' && !isCryptoIntentCurrency) {
        this.logger.log(`Off-ramping: User selected crypto, intent is ${intentCurrency} (fiat)`);
      }

      const foreignTransactionId = `valorapays_${request.merchantId}_${request.requestId}_${Date.now()}`;
      
      let paymentCurrency = request.currency;
      
      if ((selectedPaymentMethod === 'fiat' && isCryptoIntentCurrency) || (selectedPaymentMethod === 'crypto' && !isCryptoIntentCurrency)) {
        const network = (request as any).network || 'TRC20';
        
        if (isCryptoIntentCurrency) {
          paymentCurrency = mapToKingdomBankCurrency(intentCurrency, network);
          this.logger.log(`Using mapped currency for checkout: ${paymentCurrency}`);
        }
      }
      
      const kbRequest: KingdomBankPaymentInitiationRequest = {
        foreignTransactionId,
        amount: request.amount,
        currency: paymentCurrency,
        notificationUrl: this.getValorapaysWebhookUrl(),
        reference: request.description || 'Valorapays Payment',
        successUrl: request.returnUrl,
        failUrl: request.cancelUrl,
        externalUserId: request.customerId || `customer_${request.merchantId}`,
        customer: request.customerDetails ? this.mapCustomerDetails(request.customerDetails) : undefined,
        paymentMethodFlow: 'CHECKOUT',
        generateInvoice: false,
      };

      const response = await this.makeSignedRequest<KingdomBankPaymentInitiationResponse>(
        'POST',
        '/v1/payments',
        kbRequest
      );
      console.log('response', response);
      
      const responseTime = Date.now() - startTime;
      
      this.logger.log(`Kingdom Bank payment created successfully: ${foreignTransactionId} / KB Request ID: ${response.requestId} (${responseTime}ms)`);

      return {
        success: true,
        transactionId: foreignTransactionId,
        providerTransactionId: response.requestId,
        status: 'created',
        amount: request.amount,
        currency: request.currency,
        responseTime,
        providerResponse: response,
        message: 'Payment initiated successfully',
        redirectUrl: response.redirectUrl,
      };

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      this.logger.error(`Kingdom Bank payment creation failed (${responseTime}ms):`, error);

      return this.handleError(error, {
        transactionId: null,
        providerTransactionId: null,
        status: 'failed',
        amount: request.amount,
        currency: request.currency,
        responseTime,
        message: 'Payment creation failed',
      });
    }
  }

  async verifyPayment(transactionId: string, signature?: string, orderId?: string): Promise<TSPResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Verifying Kingdom Bank payment: ${transactionId}`);
      
      // Search for transaction by ID
      const searchRequest: KingdomBankTransactionSearchRequest = {
        foreignTransactionId: transactionId,
        include: ['LINKED_TRANSACTIONS'],
      };

      const transactions = await this.makeSignedRequest<KingdomBankTransaction[]>(
        'POST',
        '/v1/transactions/search',
        searchRequest
      );
      
      const responseTime = Date.now() - startTime;

      if (!transactions || transactions.length === 0) {
        return {
          success: false,
          transactionId,
          providerTransactionId: transactionId,
          status: 'not_found',
          amount: 0,
          currency: 'USD',
          responseTime,
          error: 'Transaction not found',
          message: 'Payment verification failed - transaction not found',
        };
      }

      const transaction = transactions[0];
      const isCompleted = transaction.status === 'PROCESSED';
      
      this.logger.log(`Kingdom Bank payment verification completed: ${transactionId} -> ${transaction.status} (${responseTime}ms)`);

      return {
        success: isCompleted,
        transactionId,
        providerTransactionId: transaction.transactionId.toString(),
        status: this.mapTransactionStatus(transaction.status),
        amount: transaction.transactionAmount,
        currency: transaction.transactionCurrency,
        responseTime,
        providerResponse: transaction,
        message: `Payment ${isCompleted ? 'completed' : 'verification failed'}`,
      };

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      this.logger.error(`Kingdom Bank payment verification failed (${responseTime}ms):`, error);

      return this.handleError(error, {
        transactionId,
        providerTransactionId: transactionId,
        status: 'failed',
        amount: 0,
        currency: 'USD',
        responseTime,
        message: 'Payment verification failed',
      });
    }
  }

  async getPaymentStatus(transactionId: string): Promise<TSPResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Getting Kingdom Bank payment status: ${transactionId}`);
      
      // Search for transaction status
      const searchRequest: KingdomBankTransactionSearchRequest = {
        foreignTransactionId: transactionId,
      };

      const transactions = await this.makeSignedRequest<KingdomBankTransaction[]>(
        'POST',
        '/v1/transactions/search',
        searchRequest
      );
      
      const responseTime = Date.now() - startTime;

      if (!transactions || transactions.length === 0) {
        return {
          success: false,
          transactionId,
          providerTransactionId: transactionId,
          status: 'not_found',
          amount: 0,
          currency: 'USD',
          responseTime,
          error: 'Transaction not found',
          message: 'Transaction not found',
        };
      }

      const transaction = transactions[0];
      const status = this.mapTransactionStatus(transaction.status);
      const isSuccessful = transaction.status === 'PROCESSED';
      
      this.logger.log(`Kingdom Bank payment status retrieved: ${transactionId} -> ${status} (${responseTime}ms)`);

      return {
        success: isSuccessful,
        transactionId,
        providerTransactionId: transaction.transactionId.toString(),
        status,
        amount: transaction.transactionAmount,
        currency: transaction.transactionCurrency,
        responseTime,
        providerResponse: transaction,
        message: `Payment status: ${status}`,
      };

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      this.logger.error(`Kingdom Bank status check failed (${responseTime}ms):`, error);

      return this.handleError(error, {
        transactionId,
        providerTransactionId: transactionId,
        status: 'failed',
        amount: 0,
        currency: 'USD',
        responseTime,
        message: 'Status check failed',
      });
    }
  }

  async refundPayment(transactionId: string, amount?: number): Promise<TSPResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Processing Kingdom Bank refund: ${transactionId}, amount: ${amount}`);
      
      const parsedTransactionId = parseInt(transactionId, 10);
      
      if (isNaN(parsedTransactionId)) {
        throw new Error(`Invalid transaction ID format: ${transactionId}. Must be a numeric string.`);
      }
      
      const refundRequest: KingdomBankRefundRequest = {
        refundForeignTransactionId: `refund_${transactionId}_${Date.now()}`,
        notificationUrl: this.getValorapaysWebhookUrl(),
        originalTransactionId: parsedTransactionId,
        amount: amount,
      };

      const refund = await this.makeSignedRequest<KingdomBankTransaction>(
        'POST',
        '/v1/refunds',
        refundRequest
      );
      
      const responseTime = Date.now() - startTime;
      
      this.logger.log(`Kingdom Bank refund processed: ${refund.transactionId} (${responseTime}ms)`);

      return {
        success: true,
        transactionId: refund.transactionId.toString(),
        providerTransactionId: refund.transactionId.toString(),
        status: 'refunded',
        amount: refund.transactionAmount,
        currency: refund.transactionCurrency,
        responseTime,
        providerResponse: refund,
        message: 'Refund processed successfully',
      };

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      this.logger.error(`Kingdom Bank refund failed (${responseTime}ms):`, error);

      return this.handleError(error, {
        transactionId,
        providerTransactionId: transactionId,
        status: 'failed',
        amount: amount || 0,
        currency: 'USD',
        responseTime,
        message: 'Refund failed',
      });
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      this.logger.debug('Performing Kingdom Bank health check');
      
      // Use accounts endpoint for health check
      await this.makeSignedRequest<any[]>('GET', '/v1/accounts');
      
      this.logger.debug('Kingdom Bank health check successful');
      return true;
      
    } catch (error) {
      this.logger.warn('Kingdom Bank health check failed:', error);
      return false;
    }
  }

  getProviderName(): string {
    return 'kingdom-bank';
  }

  getEnvironment(): string {
    return this.config.environment;
  }

  verifyWebhookSignature(payload: any, receivedSignature: string, signatureKeyId?: string): boolean {
    try {
      // Verify signature key ID if provided
      if (signatureKeyId && signatureKeyId !== this.auth.signatureKeyId) {
        this.logger.warn(`Kingdom Bank webhook signature key ID mismatch: expected ${this.auth.signatureKeyId}, got ${signatureKeyId}`);
        return false;
      }

      // Generate expected signature
      const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const expectedSignature = this.generateSignature(payloadString);
      
      // Compare signatures
      const isValid = crypto.timingSafeEqual(
        Buffer.from(receivedSignature, 'base64'),
        Buffer.from(expectedSignature, 'base64')
      );

      if (!isValid) {
        this.logger.warn('Kingdom Bank webhook signature verification failed');
      }

      return isValid;
    } catch (error) {
      this.logger.error('Kingdom Bank webhook signature verification error:', error);
      return false;
    }
  }

  /**
   * Create manual bank transfer payment
   */
  async createBankTransferPayment(
    request: PaymentRequest & {
      paymentCurrency: string;
      settlementCurrency: string;
      amountType: 'PAYMENT' | 'SETTLEMENT';
      customerBank?: any;
    }
  ): Promise<TSPResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Creating Kingdom Bank manual bank transfer: ${request.amount} ${request.paymentCurrency}`);
      
      const foreignTransactionId = `valorapays_bt_${request.merchantId}_${request.requestId}_${Date.now()}`;
      
      const kbRequest = {
        foreignTransactionId,
        amount: request.amount,
        amountType: request.amountType || 'PAYMENT',
        paymentCurrency: request.paymentCurrency || request.currency,
        settlementCurrency: request.settlementCurrency || request.currency,
        notificationUrl: this.getValorapaysWebhookUrl(),
        externalUserId: request.customerId || `customer_${request.merchantId}`,
        customer: request.customerDetails ? this.mapCustomerDetails(request.customerDetails) : undefined,
        customerBank: request.customerBank,
      };

      const response = await this.makeSignedRequest<any>(
        'POST',
        '/v1/payments/bank-transfer',
        kbRequest
      );
      
      const responseTime = Date.now() - startTime;
      
      this.logger.log(`Kingdom Bank bank transfer created successfully: ${foreignTransactionId} / KB ID: ${response.requestId} (${responseTime}ms)`);

      return {
        success: true,
        transactionId: foreignTransactionId,  // Our ID for webhook matching
        providerTransactionId: response.requestId,
        status: 'created',
        amount: response.settlementAmount || request.amount,
        currency: response.settlementCurrency || request.currency,
        responseTime,
        providerResponse: response,
        message: 'Bank transfer payment initiated successfully',
      };

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      this.logger.error(`Kingdom Bank bank transfer creation failed (${responseTime}ms):`, error);

      return this.handleError(error, {
        transactionId: null,
        providerTransactionId: null,
        status: 'failed',
        amount: request.amount,
        currency: request.currency,
        responseTime,
        message: 'Bank transfer creation failed',
      });
    }
  }

  /**
   * Create crypto payment with network-specific currency mapping
   */
  async createCryptoPayment(
    request: PaymentRequest & {
      paymentCurrency: string;
      settlementCurrency: string;
      network?: 'ERC20' | 'TRC20';
    }
  ): Promise<TSPResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Creating Kingdom Bank crypto payment: ${request.amount} ${request.paymentCurrency}`);
      
      const mappedPaymentCurrency = mapToKingdomBankCurrency(request.paymentCurrency, request.network);
      const mappedSettlementCurrency = mapToKingdomBankCurrency(request.settlementCurrency, request.network);
      
      this.logger.log(`Currency mapping: ${request.paymentCurrency} -> ${mappedPaymentCurrency}, ${request.settlementCurrency} -> ${mappedSettlementCurrency}`);
      
      const foreignTransactionId = `valorapays_crypto_${request.merchantId}_${request.requestId}_${Date.now()}`;
      
      const kbRequest = {
        foreignTransactionId,
        amount: request.amount,
        paymentCurrency: mappedPaymentCurrency,
        settlementCurrency: mappedSettlementCurrency,
        notificationUrl: this.getValorapaysWebhookUrl(),
        externalUserId: request.customerId || `customer_${request.merchantId}`,
      };

      const response = await this.makeSignedRequest<any>(
        'POST',
        '/v1/payments/crypto',
        kbRequest
      );
      
      const responseTime = Date.now() - startTime;
      
      this.logger.log(`Kingdom Bank crypto payment created successfully: ${foreignTransactionId} / KB ID: ${response.requestId} (${responseTime}ms)`);

      return {
        success: true,
        transactionId: foreignTransactionId,
        providerTransactionId: response.requestId,
        status: 'created',
        amount: response.settlementAmount || request.amount,
        currency: response.settlementCurrency || request.currency,
        responseTime,
        providerResponse: response,
        message: 'Crypto payment initiated successfully',
        redirectUrl: '',
      };

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      this.logger.error(`Kingdom Bank crypto payment creation failed (${responseTime}ms):`, error);

      return this.handleError(error, {
        transactionId: null,
        providerTransactionId: null,
        status: 'failed',
        amount: request.amount,
        currency: request.currency,
        responseTime,
        message: 'Crypto payment creation failed',
      });
    }
  }

  /**
   * Get supported payment methods
   */
  async getPaymentMethods(): Promise<any[]> {
    try {
      this.logger.debug('Getting Kingdom Bank payment methods');
      
      const response = await this.makeSignedRequest<any[]>('GET', '/v1/payment-methods');
      
      this.logger.debug(`Retrieved ${response.length} payment methods from Kingdom Bank`);
      return response;
      
    } catch (error) {
      this.logger.warn('Failed to get Kingdom Bank payment methods:', error);
      return [];
    }
  }

  /**
   * Get supported banks for a country and payment method
   */
  async getSupportedBanks(countryCode: string, paymentMethod: string): Promise<any[]> {
    try {
      this.logger.debug(`Getting Kingdom Bank supported banks for ${countryCode}/${paymentMethod}`);
      
      const response = await this.makeSignedRequest<any[]>(
        'GET', 
        `/v1/banks/supported?countryCode=${countryCode}&paymentMethod=${paymentMethod}`
      );
      
      this.logger.debug(`Retrieved ${response.length} supported banks from Kingdom Bank`);
      return response;
      
    } catch (error) {
      this.logger.warn('Failed to get Kingdom Bank supported banks:', error);
      return [];
    }
  }

  async createPayout(payoutData: any): Promise<TSPResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Creating Kingdom Bank transfer (payout): ${payoutData.payoutId}, amount: ${payoutData.amount}, currency: ${payoutData.currency}`);
      
      const currency = (payoutData.currency || 'INR').toUpperCase();
      const country = (payoutData.country || this.getCountryFromCurrency(currency)).toUpperCase();
      
      this.validatePayoutData(payoutData, country, currency);
      
      const { destinationType, destination } = this.buildDestination(payoutData, currency, country);

      this.logger.debug(`Destination built - Type: ${destinationType}, Country: ${country}`);

      let mappedCurrency = currency;
      if (isCryptoCurrency(currency)) {
        try {
          mappedCurrency = mapToKingdomBankCurrency(currency, payoutData.network);
          this.logger.log(`Payout currency mapping: ${currency} -> ${mappedCurrency}`);
        } catch (error) {
          this.logger.error(`Failed to map currency ${currency}: ${error.message}`);
          throw error;
        }
      }

      const transferRequest = {
        foreignTransactionId: `transfer_${payoutData.payoutId}_${Date.now()}`,
        amount: payoutData.amount,
        currency: mappedCurrency,
        notificationUrl: this.getValorapaysWebhookUrl(),
        destinationType,
        destination,
      };

      this.logger.debug(`Kingdom Bank Transfer Request: ${JSON.stringify(transferRequest, null, 2)}`);

      const transfer = await this.makeSignedRequest<KingdomBankTransaction>(
        'POST',
        '/v1/transfers/external',
        transferRequest
      );
      
      const responseTime = Date.now() - startTime;
      
      this.logger.log(`Kingdom Bank transfer created: ${transfer.transactionId} (${responseTime}ms)`);

      return {
        success: true,
        transactionId: transfer.transactionId.toString(),
        providerTransactionId: transfer.transactionId.toString(),
        status: this.mapTransactionStatus(transfer.status),
        amount: transfer.transactionAmount,
        currency: transfer.transactionCurrency,
        responseTime,
        providerResponse: transfer,
        message: 'Transfer created successfully',
      };

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      this.logger.error(`Kingdom Bank transfer creation failed (${responseTime}ms): ${JSON.stringify({
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
        payoutData: {
          payoutId: payoutData.payoutId,
          amount: payoutData.amount,
          currency: payoutData.currency,
          country: payoutData.country,
          beneficiaryAccount: payoutData.beneficiaryAccount,
        }
      })}`);

      return this.handleError(error, {
        transactionId: null,
        providerTransactionId: null,
        status: 'failed',
        amount: payoutData.amount,
        currency: payoutData.currency || 'USD',
        responseTime,
        message: 'Transfer creation failed',
      });
    }
  }

  private validatePayoutData(payoutData: any, country: string, currency: string): void {
    const countriesRequiringDocumentId = ['BR', 'BRA', 'AR', 'ARG', 'CL', 'CHL', 'PE', 'PER', 'PK', 'PAK', 'CO', 'COL', 'EC', 'ECU', 'MX', 'MEX'];
    
    if (countriesRequiringDocumentId.includes(country)) {
      if (!payoutData.beneficiaryDocumentId && !payoutData.customerDocumentId) {
        throw new Error(`Document ID is required for ${country} payouts`);
      }
    }

    if (payoutData.beneficiaryVpa && country === 'BR') {
      if (!payoutData.beneficiaryDocumentId && !payoutData.customerDocumentId) {
        throw new Error('Document ID (CPF/CNPJ) is required for PIX transfers in Brazil');
      }
    }

    if (!payoutData.beneficiaryName) {
      throw new Error('Beneficiary name is required');
    }

    if (!payoutData.beneficiaryAccount && !payoutData.beneficiaryIban && !payoutData.beneficiaryVpa) {
      throw new Error('Beneficiary account, IBAN, or VPA (for PIX) is required');
    }

    const isCrypto = ['BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'TRX'].includes(currency);
    if (!isCrypto && country !== 'CA') {
      const euCountries = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];
      
      if (euCountries.includes(country) || currency === 'EUR') {
        if (!payoutData.beneficiaryIban && !payoutData.beneficiaryAccount) {
          throw new Error('IBAN or account number is required for EUR transfers');
        }
        if (!payoutData.beneficiarySwift && !payoutData.beneficiaryBic && !payoutData.beneficiaryIfsc) {
          throw new Error('SWIFT/BIC code is required for international transfers');
        }
        if (!payoutData.beneficiaryBankName && !payoutData.bankName) {
          throw new Error('Bank name is required for international transfers');
        }
      } else if (country === 'IN') {
        if (!payoutData.beneficiaryIfsc) {
          throw new Error('IFSC code is required for Indian bank transfers');
        }
      } else if (country === 'US' || country === 'USA') {
        if (!payoutData.beneficiaryRoutingNumber) {
          throw new Error('Routing number (9-digit) is required for USA bank transfers');
        }
        if (payoutData.beneficiaryRoutingNumber.length !== 9) {
          throw new Error('USA routing number must be exactly 9 digits');
        }
        if (!payoutData.beneficiaryAccountType) {
          throw new Error('Account type (CHECKING or SAVINGS) is required for USA bank transfers');
        }
        const validAccountTypes = ['CHECKING', 'SAVINGS', 'CURRENT'];
        if (!validAccountTypes.includes(payoutData.beneficiaryAccountType.toUpperCase())) {
          throw new Error(`Account type must be one of: ${validAccountTypes.join(', ')}`);
        }
      }
    }
  }

  private buildDestination(payoutData: any, currency: string, country: string): { 
    destinationType: KingdomBankDestinationType; 
    destination: any 
  } {
    const cryptoCheck = isCryptoCurrency(currency);
    
    if (cryptoCheck) {
      try {
        const mappedCurrency = mapToKingdomBankCurrency(currency, payoutData.network);
        this.logger.debug(`Crypto payout: ${currency} mapped to ${mappedCurrency}`);
        
        return {
          destinationType: 'CRYPTO_WALLET',
          destination: {
            address: payoutData.beneficiaryAccount,
            tag: payoutData.beneficiaryTag || payoutData.beneficiaryMemo,
          },
        };
      } catch (error) {
        this.logger.error(`Crypto currency mapping failed: ${error.message}`);
        throw error;
      }
    }

    if (country === 'BR' && payoutData.beneficiaryVpa) {
      return {
        destinationType: 'PIX_ACCOUNT',
        destination: {
          accountNumber: payoutData.beneficiaryAccount,
          ispbCode: payoutData.beneficiaryIfsc?.substring(0, 8) || '',
          branchCode: payoutData.beneficiaryIfsc?.substring(8) || '0001',
          holderName: payoutData.beneficiaryName,
          documentId: payoutData.beneficiaryDocumentId || payoutData.customerDocumentId || '',
          pixKey: payoutData.beneficiaryVpa,
        },
      };
    }

    if (country === 'CA') {
      return {
        destinationType: 'INTERAC_ACCOUNT',
        destination: {
          holderName: payoutData.beneficiaryName,
          email: payoutData.customerEmail || payoutData.beneficiaryEmail,
          phone: payoutData.beneficiaryMobile || payoutData.customerPhone,
          address: payoutData.beneficiaryAddress || '',
          city: payoutData.beneficiaryCity || '',
          state: payoutData.beneficiaryState || '',
          postalCode: payoutData.beneficiaryPostalCode || '',
        },
      };
    }

    const destination: any = {
      country: this.mapCountryCode(country),
      holderName: payoutData.beneficiaryName,
      holderEmail: payoutData.customerEmail || payoutData.beneficiaryEmail || '',
      holderPhone: payoutData.beneficiaryMobile || payoutData.customerPhone || '',
    };

    const countriesRequiringDocumentId = ['BR', 'BRA', 'AR', 'ARG', 'CL', 'CHL', 'PE', 'PER', 'PK', 'PAK', 'CO', 'COL', 'EC', 'ECU', 'MX', 'MEX'];
    if (countriesRequiringDocumentId.includes(country)) {
      destination.documentId = payoutData.beneficiaryDocumentId || payoutData.customerDocumentId;
    }

    const euCountries = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];
    
    if (euCountries.includes(country) || currency === 'EUR') {
      if (payoutData.beneficiaryIban) {
        destination.iban = payoutData.beneficiaryIban;
      } else if (payoutData.beneficiaryAccount) {
        destination.accountNumber = payoutData.beneficiaryAccount;
      }
      
      if (payoutData.beneficiarySwift || payoutData.beneficiaryBic) {
        destination.bicSwift = payoutData.beneficiarySwift || payoutData.beneficiaryBic;
      } else if (payoutData.beneficiaryIfsc) {
        destination.bicSwift = payoutData.beneficiaryIfsc;
      }

      destination.bankName = payoutData.beneficiaryBankName || payoutData.bankName || '';
    } else if (country === 'IN') {
      destination.accountNumber = payoutData.beneficiaryAccount;
      
      if (payoutData.beneficiaryIfsc) {
        destination.bankCode = payoutData.beneficiaryIfsc.substring(0, 4);
        destination.branchCode = payoutData.beneficiaryIfsc.substring(4);
      }

      destination.bankName = payoutData.beneficiaryBankName || payoutData.bankName || '';
    } else if (country === 'US' || country === 'USA') {
      // USA-specific bank transfer
      destination.accountNumber = payoutData.beneficiaryAccount;
      destination.bankCode = payoutData.beneficiaryRoutingNumber; // Required for USA
      destination.accountType = payoutData.beneficiaryAccountType?.toUpperCase() || 'CHECKING'; // Required for USA
      destination.bankName = payoutData.beneficiaryBankName || payoutData.bankName || '';
      
      // Optional SWIFT for international transfers
      if (payoutData.beneficiarySwift || payoutData.beneficiaryBic) {
        destination.bicSwift = payoutData.beneficiarySwift || payoutData.beneficiaryBic;
      }
    } else {
      destination.accountNumber = payoutData.beneficiaryAccount;
      
      if (payoutData.beneficiarySwift || payoutData.beneficiaryBic) {
        destination.bicSwift = payoutData.beneficiarySwift || payoutData.beneficiaryBic;
      } else if (payoutData.beneficiaryIfsc) {
        destination.bicSwift = payoutData.beneficiaryIfsc;
      }
      
      if (payoutData.beneficiaryRoutingNumber) {
        destination.bankCode = payoutData.beneficiaryRoutingNumber;
      } else if (payoutData.beneficiaryIfsc && !payoutData.beneficiarySwift) {
        destination.bankCode = payoutData.beneficiaryIfsc.substring(0, 4);
        destination.branchCode = payoutData.beneficiaryIfsc.substring(4);
      }

      destination.bankName = payoutData.beneficiaryBankName || payoutData.bankName || '';
      
      if (payoutData.beneficiaryAccountType) {
        destination.accountType = payoutData.beneficiaryAccountType?.toUpperCase();
      }
    }

    return {
      destinationType: 'BANK_ACCOUNT',
      destination,
    };
  }

  /**
   * Validate destination account with Kingdom Bank API
   */
  private async validateDestination(
    destinationType: KingdomBankDestinationType,
    destination: any
  ): Promise<void> {
    try {
      this.logger.debug(`Validating ${destinationType} destination: ${JSON.stringify(destination)}`);
      this.logger.log('Skipping destination validation (not available in sandbox)');
      return;
    } catch (error: any) {
      this.logger.error(`Destination validation failed: ${error.message}`);
      this.logger.warn('Proceeding without validation (sandbox environment)');
    }
  }

  /**
   * Get default country from currency
   */
  private getCountryFromCurrency(currency: string): string {
    const currencyCountryMap: Record<string, string> = {
      'USD': 'US',
      'EUR': 'DE',
      'GBP': 'GB',
      'INR': 'IN',
      'CAD': 'CA',
      'AUD': 'AU',
      'BRL': 'BR',
      'MXN': 'MX',
      'JPY': 'JP',
      'CNY': 'CN',
      'SGD': 'SG',
      'AED': 'AE',
      'SAR': 'SA',
    };

    return currencyCountryMap[currency] || 'US';
  }

  /**
   * Make authenticated and signed request to Kingdom Bank API
   */
  private async makeSignedRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    data?: any
  ): Promise<T> {
    const body = data ? JSON.stringify(data) : '';
    const signature = this.generateSignature(body);
    
    const headers: Record<string, string> = {
      'X-Api-Key': this.auth.apiKey,
      'X-Api-Secret': this.auth.apiSecret,
      'X-Signature': signature,
      'X-Signature-Key-Id': this.auth.signatureKeyId,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    const config = {
      method,
      url: endpoint,
      headers,
      ...(data && { data }),
    };

    this.logger.debug(`Kingdom Bank API request: ${method} ${endpoint}`);
    this.logger.debug(`Request config:`, JSON.stringify(config, null, 2));
    
    try {
      const response = await this.client.request(config);
      this.logger.debug(`Kingdom Bank API response:`, JSON.stringify(response.data, null, 2));
      
      if (response.status >= 200 && response.status < 300) {
        return response.data;
      } else {
        throw new Error(`Kingdom Bank API error: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      this.logger.error(`Kingdom Bank API call failed:`, error.message);
      if (error.response) {
        this.logger.error(`Response status:`, error.response.status);
        this.logger.error(`Response data:`, JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }

  /**
   * Generate HMAC-SHA256 signature as per Kingdom Bank specification
   */
  private generateSignature(payload: string): string {
    const hmac = crypto.createHmac('sha256', this.auth.signatureKey);
    hmac.update(payload, 'utf8');
    return hmac.digest('base64');
  }

  /**
   * Map Kingdom Bank customer details from Valorapays format
   */
  private mapCustomerDetails(customerDetails: any) {
    // Get country from either direct field or address
    const countryCode = customerDetails.country || customerDetails.address?.country || 'IN';
    
    return {
      firstName: customerDetails.name?.split(' ')[0] || '',
      lastName: customerDetails.name?.split(' ').slice(1).join(' ') || '',
      email: customerDetails.email || '',
      phone: customerDetails.phone || '',
      country: this.mapCountryCode(countryCode),
    };
  }

  /**
   * Map 2-character or 3-character country codes to 3-character ISO codes required by Kingdom Bank
   */
  private mapCountryCode(countryCode: string): string {
    // If already 3 characters, return as is
    if (countryCode.length === 3) {
      return countryCode.toUpperCase();
    }
    
    const countryMapping: Record<string, string> = {
      'IN': 'IND',
      'US': 'USA',
      'GB': 'GBR',
      'CA': 'CAN',
      'AU': 'AUS',
      'SG': 'SGP',
      'AE': 'ARE',
      'DE': 'DEU',
      'FR': 'FRA',
      'JP': 'JPN',
      'CN': 'CHN',
      'BR': 'BRA',
      'BG': 'BGR',
      'MX': 'MEX',
      'IT': 'ITA',
      'ES': 'ESP',
      'NL': 'NLD',
      'BE': 'BEL',
      'CH': 'CHE',
      'AT': 'AUT',
      'SE': 'SWE',
      'NO': 'NOR',
      'DK': 'DNK',
      'FI': 'FIN',
      'PL': 'POL',
      'RU': 'RUS',
      'TR': 'TUR',
      'KR': 'KOR',
      'MY': 'MYS',
      'TH': 'THA',
      'VN': 'VNM',
      'PH': 'PHL',
      'ID': 'IDN',
      'BD': 'BGD',
      'PK': 'PAK',
      'LK': 'LKA',
      'NP': 'NPL',
      'MM': 'MMR',
      'KH': 'KHM',
      'LA': 'LAO',
      'ZA': 'ZAF',
      'EG': 'EGY',
      'NG': 'NGA',
      'KE': 'KEN',
      'MA': 'MAR',
      'GH': 'GHA',
      'ET': 'ETH',
      'TZ': 'TZA',
      'UG': 'UGA',
      'DZ': 'DZA',
      'AO': 'AGO',
      'MZ': 'MOZ',
      'MG': 'MDG',
      'CM': 'CMR',
      'CI': 'CIV',
      'NE': 'NER',
      'BF': 'BFA',
      'ML': 'MLI',
      'MW': 'MWI',
      'ZM': 'ZMB',
      'SN': 'SEN',
      'SO': 'SOM',
      'TD': 'TCD',
      'SL': 'SLE',
      'TG': 'TGO',
      'CF': 'CAF',
      'LR': 'LBR',
      'MR': 'MRT',
      'BW': 'BWA',
      'GM': 'GMB',
      'GW': 'GNB',
      'GQ': 'GNQ',
      'GA': 'GAB',
      'SZ': 'SWZ',
      'DJ': 'DJI',
      'CG': 'COG',
      'CD': 'COD',
      'ST': 'STP',
      'CV': 'CPV',
      'KM': 'COM',
      'SC': 'SYC',
      'MU': 'MUS',
      'RE': 'REU',
      'YT': 'MYT',
    };

    // If already 3 characters, return as is
    if (countryCode.length === 3) {
      return countryCode.toUpperCase();
    }

    // Map 2-character to 3-character
    const mapped = countryMapping[countryCode.toUpperCase()];
    return mapped || 'IND'; // Default to India
  }

  /**
   * Map Kingdom Bank transaction status to Valorapays status
   */
  private mapTransactionStatus(kbStatus: KingdomBankTransactionStatus): string {
    switch (kbStatus) {
      case 'PROCESSED':
        return 'completed';
      case 'PENDING':
        return 'pending';
      case 'SCHEDULED':
        return 'processing';
      case 'FAILED':
        return 'failed';
      case 'CANCELLED':
        return 'cancelled';
      default:
        return 'pending';
    }
  }

  /**
   * Handle and format errors consistently
   */
  private handleError(error: any, baseResponse: Partial<TSPResponse>): TSPResponse {
    let errorMessage = 'Unknown error';
    let errorCode = 'UNKNOWN_ERROR';

    if (error.response?.data) {
      const kbError = error.response.data as KingdomBankError;
      errorMessage = kbError.message || error.message;
      errorCode = kbError.code?.toString() || 'API_ERROR';
    } else {
      errorMessage = error.message || 'Request failed';
    }

    return {
      success: false,
      transactionId: baseResponse.transactionId || null,
      providerTransactionId: baseResponse.providerTransactionId || null,
      status: baseResponse.status || 'failed',
      amount: baseResponse.amount || 0,
      currency: baseResponse.currency || 'USD',
      responseTime: baseResponse.responseTime || 0,
      error: `${errorCode}: ${errorMessage}`,
      providerResponse: error.response?.data,
      message: baseResponse.message || 'Operation failed',
    };
  }


  private getValorapaysWebhookUrl(): string {
    const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'https://api.valorapayss.io';
    return `${webhookBaseUrl}/payment/api/v1/webhooks/kingdom-bank`;
  }

  /**
   * Validate required credentials on initialization
   */
  private validateCredentials(): void {
    const required = ['api_key', 'api_secret', 'signature_key', 'signature_key_id'];
    const missing = required.filter(key => !this.config.credentials[key]);
    
    if (missing.length > 0) {
      throw new Error(`Kingdom Bank adapter missing required credentials: ${missing.join(', ')}`);
    }
  }

  /**
   * Simulate payment status change (sandbox only)
   * Used for automated testing in sandbox environment
   */
  async simulatePaymentStatus(
    transactionId: string,
    action: 'PROCESS' | 'DECLINE' = 'PROCESS'
  ): Promise<{ success: boolean; message: string }> {
    if (this.config.environment === 'production') {
      this.logger.warn('Simulator API called in production environment - ignoring');
      return {
        success: false,
        message: 'Simulator API is only available in sandbox environment',
      };
    }

    try {
      this.logger.log(`Simulating ${action} for Kingdom Bank transaction: ${transactionId}`);

      const requestData = {
        action,
        comment: 'Automated sandbox simulation',
      };

      const response = await this.makeSignedRequest<any>(
        'POST',
        `/v1/simulator/manual-review/update/${transactionId}`,
        requestData
      );

      this.logger.log(`Simulator response:`, response);

      return {
        success: true,
        message: `Successfully simulated ${action} for transaction ${transactionId}`,
      };
    } catch (error: any) {
      this.logger.error(`Simulator API call failed: ${error.message}`, error.stack);
      
      if (error.response?.status === 401) {
        this.logger.error('Kingdom Bank simulator authentication failed. Check API credentials and signature key.');
        this.logger.debug(`Auth config: ${JSON.stringify({
          hasApiKey: !!this.auth.apiKey,
          hasApiSecret: !!this.auth.apiSecret,
          hasSignatureKey: !!this.auth.signatureKey,
          hasSignatureKeyId: !!this.auth.signatureKeyId,
          baseURL: this.baseURL,
        })}`);
      }
      
      return {
        success: false,
        message: `Simulator error: ${error.message}`,
      };
    }
  }

}
