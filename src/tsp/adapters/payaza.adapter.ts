import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import { TSPAdapter, TSPResponse, PaymentRequest } from '@/types/tsp';
import { TSPConfiguration } from '@/entities/tsp-configuration.entity';
import { LoggerService } from '@/common/services/logger.service';

const PAYAZA_TRANSACTION_TYPE_DEFAULTS: Record<string, string> = {
  NGN: 'nuban',
  GHS: 'ghipps',
  KES: 'kepss',
  TZS: 'tiss',
  UGX: 'mobile_money',
  XOF: 'mobile_money',
  XAF: 'mobile_money',
  ZAR: 'RTC',
};

const PAYAZA_CURRENCY_DEFAULT_COUNTRY: Record<string, { alpha2: string; alpha3: string }> = {
  NGN: { alpha2: 'NG', alpha3: 'NGA' },
  GHS: { alpha2: 'GH', alpha3: 'GHA' },
  KES: { alpha2: 'KE', alpha3: 'KEN' },
  TZS: { alpha2: 'TZ', alpha3: 'TZA' },
  UGX: { alpha2: 'UG', alpha3: 'UGA' },
  XAF: { alpha2: 'CM', alpha3: 'CMR' },
  XOF: { alpha2: 'BJ', alpha3: 'BEN' },
  ZAR: { alpha2: 'ZA', alpha3: 'ZAF' },
};

const ISO_ALPHA2_TO_ALPHA3: Record<string, string> = {
  NG: 'NGA',
  GH: 'GHA',
  KE: 'KEN',
  TZ: 'TZA',
  UG: 'UGA',
  CM: 'CMR',
  BJ: 'BEN',
  BF: 'BFA',
  CI: 'CIV',
  SN: 'SEN',
  ML: 'MLI',
  NE: 'NER',
  TG: 'TGO',
  ZA: 'ZAF',
  RW: 'RWA',
  BW: 'BWA',
  CD: 'COD',
};

/**
 * Payaza Payment Gateway Adapter
 * 
 * Payaza is an African payment gateway supporting:
 * - Card payments (collection)
 * - Bank transfers
 * - Refunds and chargebacks
 * - Payouts
 * 
 * Documentation: https://docs.payaza.africa/developers/apis
 */
export class PayazaAdapter implements TSPAdapter {
  private client: AxiosInstance;
  private merchantId: string;
  private apiKey: string;
  private encryptionKey?: string;
  private accountReferenceCache: Map<string, string>;

  constructor(
    private config: TSPConfiguration,
    private logger: LoggerService,
  ) {
    this.merchantId = config.credentials['merchant_id'] as string;
    this.apiKey = config.credentials['api_key'] as string;
    this.encryptionKey = config.credentials['encryption_key'] as string | undefined;
    this.accountReferenceCache = new Map();

    const baseURL = config.environment === 'production' 
      ? (config.credentials['base_url'] as string || 'https://api.payaza.africa')
      : (config.credentials['base_url'] as string || 'https://api-sandbox.payaza.africa');

    const base64EncodedApiKey = Buffer.from(this.apiKey).toString('base64');
    const tenantId = config.environment === 'production' ? 'live' : 'test';

    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Payaza ${base64EncodedApiKey}`,
        'User-Agent': 'Valorapays-PaymentEngine/1.0',
        'x-tenantID': tenantId,
      },
      timeout: 30000,
    });

    // Add request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        this.logger.debug(`Payaza API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        this.logger.error('Payaza API Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        this.logger.debug(`Payaza API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        this.logger.error('Payaza API Response Error:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Create a card payment (charge)
   * Based on: https://docs.payaza.africa/developers/apis/collections/card-collection/card-charge
   */
  async createPayment(request: PaymentRequest): Promise<TSPResponse> {
    const startTime = Date.now();

    try {
      this.logger.log(`Creating Payaza card charge for amount: ${request.amount} ${request.currency}`);

      const payazaRequest = {
        service_payload: {
          first_name: this.extractFirstName(request.customerDetails?.name),
          last_name: this.extractLastName(request.customerDetails?.name),
          email_address: request.customerDetails?.email || '',
          phone_number: request.customerDetails?.phone || '',
          amount: request.amount,
          transaction_reference: request.requestId || `zp_${request.merchantId}_${Date.now()}`,
          currency: request.currency || 'USD',
          description: request.description || 'Payment via Valorapays',
          card: {
            cardNumber: request.paymentMethodDetails?.cardNumber,
            expiryMonth: request.paymentMethodDetails?.expiryMonth,
            expiryYear: request.paymentMethodDetails?.expiryYear,
            securityCode: request.paymentMethodDetails?.cvv,
          },
        }
      };

      const response = await this.client.post('/live/card/card_charge/', payazaRequest);

      const responseTime = Date.now() - startTime;
      const data = response.data;

      if (data.statusOk === true) {
        const transactionRef = payazaRequest.service_payload.transaction_reference;
        
        this.logger.log(`Payaza card charge created successfully: ${transactionRef} (${responseTime}ms)`);

        let redirectUrl = null;
        let status = 'pending';

        if (data.do3dsAuth === true && data.threeDsUrl) {
          redirectUrl = data.threeDsUrl;
          status = 'requires_action';
          this.logger.log(`3DS authentication required for transaction: ${transactionRef}`);
        } else if (data.paymentCompleted === true) {
          status = 'completed';
          this.logger.log(`Payment completed immediately for transaction: ${transactionRef}`);
        }

        return {
          success: true,
          transactionId: transactionRef,
          providerTransactionId: transactionRef,
          status: status,
          amount: request.amount,
          currency: request.currency || 'USD',
          responseTime,
          providerResponse: data,
          message: data.message || 'Payment initiated successfully',
          redirectUrl: redirectUrl,
          nextAction: data.do3dsAuth ? {
            type: '3ds_authentication',
            threeDsUrl: data.threeDsUrl,
            formData: data.formData,
            threeDsHtml: data.threeDsHtml,
          } : null,
        };
      } else {
        return {
          success: false,
          transactionId: null,
          providerTransactionId: null,
          status: 'failed',
          amount: request.amount,
          currency: request.currency || 'USD',
          responseTime,
          error: data.debugMessage || data.message || 'Payment initiation failed',
          providerResponse: data,
          message: data.debugMessage || 'Payment initiation failed',
        };
      }

    } catch (error: any) {
      const responseTime = Date.now() - startTime;

      this.logger.error(`Payaza card charge creation failed (${responseTime}ms):`, error);

      return {
        success: false,
        transactionId: null,
        providerTransactionId: null,
        status: 'failed',
        amount: request.amount,
        currency: request.currency || 'USD',
        responseTime,
        error: error.response?.data?.debugMessage || error.response?.data?.message || error.message,
        providerResponse: error.response?.data,
        message: 'Payment creation failed',
      };
    }
  }

  /**
   * Verify payment status
   * Based on Payaza transaction verification endpoint
   */
  async verifyPayment(transactionReference: string, signature?: string): Promise<TSPResponse> {
    const startTime = Date.now();

    try {
      this.logger.log(`Verifying Payaza payment: ${transactionReference}`);

      const response = await this.client.get(`/api/transaction/verify/${transactionReference}`);

      const responseTime = Date.now() - startTime;
      const data = response.data;

      if (data.status === true && data.data) {
        const transaction = data.data;
        const isCompleted = transaction.status === 'successful' || transaction.status === 'success';

        this.logger.log(`Payaza payment verified: ${transactionReference} -> ${transaction.status} (${responseTime}ms)`);

        return {
          success: isCompleted,
          transactionId: transaction.reference || transactionReference,
          providerTransactionId: transaction.reference || transactionReference,
          status: this.mapPayazaStatus(transaction.status),
          amount: parseFloat(transaction.amount || '0'),
          currency: transaction.currency || 'NGN',
          responseTime,
          providerResponse: data,
          message: isCompleted ? 'Payment completed successfully' : `Payment status: ${transaction.status}`,
        };
      } else {
        return {
          success: false,
          transactionId: transactionReference,
          providerTransactionId: transactionReference,
          status: 'failed',
          amount: 0,
          currency: 'NGN',
          responseTime,
          error: data.message || 'Payment verification failed',
          providerResponse: data,
          message: 'Payment verification failed',
        };
      }

    } catch (error: any) {
      const responseTime = Date.now() - startTime;

      this.logger.error(`Payaza payment verification failed (${responseTime}ms):`, error);

      return {
        success: false,
        transactionId: transactionReference,
        providerTransactionId: transactionReference,
        status: 'failed',
        amount: 0,
        currency: 'NGN',
        responseTime,
        error: error.response?.data?.message || error.message,
        providerResponse: error.response?.data,
        message: 'Payment verification failed',
      };
    }
  }

  /**
   * Get payment status
   * Based on Payaza transaction status query endpoint
   */
  async getPaymentStatus(transactionReference: string): Promise<TSPResponse> {
    const startTime = Date.now();

    try {
      this.logger.log(`Getting Payaza payment status: ${transactionReference}`);

      const response = await this.client.get(`/api/transaction/status/${transactionReference}`);

      const responseTime = Date.now() - startTime;
      const data = response.data;

      if (data.status === true && data.data) {
        const transaction = data.data;
        const status = this.mapPayazaStatus(transaction.status);
        const success = status === 'completed';

        this.logger.log(`Payaza payment status retrieved: ${transactionReference} -> ${status} (${responseTime}ms)`);

        return {
          success,
          transactionId: transaction.reference || transactionReference,
          providerTransactionId: transaction.reference || transactionReference,
          status,
          amount: parseFloat(transaction.amount || '0'),
          currency: transaction.currency || 'NGN',
          responseTime,
          providerResponse: data,
          message: `Payment status: ${status}`,
        };
      } else {
        return {
          success: false,
          transactionId: transactionReference,
          providerTransactionId: transactionReference,
          status: 'pending',
          amount: 0,
          currency: 'NGN',
          responseTime,
          error: data.message || 'Status check failed',
          providerResponse: data,
          message: 'Status check failed',
        };
      }

    } catch (error: any) {
      const responseTime = Date.now() - startTime;

      this.logger.error(`Payaza status check failed (${responseTime}ms):`, error);

      return {
        success: false,
        transactionId: transactionReference,
        providerTransactionId: transactionReference,
        status: 'failed',
        amount: 0,
        currency: 'NGN',
        responseTime,
        error: error.response?.data?.message || error.message,
        providerResponse: error.response?.data,
        message: 'Status check failed',
      };
    }
  }

  /**
   * Initiate refund
   * Based on: https://docs.payaza.africa/developers/apis/collections/refunds-and-chargebacks/initiate-refund
   */
  async refundPayment(transactionReference: string, amount?: number): Promise<TSPResponse> {
    const startTime = Date.now();

    try {
      this.logger.log(`Processing Payaza refund: ${transactionReference}, amount: ${amount || 'full'}`);

      const refundRequest: any = {
        transaction_reference: transactionReference,
      };

      if (amount) {
        refundRequest.amount = amount;
      }

      const response = await this.client.post('/api/refund/initiate', refundRequest);

      const responseTime = Date.now() - startTime;
      const data = response.data;

      if (data.status === true || data.response_code === '00') {
        this.logger.log(`Payaza refund initiated: ${data.data?.refund_reference} (${responseTime}ms)`);

        return {
          success: true,
          transactionId: data.data?.refund_reference || transactionReference,
          providerTransactionId: data.data?.refund_reference || transactionReference,
          status: 'refunded',
          amount: amount || 0,
          currency: data.data?.currency || 'NGN',
          responseTime,
          providerResponse: data,
          message: data.message || 'Refund processed successfully',
        };
      } else {
        return {
          success: false,
          transactionId: transactionReference,
          providerTransactionId: transactionReference,
          status: 'failed',
          amount: amount || 0,
          currency: 'NGN',
          responseTime,
          error: data.message || 'Refund failed',
          providerResponse: data,
          message: 'Refund failed',
        };
      }

    } catch (error: any) {
      const responseTime = Date.now() - startTime;

      this.logger.error(`Payaza refund failed (${responseTime}ms):`, error);

      return {
        success: false,
        transactionId: transactionReference,
        providerTransactionId: transactionReference,
        status: 'failed',
        amount: amount || 0,
        currency: 'NGN',
        responseTime,
        error: error.response?.data?.message || error.message,
        providerResponse: error.response?.data,
        message: 'Refund failed',
      };
    }
  }

  /**
   * Create payout (bank transfer)
   * Based on: https://docs.payaza.africa/developers/apis/make-payments/transfers/initiate-transfer
   */
  async createPayout(payoutData: any): Promise<TSPResponse> {
    const startTime = Date.now();

    try {
      const currency = (payoutData.currency || 'NGN').toString().toUpperCase();
      const amount = Number(payoutData.amount);
      const merchantTransactionId =
        payoutData.payoutForeignTransactionId ||
        payoutData.externalPayoutId ||
        payoutData.payoutId ||
        `payout_${Date.now()}`;

      if (!amount || Number.isNaN(amount) || amount <= 0) {
        throw new Error(`Invalid payout amount: ${payoutData.amount}`);
      }

      const transactionType = this.resolveTransactionType(currency, payoutData);
      const accountReference = await this.resolveAccountReference(currency, payoutData);

      if (!accountReference) {
        throw new Error(`Missing Payaza account reference for currency ${currency}`);
      }

      const transactionPin = this.config.credentials['transaction_pin'];
      if (!transactionPin) {
        throw new Error('Payaza transaction pin is not configured');
      }

      const bankCode = this.resolveBankCode(payoutData, transactionType);
      if (!bankCode) {
        throw new Error('Payaza payout requires a bank or wallet code');
      }

      const accountNumber = this.resolveAccountNumber(payoutData, transactionType);
      if (!accountNumber) {
        throw new Error('Payaza payout requires a beneficiary account number or mobile wallet identifier');
      }

      this.logger.log(
        `Creating Payaza payout: ${merchantTransactionId}, amount: ${amount} ${currency}, transactionType: ${transactionType}`,
      );

      let accountName = payoutData.beneficiaryName;
      if (transactionType === 'nuban' && payoutData.beneficiaryAccount && bankCode) {
        const nameEnquiry = await this.performAccountNameEnquiry(payoutData.beneficiaryAccount, bankCode);
        if (nameEnquiry.success && nameEnquiry.accountName) {
          accountName = nameEnquiry.accountName;
          this.logger.log(`Payaza account name enquiry successful: ${accountName}`);
        }
      }

      if (!accountName) {
        accountName = payoutData.beneficiaryName || 'Beneficiary';
      }

      const narration = this.sanitizeNarration(payoutData.description || payoutData.purpose || 'Payout');
      const countryAlpha3 = this.resolveCountryAlpha3(currency, payoutData.country, payoutData.metadata);
      const sender = this.buildSender(payoutData);

      const payoutBeneficiary: any = {
        credit_amount: amount,
        account_number: accountNumber,
        account_name: accountName,
        bank_code: bankCode,
        narration,
        transaction_reference: merchantTransactionId,
        sender,
      };

      if (payoutData.metadata?.payazaChannel) {
        payoutBeneficiary.channel = payoutData.metadata.payazaChannel;
      }

      const payoutRequest: any = {
        transaction_type: transactionType,
        service_payload: {
          payout_amount: amount,
          transaction_pin: transactionPin,
          account_reference: accountReference,
          currency,
          payout_beneficiaries: [payoutBeneficiary],
        },
      };

      if (countryAlpha3) {
        payoutRequest.service_payload.country = countryAlpha3;
      }

      if (payoutData.metadata?.payazaAccountMetadata && typeof payoutData.metadata.payazaAccountMetadata === 'object') {
        payoutRequest.service_payload.metadata = payoutData.metadata.payazaAccountMetadata;
      }

      const response = await this.client.post('/live/payout-receptor/payout', payoutRequest);
      const responseTime = Date.now() - startTime;
      const data = response.data;

      const success = this.isPayoutInitiated(data);
      const providerReference =
        data?.response_content?.reference ||
        data?.response_content?.transaction_reference ||
        merchantTransactionId;

      if (success) {
        const status = this.mapPayazaTransferStatus(
          data?.response_content?.response_status,
          data?.response_content?.transaction_status,
        );

        this.logger.log(`Payaza payout initiated: ${providerReference} (${responseTime}ms)`);

        return {
          success: true,
          transactionId: providerReference,
          providerTransactionId: providerReference,
          status,
          amount,
          currency,
          responseTime,
          providerResponse: data,
          message: data?.response_message || 'Payout initiated successfully',
        };
      }

      const errorMessage =
        data?.response_message ||
        data?.response_content?.response_description ||
        data?.response_content?.message ||
        'Payout initiation failed';

      this.logger.error(`Payaza payout initiation failed: ${errorMessage}`, data);

      return {
        success: false,
        transactionId: merchantTransactionId,
        providerTransactionId: null,
        status: 'failed',
        amount,
        currency,
        responseTime,
        error: errorMessage,
        providerResponse: data,
        message: errorMessage,
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;

      this.logger.error(`Payaza payout failed (${responseTime}ms):`, error);

      return {
        success: false,
        transactionId: null,
        providerTransactionId: null,
        status: 'failed',
        amount: payoutData.amount,
        currency: payoutData.currency || 'NGN',
        responseTime,
        error: error.response?.data?.message || error.message,
        providerResponse: error.response?.data,
        message: 'Payout creation failed',
      };
    }
  }

  /**
   * Check payout status
   * Based on: https://docs.payaza.africa/developers/apis/make-payments/transfers/transaction-status-query
   */
  async checkPayoutStatus(transactionReference: string): Promise<TSPResponse> {
    const startTime = Date.now();

    try {
      this.logger.log(`Checking Payaza payout status: ${transactionReference}`);

      const response = await this.client.post('/api/live/transaction_status_query', {
        transaction_reference: transactionReference,
      });

      const responseTime = Date.now() - startTime;
      const data = response.data;

      if (data.status === true && data.data) {
        const transaction = data.data;
        const status = this.mapPayazaStatus(transaction.status);

        return {
          success: status === 'completed',
          transactionId: transaction.reference || transactionReference,
          providerTransactionId: transaction.reference || transactionReference,
          status,
          amount: parseFloat(transaction.amount || '0'),
          currency: transaction.currency || 'NGN',
          responseTime,
          providerResponse: data,
          message: data.message || `Payout status: ${status}`,
        };
      } else {
        return {
          success: false,
          transactionId: transactionReference,
          providerTransactionId: null,
          status: 'failed',
          amount: 0,
          currency: 'NGN',
          responseTime,
          error: data.message || 'Payout status check failed',
          providerResponse: data,
          message: 'Payout status check failed',
        };
      }

    } catch (error: any) {
      const responseTime = Date.now() - startTime;

      this.logger.error(`Payaza payout status check failed (${responseTime}ms):`, error);

      return {
        success: false,
        transactionId: transactionReference,
        providerTransactionId: null,
        status: 'failed',
        amount: 0,
        currency: 'NGN',
        responseTime,
        error: error.response?.data?.message || error.message,
        providerResponse: error.response?.data,
        message: 'Status check failed',
      };
    }
  }

  /**
   * Perform account name enquiry before transfer
   * Based on: https://docs.payaza.africa/developers/apis/make-payments/transfers/account-name-enquiry
   */
  private async performAccountNameEnquiry(
    accountNumber: string,
    bankCode: string
  ): Promise<{ success: boolean; accountName?: string; error?: string }> {
    try {
      this.logger.debug(`Payaza account name enquiry: ${accountNumber} at bank ${bankCode}`);

      const response = await this.client.post('/api/live/account_name_inquiry', {
        account_number: accountNumber,
        bank_code: bankCode,
      });

      const data = response.data;

      if (data.status === true && data.data) {
        return {
          success: true,
          accountName: data.data.account_name,
        };
      } else {
        return {
          success: false,
          error: data.message || 'Account name enquiry failed',
        };
      }

    } catch (error: any) {
      this.logger.warn('Payaza account name enquiry failed:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Get list of supported banks
   * Based on: https://docs.payaza.africa/developers/apis/make-payments/transfers/bank-codes
   */
  async getSupportedBanks(): Promise<any[]> {
    try {
      this.logger.debug('Fetching Payaza supported banks');

      const response = await this.client.get('/api/live/bank_list');

      if (response.data.status === true && response.data.data) {
        return response.data.data;
      }

      return [];

    } catch (error) {
      this.logger.warn('Failed to get Payaza supported banks:', error);
      return [];
    }
  }

  /**
   * Request chargeback
   * Based on: https://docs.payaza.africa/developers/apis/collections/refunds-and-chargebacks/chargeback-request
   */
  async requestChargeback(transactionReference: string, reason: string): Promise<TSPResponse> {
    const startTime = Date.now();

    try {
      this.logger.log(`Requesting Payaza chargeback: ${transactionReference}`);

      const response = await this.client.post('/api/chargeback/request', {
        transaction_reference: transactionReference,
        reason: reason,
      });

      const responseTime = Date.now() - startTime;
      const data = response.data;

      if (data.status === true) {
        return {
          success: true,
          transactionId: data.data?.chargeback_reference || transactionReference,
          providerTransactionId: data.data?.chargeback_reference || transactionReference,
          status: 'chargeback_requested',
          amount: 0,
          currency: 'NGN',
          responseTime,
          providerResponse: data,
          message: data.message || 'Chargeback requested successfully',
        };
      } else {
        return {
          success: false,
          transactionId: transactionReference,
          providerTransactionId: transactionReference,
          status: 'failed',
          amount: 0,
          currency: 'NGN',
          responseTime,
          error: data.message || 'Chargeback request failed',
          providerResponse: data,
          message: 'Chargeback request failed',
        };
      }

    } catch (error: any) {
      const responseTime = Date.now() - startTime;

      this.logger.error(`Payaza chargeback request failed (${responseTime}ms):`, error);

      return {
        success: false,
        transactionId: transactionReference,
        providerTransactionId: transactionReference,
        status: 'failed',
        amount: 0,
        currency: 'NGN',
        responseTime,
        error: error.response?.data?.message || error.message,
        providerResponse: error.response?.data,
        message: 'Chargeback request failed',
      };
    }
  }

  /**
   * Accept or reject chargeback
   * Based on: https://docs.payaza.africa/developers/apis/collections/refunds-and-chargebacks/accept-or-reject-chargeback
   */
  async handleChargeback(chargebackReference: string, action: 'accept' | 'reject', reason?: string): Promise<TSPResponse> {
    const startTime = Date.now();

    try {
      this.logger.log(`${action}ing Payaza chargeback: ${chargebackReference}`);

      const response = await this.client.post(`/api/chargeback/${action}`, {
        chargeback_reference: chargebackReference,
        reason: reason || '',
      });

      const responseTime = Date.now() - startTime;
      const data = response.data;

      if (data.status === true) {
        return {
          success: true,
          transactionId: chargebackReference,
          providerTransactionId: chargebackReference,
          status: `chargeback_${action}ed`,
          amount: 0,
          currency: 'NGN',
          responseTime,
          providerResponse: data,
          message: data.message || `Chargeback ${action}ed successfully`,
        };
      } else {
        return {
          success: false,
          transactionId: chargebackReference,
          providerTransactionId: chargebackReference,
          status: 'failed',
          amount: 0,
          currency: 'NGN',
          responseTime,
          error: data.message || `Chargeback ${action} failed`,
          providerResponse: data,
          message: `Chargeback ${action} failed`,
        };
      }

    } catch (error: any) {
      const responseTime = Date.now() - startTime;

      this.logger.error(`Payaza chargeback ${action} failed (${responseTime}ms):`, error);

      return {
        success: false,
        transactionId: chargebackReference,
        providerTransactionId: chargebackReference,
        status: 'failed',
        amount: 0,
        currency: 'NGN',
        responseTime,
        error: error.response?.data?.message || error.message,
        providerResponse: error.response?.data,
        message: `Chargeback ${action} failed`,
      };
    }
  }

  /**
   * Get refund history
   * Based on: https://docs.payaza.africa/developers/apis/collections/refunds-and-chargebacks/fetch-refund-history
   */
  async getRefundHistory(page: number = 1, limit: number = 20): Promise<any> {
    try {
      this.logger.debug(`Fetching Payaza refund history: page ${page}`);

      const response = await this.client.get('/api/refund/history', {
        params: { page, limit },
      });

      return response.data;

    } catch (error) {
      this.logger.error('Failed to get Payaza refund history:', error);
      return { status: false, message: 'Failed to fetch refund history' };
    }
  }

  /**
   * Get chargeback transaction history
   * Based on: https://docs.payaza.africa/developers/apis/collections/refunds-and-chargebacks/chargeback-transaction-history
   */
  async getChargebackHistory(page: number = 1, limit: number = 20): Promise<any> {
    try {
      this.logger.debug(`Fetching Payaza chargeback history: page ${page}`);

      const response = await this.client.get('/api/chargeback/history', {
        params: { page, limit },
      });

      return response.data;

    } catch (error) {
      this.logger.error('Failed to get Payaza chargeback history:', error);
      return { status: false, message: 'Failed to fetch chargeback history' };
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      this.logger.debug('Performing Payaza health check');

      // Use bank list endpoint as a simple health check
      const response = await this.client.get('/api/live/bank_list');

      this.logger.debug('Payaza health check successful');
      return response.data.status === true;

    } catch (error) {
      this.logger.warn('Payaza health check failed:', error);
      return false;
    }
  }

  /**
   * Get provider name
   */
  getProviderName(): string {
    return 'payaza';
  }

  /**
   * Get environment
   */
  getEnvironment(): string {
    return this.config.environment;
  }

  /**
   * Verify webhook signature
   * Based on: https://docs.payaza.africa/developers/apis/dev-guide/webhooks
   */
  verifyWebhookSignature(payload: any, receivedSignature: string): boolean {
    // TODO: Restore HMAC verification once Payaza provides a stable secret
    return true;
  }

  getWebhookVerificationKey(): string {
    return this.config.credentials['webhook_secret'] || this.apiKey;
  }

  private resolveTransactionType(currency: string, payoutData: any): string {
    const explicit =
      payoutData?.payazaTransactionType ||
      payoutData?.metadata?.payazaTransactionType ||
      payoutData?.metadata?.payaza_transaction_type;

    if (explicit) {
      return explicit.toString();
    }

    const accountType = payoutData?.beneficiaryAccountType?.toString().toLowerCase();
    if (accountType) {
      if (accountType.includes('mobile') || accountType.includes('wallet')) {
        return 'mobile_money';
      }
      if (accountType.includes('ghipps')) {
        return 'ghipps';
      }
      if (accountType.includes('kepss')) {
        return 'kepss';
      }
      if (accountType.includes('tiss')) {
        return 'tiss';
      }
      if (accountType.includes('rtc')) {
        return 'RTC';
      }
    }

    const payoutType = payoutData?.payoutType?.toString().toLowerCase();
    if (payoutType) {
      if (payoutType.includes('mobile')) {
        return 'mobile_money';
      }
      if (payoutType.includes('wallet')) {
        return 'mobile_money';
      }
    }

    return PAYAZA_TRANSACTION_TYPE_DEFAULTS[currency] || 'nuban';
  }

  private async resolveAccountReference(currency: string, payoutData: any): Promise<string | undefined> {
    const metadataReference =
      payoutData?.metadata?.payazaAccountReference ||
      payoutData?.metadata?.payaza_account_reference;

    if (metadataReference) {
      return metadataReference.toString();
    }

    if (payoutData?.payazaAccountReference) {
      return payoutData.payazaAccountReference.toString();
    }

    const configuredReference = this.getConfiguredAccountReference(currency);
    if (configuredReference) {
      return configuredReference;
    }

    const cachedReference = this.accountReferenceCache.get(currency);
    if (cachedReference) {
      return cachedReference;
    }

    const fetchedReference = await this.fetchAccountReferenceForCurrency(currency);
    if (fetchedReference) {
      this.accountReferenceCache.set(currency, fetchedReference);
      return fetchedReference;
    }

    return undefined;
  }

  private getConfiguredAccountReference(currency: string): string | undefined {
    const credentialKey = this.config.credentials?.[`account_reference_${currency}`];
    if (credentialKey) {
      return credentialKey.toString();
    }

    const payazaCredentialKey = this.config.credentials?.[`payaza_account_reference_${currency}`];
    if (payazaCredentialKey) {
      return payazaCredentialKey.toString();
    }

    const defaultReferenceKey =
      this.config.credentials?.[`default_account_reference_${currency}`] ||
      this.config.credentials?.[`payaza_default_account_reference_${currency}`];

    if (defaultReferenceKey) {
      return defaultReferenceKey.toString();
    }

    const referenceMap =
      this.config.credentials?.['account_references'] ||
      this.config.credentials?.['payaza_account_references'] ||
      this.config.credentials?.['payazaAccountReferences'];

    const mappedReference = this.extractAccountReferenceFromSource(referenceMap, currency);
    if (mappedReference) {
      return mappedReference;
    }

    const globalReference =
      this.config.credentials?.['account_reference'] ||
      this.config.credentials?.['payaza_default_account_reference'] ||
      this.config.credentials?.['default_account_reference'] ||
      this.config.credentials?.['payazaAccountReference'];

    return globalReference ? globalReference.toString() : undefined;
  }

  private extractAccountReferenceFromSource(source: unknown, currency: string): string | undefined {
    if (!source) {
      return undefined;
    }

    if (typeof source === 'string') {
      try {
        const parsed = JSON.parse(source);
        return this.extractAccountReferenceFromSource(parsed, currency);
      } catch (error) {
        this.logger.warn('Failed to parse Payaza account reference map from credentials', error);
        return undefined;
      }
    }

    if (typeof source === 'object') {
      const record = source as Record<string, unknown>;
      const value =
        record[currency] ??
        record[currency.toUpperCase()] ??
        record[currency.toLowerCase()];

      if (value) {
        return value.toString();
      }
    }

    return undefined;
  }

  private async fetchAccountReferenceForCurrency(currency: string): Promise<string | undefined> {
    try {
      this.logger.debug(`Payaza fetching account reference for currency ${currency}`);

      const response = await this.client.get(`/live/payaza-account/api/v1/mainaccounts/merchant/banks/${currency}`);
      const data = response.data;

      const accounts = Array.isArray(data?.data) ? data.data : [];
      const activeAccount = accounts.find((account: any) => account?.status === 'ACTIVE') || accounts[0];

      const reference =
        activeAccount?.payazaAccountReference ||
        activeAccount?.account_reference ||
        activeAccount?.accountReference;

      if (reference) {
        this.logger.debug(`Payaza account reference retrieved for ${currency}`);
        return reference.toString();
      }

      this.logger.warn(`Payaza account reference not found in response for currency ${currency}`);
      return undefined;
    } catch (error: any) {
      this.logger.warn(`Failed to fetch Payaza account reference for ${currency}: ${error.message}`);
      const alternateReference = await this.fetchAccountReferenceFromMainEnquiry(currency);
      if (alternateReference) {
        return alternateReference;
      }

      const configuredFallback = this.getConfiguredAccountReference(currency);
      if (configuredFallback) {
        this.logger.warn(
          `Using configured fallback Payaza account reference for ${currency}. Please verify with Payaza dashboard.`,
        );
        return configuredFallback;
      }

      return undefined;
    }
  }

  private async fetchAccountReferenceFromMainEnquiry(currency: string): Promise<string | undefined> {
    try {
      this.logger.debug(`Payaza fetching main account enquiry for currency ${currency}`);

      const response = await this.client.get('/live/payaza-account/api/v1/mainaccounts/merchant/enquiry/main');
      const data = response.data;
      const accounts = Array.isArray(data?.data) ? data.data : [];

      const normalizedCurrency = currency.toUpperCase();
      const matchingAccount = accounts.find(
        (account: any) =>
          account?.currencyCode?.toUpperCase() === normalizedCurrency ||
          account?.currency?.toUpperCase() === normalizedCurrency,
      );

      const reference =
        matchingAccount?.payazaAccountReference ||
        matchingAccount?.account_reference ||
        matchingAccount?.accountReference;

      if (reference) {
        this.logger.debug(`Payaza account reference obtained from main enquiry for ${currency}`);
        return reference.toString();
      }

      return undefined;
    } catch (error: any) {
      this.logger.warn(`Failed Payaza main enquiry for ${currency}: ${error.message}`);
      return undefined;
    }
  }

  private resolveBankCode(payoutData: any, transactionType: string): string | undefined {
    const metadataBankCode =
      payoutData?.metadata?.payazaBankCode ||
      payoutData?.metadata?.payaza_bank_code;

    const candidateCodes = [
      payoutData?.bankCode,
      payoutData?.beneficiaryBankCode,
      payoutData?.beneficiaryIfsc,
      payoutData?.beneficiaryBic,
      metadataBankCode,
    ];

    if (transactionType === 'mobile_money' && payoutData?.metadata?.payazaWalletCode) {
      candidateCodes.unshift(payoutData.metadata.payazaWalletCode);
    }

    const code = candidateCodes.find((candidate) => !!candidate);
    return code ? code.toString().trim() : undefined;
  }

  private resolveAccountNumber(payoutData: any, transactionType: string): string | undefined {
    const candidates = [
      payoutData?.beneficiaryAccount,
      payoutData?.beneficiaryMobile,
      payoutData?.metadata?.payazaAccountNumber,
      payoutData?.metadata?.payaza_account_number,
      payoutData?.customerPhone,
    ];

    if (transactionType === 'mobile_money') {
      candidates.unshift(payoutData?.beneficiaryMobile);
    }

    const accountNumber = candidates.find((candidate) => !!candidate);
    return accountNumber ? accountNumber.toString().trim() : undefined;
  }

  private sanitizeNarration(narration: string): string {
    const cleaned = narration.replace(/[^A-Za-z0-9 ]+/g, ' ').trim();
    if (!cleaned) {
      return 'Payout';
    }
    return cleaned.slice(0, 25);
  }

  private resolveCountryAlpha3(currency: string, providedCountry?: string, metadata?: Record<string, any>): string | undefined {
    const metadataCountry =
      metadata?.payazaCountry ||
      metadata?.payaza_country ||
      metadata?.payazaCountryCode ||
      metadata?.payaza_country_code;

    const raw = metadataCountry || providedCountry;

    if (raw) {
      const normalized = raw.toString().trim().toUpperCase();
      if (normalized.length === 3) {
        return normalized;
      }
      if (normalized.length === 2) {
        return ISO_ALPHA2_TO_ALPHA3[normalized];
      }
    }

    const defaultCountry = PAYAZA_CURRENCY_DEFAULT_COUNTRY[currency];
    return defaultCountry ? defaultCountry.alpha3 : undefined;
  }

  private buildSender(payoutData: any): Record<string, any> {
    const metadata = payoutData?.metadata || {};

    const senderName =
      metadata.payazaSenderName ||
      metadata.payaza_sender_name ||
      payoutData?.customerId ||
      payoutData?.merchantId ||
      payoutData?.beneficiaryName ||
      'Valorapays Merchant';

    const sender: Record<string, any> = {
      sender_name: senderName.toString().slice(0, 60),
    };

    const senderId = metadata.payazaSenderId || metadata.payaza_sender_id;
    if (senderId) {
      sender.sender_id = senderId.toString();
    }

    const senderPhone =
      metadata.payazaSenderPhone ||
      metadata.payaza_sender_phone ||
      payoutData?.customerPhone ||
      payoutData?.beneficiaryMobile;
    if (senderPhone) {
      const normalizedPhone = this.normalizePhoneNumber(senderPhone.toString());
      if (normalizedPhone) {
        sender.sender_phone_number = normalizedPhone;
      }
    }

    const senderAddress =
      metadata.payazaSenderAddress ||
      metadata.payaza_sender_address ||
      payoutData?.beneficiaryAddress ||
      payoutData?.merchantAddress;
    if (senderAddress) {
      sender.sender_address = senderAddress.toString().slice(0, 120);
    }

    return sender;
  }

  private normalizePhoneNumber(phone: string): string {
    const digits = phone.replace(/[^\d+]/g, '');
    if (!digits) {
      return '';
    }
    if (digits.startsWith('+')) {
      return digits;
    }
    return digits;
  }

  private isPayoutInitiated(response: any): boolean {
    if (!response) {
      return false;
    }

    const responseCode = response?.response_code ?? response?.resp_code;
    const responseCodeString = responseCode !== undefined ? responseCode.toString() : undefined;
    const transactionStatusCode = response?.response_content?.transaction_status?.toString();
    const responseStatus =
      response?.response_content?.response_status?.toString().toUpperCase() || '';

    const successfulResponseCodes = new Set(['200', '00', '09']);

    if (responseCodeString && successfulResponseCodes.has(responseCodeString)) {
      return true;
    }

    if (typeof response?.response_code === 'number' && response.response_code === 200) {
      return true;
    }

    if (transactionStatusCode && successfulResponseCodes.has(transactionStatusCode)) {
      return true;
    }

    if (
      responseStatus &&
      [
        'TRANSACTION_INITIATED',
        'TRANSACTION_PROCESSING',
        'TRANSACTION_PENDING',
        'TRANSACTION_SUCCESSFUL',
        'TRANSACTION_COMPLETED',
        'SUCCESS',
        'SUCCESSFUL',
      ].includes(responseStatus)
    ) {
      return true;
    }

    return false;
  }

  private mapPayazaTransferStatus(responseStatus?: string, transactionStatusCode?: string): string {
    const normalizedStatus = responseStatus ? responseStatus.toString().toUpperCase() : '';

    switch (normalizedStatus) {
      case 'TRANSACTION_SUCCESSFUL':
      case 'TRANSACTION_COMPLETED':
      case 'SUCCESS':
      case 'SUCCESSFUL':
        return 'completed';
      case 'TRANSACTION_FAILED':
      case 'FAILED':
      case 'DECLINED':
        return 'failed';
      case 'TRANSACTION_CANCELLED':
      case 'CANCELLED':
        return 'cancelled';
      case 'TRANSACTION_REVERSED':
      case 'REVERSED':
        return 'refunded';
      default:
        break;
    }

    const statusCode = transactionStatusCode ? transactionStatusCode.toString() : '';
    if (statusCode === '00') {
      return 'completed';
    }
    if (statusCode === '09') {
      return 'processing';
    }

    return 'processing';
  }

  // Helper methods

  /**
   * Map Payaza status to standardized status
   */
  private mapPayazaStatus(payazaStatus: string): string {
    const statusMap: Record<string, string> = {
      'successful': 'completed',
      'success': 'completed',
      'completed': 'completed',
      'pending': 'pending',
      'processing': 'processing',
      'failed': 'failed',
      'declined': 'failed',
      'cancelled': 'cancelled',
      'reversed': 'refunded',
      'refunded': 'refunded',
    };

    return statusMap[payazaStatus.toLowerCase()] || 'pending';
  }

  /**
   * Extract first name from full name
   */
  private extractFirstName(fullName?: string): string {
    if (!fullName) return 'Customer';
    const parts = fullName.trim().split(' ');
    return parts[0];
  }

  /**
   * Extract last name from full name
   */
  private extractLastName(fullName?: string): string {
    if (!fullName) return '';
    const parts = fullName.trim().split(' ');
    return parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
  }
}

