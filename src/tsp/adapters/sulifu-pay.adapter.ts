import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import { TSPAdapter, TSPResponse, PaymentRequest } from '@/types/tsp';
import { TSPConfiguration } from '@/entities/tsp-configuration.entity';
import { LoggerService } from '@/common/services/logger.service';
import { SULIFU_IN_BANK_CODE_SET } from '../constants/sulifu-pay.constants';
import {
  SulifuPayAuth,
  SulifuPayDepositRequest,
  SulifuPayDepositResponse,
  SulifuPayPayoutRequest,
  SulifuPayPayoutResponse,
  SulifuPayBalanceRequest,
  SulifuPayBalanceResponse,
  SulifuPayDepositInquiryRequest,
  SulifuPayDepositInquiryResponse,
  SulifuPayPayoutInquiryRequest,
  SulifuPayPayoutInquiryResponse,
  SulifuPayDepositNotification,
  SulifuPayPayoutNotification,
  SulifuPayPaymentStatus,
  SulifuPayPayoutStatus,
  SulifuPayChannelType,
  SulifuPayPayoutChannelType,
} from '@/types/sulifu-pay.types';

/**
 * Sulifu Pay TSP Adapter
 * Implements Sulifu Pay API v3.0 specification
 * 
 * Key Features:
 * - Multi-country support (Brazil PIX, India UPI, Hong Kong FPS, etc.)
 * - Multiple payment channels (Bank transfer, E-wallets, QR codes)
 * - Deposit and Payout (Withdrawal) support
 * - MD5 signature-based authentication
 * - Form-data request format
 */
export class SulifuPayAdapter implements TSPAdapter {
  private client: AxiosInstance;
  private auth: SulifuPayAuth;
  private baseURL: string;

  constructor(
    private config: TSPConfiguration,
    private logger: LoggerService,
  ) {
    this.auth = {
      merNo: config.credentials['mer_no'] as string,
      apiKey: config.credentials['api_key'] as string,
      apiUrl: config.credentials['api_url'] as string,
    };

    this.baseURL = this.auth.apiUrl;

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': 'Valorapays-PaymentEngine/1.0',
      },
      timeout: 60000, 
    });

    this.validateCredentials();
    
    this.logger.log(`Sulifu Pay adapter initialized for ${config.environment} environment`);
  }

  /**
   * Create payment/deposit
   */
  async createPayment(request: PaymentRequest): Promise<TSPResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Creating Sulifu Pay deposit for amount: ${request.amount} ${request.currency}`);
    
      const tradeNo = `valorapays_${request.merchantId}_${request.requestId}_${Date.now()}`;
     
      const channelType = this.determineChannelType(request);
      this.logger.log(`Determined channel type for ${request.currency}: ${channelType}`);
      
      const depositRequest: Omit<SulifuPayDepositRequest, 'sign'> = {
        merNo: this.auth.merNo,
        tradeNo,
        cType: channelType,
        bankCode: request.metadata?.bankCode as string,
        orderAmount: request.amount,
        playerId: request.customerId || `customer_${request.merchantId}`,
        playerName: request.customerDetails?.name || 'Customer',
        playerPhoneNumber: request.customerDetails?.phone,
        playerEmail: request.customerDetails?.email,
        notifyUrl: this.getValorapaysWebhookUrl(),
        returnUrl: request.returnUrl,
        country: request.customerDetails?.country,
        // Optional fields from metadata
        identifyNum: request.metadata?.identifyNum as string,
        supermarketCode: request.metadata?.supermarketCode as string,
        playerPayAcc: request.metadata?.playerPayAcc as string,
        playerPayBankName: request.metadata?.playerPayBankName as string,
        playerBirthday: request.metadata?.playerBirthday as string,
        areaCode: request.metadata?.areaCode as string,
        idNo: request.metadata?.idNo as string,
        telCo: request.metadata?.telCo as string,
        gender: request.metadata?.gender as string,
        playerBankAccountName: request.metadata?.playerBankAccountName as string,
        postalCode: request.metadata?.postalCode as string,
        city: request.metadata?.city as string,
        address: request.metadata?.address as string,
        storeId: request.metadata?.storeId as string,
        playerWalletAddr: request.metadata?.playerWalletAddr as string,
        VerifyChannelNo: request.metadata?.verifyChannelNo as number,
      };

      // Generate signature
      const sign = this.generateDepositSignature(
        depositRequest.merNo,
        depositRequest.tradeNo,
        depositRequest.orderAmount
      );

      const finalRequest: SulifuPayDepositRequest = {
        ...depositRequest,
        sign,
      };

      this.logger.log(`Sending Sulifu Pay request: merNo=${finalRequest.merNo}, tradeNo=${finalRequest.tradeNo}, cType=${finalRequest.cType}, orderAmount=${finalRequest.orderAmount}, country=${finalRequest.country}`);

      const formData = this.objectToFormData(finalRequest);
      
      this.logger.debug(`Full Sulifu Pay request form data: ${formData}`);
      this.logger.debug(`Request URL: ${this.auth.apiUrl}/pay/createOrder`);

      const response = await this.client.post<SulifuPayDepositResponse>(
        '/pay/createOrder',
        formData
      );
      
      const responseTime = Date.now() - startTime;
      const data = response.data;
      
      this.logger.log(`Sulifu Pay deposit response: ${JSON.stringify(data)}`);

      if (data.Success === 1) {
        this.logger.log(`Sulifu Pay deposit created successfully: ${tradeNo} / OID: ${data.oid} (${responseTime}ms)`);

        return {
          success: true,
          transactionId: tradeNo,
          providerTransactionId: data.oid || tradeNo,
          status: 'created',
          amount: request.amount,
          currency: request.currency,
          responseTime,
          providerResponse: data,
          message: data.Message
            ? this.translateMessage(data.Message)
            : 'Payment initiated successfully',
          redirectUrl: data.PayPage,
        };
      } else {
        throw new Error(data.Message || 'Payment creation failed');
      }

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      this.logger.error(`Sulifu Pay deposit creation failed (${responseTime}ms):`, error);

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

  /**
   * Verify payment status
   */
  async verifyPayment(transactionId: string, signature?: string, orderId?: string): Promise<TSPResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Verifying Sulifu Pay payment: ${transactionId}`);
   
      const inquiryRequest: Omit<SulifuPayDepositInquiryRequest, 'sign'> = {
        merNo: this.auth.merNo,
        tradeNo: transactionId,
      };

      const sign = this.generateInquirySignature(
        inquiryRequest.merNo,
        inquiryRequest.tradeNo
      );

      const finalRequest: SulifuPayDepositInquiryRequest = {
        ...inquiryRequest,
        sign,
      };

      const formData = this.objectToFormData(finalRequest);

      const response = await this.client.post<SulifuPayDepositInquiryResponse>(
        '/inquiry/payOrder',
        formData
      );
      
      const responseTime = Date.now() - startTime;
      const data = response.data;

      if (data.Success === 1 && data.status === SulifuPayPaymentStatus.SUCCESS) {
        this.logger.log(`Sulifu Pay payment verified successfully: ${transactionId} (${responseTime}ms)`);
        
        return {
          success: true,
          transactionId,
          providerTransactionId: transactionId,
          status: 'completed',
          amount: data.topupAmount || data.orderAmount || 0,
          currency: 'USD', 
          responseTime,
          providerResponse: data,
          message: 'Payment completed successfully',
        };
      } else {
        const status = this.mapPaymentStatus(data.status);
        
        return {
          success: false,
          transactionId,
          providerTransactionId: transactionId,
          status,
          amount: data.orderAmount || 0,
          currency: 'USD',
          responseTime,
          providerResponse: data,
          message: data.Message
            ? this.translateMessage(data.Message)
            : `Payment status: ${status}`,
        };
      }

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      this.logger.error(`Sulifu Pay payment verification failed (${responseTime}ms):`, error);

      return this.handleError(error, {
        transactionId,
        providerTransactionId: transactionId,
        status: 'failed',
        amount: 0,
        currency: 'USD',
        responseTime,
        message: this.translateMessage(error.message) || 'Payment verification failed',
      });
    }
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(transactionId: string): Promise<TSPResponse> {
    // Same as verifyPayment for Sulifu Pay
    return this.verifyPayment(transactionId);
  }

  /**
   * Refund payment
   * Note: Sulifu Pay does not have a direct refund API
   * Refunds may need to be handled through manual process or support
   */
  async refundPayment(transactionId: string, amount?: number): Promise<TSPResponse> {
    const startTime = Date.now();
    const responseTime = Date.now() - startTime;
    
    this.logger.warn(`Sulifu Pay does not support automated refunds. Transaction: ${transactionId}`);

    return {
      success: false,
      transactionId,
      providerTransactionId: transactionId,
      status: 'failed',
      amount: amount || 0,
      currency: 'USD',
      responseTime,
      error: 'Refunds not supported by Sulifu Pay API',
      message: 'Refunds must be processed manually through Sulifu Pay support',
    };
  }

  /**
   * Create payout/withdrawal
   */
  async createPayout(payoutData: any): Promise<TSPResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Creating Sulifu Pay payout: ${payoutData.payoutId}, amount: ${payoutData.amount}`);
      
      const { bankCode, sanitizedAccount } = this.validatePayoutRequest(payoutData);

      const tradeNo = `payout_${payoutData.payoutId}_${Date.now()}`;
      const channelType = this.determinePayoutChannelType(payoutData);
 
      const payoutRequest: Omit<SulifuPayPayoutRequest, 'sign'> = {
        merNo: this.auth.merNo,
        tradeNo,
        cType: channelType,
        bankCode,
        bankBranch: payoutData.bankBranch,
        branchCode: payoutData.branchCode,
        documentId: payoutData.documentId || payoutData.beneficiaryDocumentId,
        accountType: payoutData.accountType,
        documentType: payoutData.documentType,
        bankCardNo: sanitizedAccount,
        orderAmount: payoutData.amount,
        accountName: payoutData.beneficiaryName,
        openProvince: payoutData.openProvince || payoutData.beneficiaryProvince || '1',
        openCity: payoutData.openCity || payoutData.beneficiaryCity || '1',
        notifyUrl: this.getValorapaysWebhookUrl(),
        financial_bank_code: payoutData.beneficiaryIfsc || payoutData.financial_bank_code,
        cellphone_number: payoutData.beneficiaryMobile || payoutData.cellphone_number,
        playerId: payoutData.playerId || payoutData.customerId,
        playerEmail: payoutData.playerEmail || payoutData.customerEmail,
        VerifyChannelNo: payoutData.verifyChannelNo,
      };

      // Generate signature
      const sign = this.generatePayoutSignature(
        payoutRequest.merNo,
        payoutRequest.tradeNo,
        payoutRequest.bankCode,
        payoutRequest.orderAmount
      );

      const finalRequest: SulifuPayPayoutRequest = {
        ...payoutRequest,
        sign,
      };

      const formData = this.objectToFormData(finalRequest);

      const response = await this.client.post<SulifuPayPayoutResponse>(
        '/payout/createOrder',
        formData
      );
      
      const responseTime = Date.now() - startTime;
      const data = response.data;
      
      this.logger.log(`Sulifu Pay payout response: ${JSON.stringify(data)}`);

      if (data.Success === 1) {
        this.logger.log(`Sulifu Pay payout created successfully: ${tradeNo} / OID: ${data.oid} (${responseTime}ms)`);

        return {
          success: true,
          transactionId: tradeNo,
          providerTransactionId: data.oid || tradeNo,
          status: 'processing',
          amount: payoutData.amount,
          currency: payoutData.currency || 'USD',
          responseTime,
          providerResponse: data,
          message: data.Message
            ? this.translateMessage(data.Message)
            : 'Payout initiated successfully',
        };
      } else {
        throw new Error(data.Message || 'Payout creation failed');
      }

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      this.logger.error(`Sulifu Pay payout creation failed (${responseTime}ms):`, error);

      return this.handleError(error, {
        transactionId: null,
        providerTransactionId: null,
        status: 'failed',
        amount: payoutData.amount,
        currency: payoutData.currency || 'USD',
        responseTime,
        message: this.translateMessage(error.message) || 'Payout creation failed',
      });
    }
  }

  /**
   * Check payout status
   */
  async checkPayoutStatus(payoutId: string): Promise<TSPResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Checking Sulifu Pay payout status: ${payoutId}`);
      
      const inquiryRequest: Omit<SulifuPayPayoutInquiryRequest, 'sign'> = {
        merNo: this.auth.merNo,
        tradeNo: payoutId,
      };

      const sign = this.generateInquirySignature(
        inquiryRequest.merNo,
        inquiryRequest.tradeNo
      );

      const finalRequest: SulifuPayPayoutInquiryRequest = {
        ...inquiryRequest,
        sign,
      };

      const formData = this.objectToFormData(finalRequest);

      const response = await this.client.post<SulifuPayPayoutInquiryResponse>(
        '/inquiry/payoutOrder',
        formData
      );
      
      const responseTime = Date.now() - startTime;
      const data = response.data;

      if (data.Success === 1) {
        const status = this.mapPayoutStatus(data.status);
        const isSuccess = data.status === SulifuPayPayoutStatus.SUCCESS;
        
        this.logger.log(`Sulifu Pay payout status retrieved: ${payoutId} -> ${status} (${responseTime}ms)`);

        return {
          success: isSuccess,
          transactionId: payoutId,
          providerTransactionId: payoutId,
          status,
          amount: data.topupAmount || data.orderAmount || 0,
          currency: 'USD',
          responseTime,
          providerResponse: data,
          message: data.Message
            ? this.translateMessage(data.Message)
            : `Payout status: ${status}`,
        };
      } else {
        throw new Error(data.Message || 'Payout status check failed');
      }

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      this.logger.error(`Sulifu Pay payout status check failed (${responseTime}ms):`, error);

      return this.handleError(error, {
        transactionId: payoutId,
        providerTransactionId: payoutId,
        status: 'failed',
        amount: 0,
        currency: 'USD',
        responseTime,
        message: this.translateMessage(error.message) || 'Payout status check failed',
      });
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      this.logger.debug('Performing Sulifu Pay health check');
      
      const datetime = this.formatDateTime(new Date());
      const balanceRequest: Omit<SulifuPayBalanceRequest, 'sign'> = {
        merNo: this.auth.merNo,
        datetime,
      };

      const sign = this.generateBalanceSignature(
        balanceRequest.merNo,
        balanceRequest.datetime
      );

      const finalRequest: SulifuPayBalanceRequest = {
        ...balanceRequest,
        sign,
      };

      const formData = this.objectToFormData(finalRequest);

      const response = await this.client.post<SulifuPayBalanceResponse>(
        '/inquiry/getMerBalance',
        formData
      );
      
      this.logger.debug('Sulifu Pay health check successful');
      return response.data.Success === 1;
      
    } catch (error) {
      this.logger.warn('Sulifu Pay health check failed:', error);
      return false;
    }
  }

  /**
   * Get provider name
   */
  getProviderName(): string {
    return 'sulifu_pay';
  }

  /**
   * Get environment
   */
  getEnvironment(): string {
    return this.config.environment;
  }

  /**
   * Verify webhook signature
   * For deposits: MD5(tradeNo+topupAmount+key)
   * For payouts: MD5(tradeNo+orderAmount+key)
   */
  verifyWebhookSignature(payload: any, receivedSignature: string, secret?: string): boolean {
    try {
      let expectedSignature: string;

      // Check if it's a deposit or payout notification
      if ('topupAmount' in payload) {
        const notification = payload as SulifuPayDepositNotification;
        expectedSignature = this.generateWebhookDepositSignature(
          notification.tradeNo,
          notification.topupAmount
        );
      } else if ('orderAmount' in payload) {
        const notification = payload as SulifuPayPayoutNotification;
        expectedSignature = this.generateWebhookPayoutSignature(
          notification.tradeNo,
          notification.orderAmount
        );
      } else {
        this.logger.error('Unknown webhook payload format');
        return false;
      }

      const isValid = expectedSignature.toLowerCase() === receivedSignature.toLowerCase();

      if (!isValid) {
        this.logger.warn('Sulifu Pay webhook signature verification failed');
        this.logger.debug(`Expected: ${expectedSignature}, Received: ${receivedSignature}`);
      }

      return isValid;
    } catch (error) {
      this.logger.error('Sulifu Pay webhook signature verification error:', error);
      return false;
    }
  }

  // ===== Private Helper Methods =====

  /**
   * Generate MD5 signature for deposit
   * Format: MD5(merNo+tradeNo+orderAmount+ApiKey)
   */
  private generateDepositSignature(merNo: string, tradeNo: string, orderAmount: number): string {
    const data = `${merNo}${tradeNo}${orderAmount}${this.auth.apiKey}`;
    return this.md5(data);
  }

  /**
   * Generate MD5 signature for payout
   * Format: MD5(merNo+tradeNo+bankCode+orderAmount+key)
   */
  private generatePayoutSignature(merNo: string, tradeNo: string, bankCode: string, orderAmount: number): string {
    const data = `${merNo}${tradeNo}${bankCode}${orderAmount}${this.auth.apiKey}`;
    return this.md5(data);
  }

  /**
   * Generate MD5 signature for inquiry
   * Format: MD5(merNo+tradeNo+key)
   */
  private generateInquirySignature(merNo: string, tradeNo: string): string {
    const data = `${merNo}${tradeNo}${this.auth.apiKey}`;
    return this.md5(data);
  }

  /**
   * Generate MD5 signature for balance inquiry
   * Format: MD5(merNo+datetime+key)
   */
  private generateBalanceSignature(merNo: string, datetime: string): string {
    const data = `${merNo}${datetime}${this.auth.apiKey}`;
    return this.md5(data);
  }

  /**
   * Generate MD5 signature for deposit webhook
   * Format: MD5(tradeNo+topupAmount+key)
   */
  private generateWebhookDepositSignature(tradeNo: string, topupAmount: number): string {
    const data = `${tradeNo}${topupAmount}${this.auth.apiKey}`;
    return this.md5(data);
  }

  /**
   * Generate MD5 signature for payout webhook
   * Format: MD5(tradeNo+orderAmount+key)
   */
  private generateWebhookPayoutSignature(tradeNo: string, orderAmount: number): string {
    const data = `${tradeNo}${orderAmount}${this.auth.apiKey}`;
    return this.md5(data);
  }

  /**
   * MD5 hash function
   */
  private md5(data: string): string {
    return crypto.createHash('md5').update(data, 'utf8').digest('hex').toLowerCase();
  }

  /**
   * Convert object to URL-encoded form data
   * Handles null values by converting to empty strings
   */
  private objectToFormData(obj: any): string {
    const params = new URLSearchParams();
    
    Object.keys(obj).forEach(key => {
      const value = obj[key];
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      } else if (value === null) {
        params.append(key, '');
      }
    });

    return params.toString();
  }

  /**
   * Format datetime to YYYYMMDDhhmmss
   */
  private formatDateTime(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  }

  /**
   * Determine channel type from payment request
   */
  private determineChannelType(request: PaymentRequest): SulifuPayChannelType {
    if (request.metadata?.channelType) {
      return request.metadata.channelType as SulifuPayChannelType;
    }
    const country = request.customerDetails?.country?.toUpperCase();
    const currency = request.currency?.toUpperCase();
    const paymentMethod = request.metadata?.paymentMethod?.toLowerCase() || 
                          request.metadata?.selectedPaymentMethod?.toLowerCase() || '';

    this.logger.debug(`Channel determination: country=${country}, currency=${currency}, paymentMethod=${paymentMethod}`);

    if (country === 'BR' || currency === 'BRL') {
      return 'PIXPay';
    } else if (country === 'HK' || country === 'CN') {
      return 'FasterPayment';
    } else if (country === 'IN' || currency === 'INR') {
      if (paymentMethod === 'upi') {
        this.logger.debug(`Using UPIQR-H5 for UPI payment`);
        return 'UPIQR-H5';
      } else if (paymentMethod === 'wallet' || paymentMethod === 'qr') {
        this.logger.debug(`Using UPIQR for wallet/QR payment`);
        return 'UPIQR';
      }
      this.logger.debug(`Using UPIQR as default for India`);
      return 'UPIQR-H5';
    }

    return 'BankToBank';
  }

  /**
   * Determine payout channel type
   */
  private determinePayoutChannelType(payoutData: any): SulifuPayPayoutChannelType {
    // Check explicit channel type
    if (payoutData.channelType) {
      return payoutData.channelType as SulifuPayPayoutChannelType;
    }

    // Determine by country/currency
    const country = payoutData.country?.toUpperCase();
    const currency = payoutData.currency?.toUpperCase();

    if (country === 'BR' || currency === 'BRL') {
      return 'PIXPayout';
    } else if (country === 'HK') {
      return 'FasterPayout';
    }

    // Default to standard payout
    return 'Payout';
  }

  /**
   * Map Sulifu Pay payment status to Valorapays status
   */
  private mapPaymentStatus(status?: SulifuPayPaymentStatus): string {
    if (status === undefined) return 'pending';

    switch (status) {
      case SulifuPayPaymentStatus.SUCCESS:
        return 'completed';
      case SulifuPayPaymentStatus.PROCESSING:
        return 'processing';
      case SulifuPayPaymentStatus.REVIEWING:
        return 'reviewing';
      case SulifuPayPaymentStatus.FAILED_CREATE:
        return 'failed';
      default:
        return 'pending';
    }
  }

  /**
   * Map Sulifu Pay payout status to Valorapays status
   */
  private mapPayoutStatus(status?: SulifuPayPayoutStatus): string {
    if (status === undefined) return 'pending';

    switch (status) {
      case SulifuPayPayoutStatus.SUCCESS:
        return 'completed';
      case SulifuPayPayoutStatus.PROCESSING:
        return 'processing';
      case SulifuPayPayoutStatus.API_AUDIT:
      case SulifuPayPayoutStatus.MANUAL_AUDIT:
        return 'reviewing';
      case SulifuPayPayoutStatus.FAILED_CREATE:
      case SulifuPayPayoutStatus.FAILED_PAYMENT:
        return 'failed';
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
      const sulifuError = error.response.data;
      errorMessage = sulifuError.Message || error.message;
      errorCode = sulifuError.Success?.toString() || 'API_ERROR';

      try {
        this.logger.error(`Sulifu Pay error response payload: ${JSON.stringify(sulifuError)}`);
      } catch (stringifyError) {
        this.logger.error(`Sulifu Pay error response payload could not be stringified: ${String(stringifyError)}`);
      }
    } else {
      errorMessage = error.message || 'Request failed';
      if (errorMessage) {
        this.logger.error(`Sulifu Pay error: ${errorMessage}`);
      }
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

  /**
   * Get Valorapays webhook URL for Sulifu Pay
   */
  private getValorapaysWebhookUrl(): string {
    const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'https://api.valorapayss.io';
    return `${webhookBaseUrl}/payment/api/v1/webhooks/sulifu-pay`;
  }

  /**
   * Validate required credentials on initialization
   */
  private validateCredentials(): void {
    const required = ['mer_no', 'api_key', 'api_url'];
    const missing = required.filter(key => !this.config.credentials[key]);
    
    if (missing.length > 0) {
      throw new Error(`Sulifu Pay adapter missing required credentials: ${missing.join(', ')}`);
    }
  }

  /**
   * Get merchant balance (useful for monitoring)
   */
  async getMerchantBalance(): Promise<{ balance?: number; freeze?: number; openBalance?: number }> {
    try {
      this.logger.debug('Getting Sulifu Pay merchant balance');
      
      const datetime = this.formatDateTime(new Date());
      const balanceRequest: Omit<SulifuPayBalanceRequest, 'sign'> = {
        merNo: this.auth.merNo,
        datetime,
      };

      const sign = this.generateBalanceSignature(
        balanceRequest.merNo,
        balanceRequest.datetime
      );

      const finalRequest: SulifuPayBalanceRequest = {
        ...balanceRequest,
        sign,
      };

      const formData = this.objectToFormData(finalRequest);

      const response = await this.client.post<SulifuPayBalanceResponse>(
        '/inquiry/getMerBalance',
        formData
      );
      
      if (response.data.Success === 1) {
        return {
          balance: response.data.Balance,
          freeze: response.data.Freeze,
          openBalance: response.data.OpenBalance,
        };
      } else {
        throw new Error(response.data.Message || 'Failed to get balance');
      }
      
    } catch (error) {
      this.logger.error('Failed to get Sulifu Pay merchant balance:', error);
      return {};
    }
  }

  /**
   * Translate Sulifu Pay message strings
   */
  private translateMessage(message?: string): string | undefined {
    if (!message) {
      return message;
    }

    const translations: Record<string, string> = {
      '成功': 'Payment successful',
      '系统正在处理，请耐心等待': 'Payment processing, please wait',
      '订单已受理，等待支付': 'Order accepted, awaiting payment',
      '订单失败': 'Payment failed',
      '失败': 'Failed',
      '处理中': 'Processing',
    };

    return translations[message] || message;
  }

  private validatePayoutRequest(payoutData: any): { bankCode: string; sanitizedAccount: string } {
    const providedCode = (payoutData.beneficiaryBankCode || payoutData.bankCode || '').toString();
    if (!providedCode) {
      throw new Error('Sulifu Pay payout requires a bank code');
    }

    const normalizedCode = providedCode.toLowerCase();

    let canonicalCode = normalizedCode;
    if (canonicalCode === 'yesb') {
      canonicalCode = 'dp_yes_in';
    }

    if (!SULIFU_IN_BANK_CODE_SET.has(canonicalCode)) {
      throw new Error(`Unsupported bank code for Sulifu Pay payout: ${providedCode}`);
    }

    const account = (payoutData.beneficiaryAccount || payoutData.beneficiaryIban || '').toString();
    if (!account || account.length < 5) {
      throw new Error('Sulifu Pay payout requires a valid beneficiary account number');
    }

    return {
      bankCode: canonicalCode,
      sanitizedAccount: account,
    };
  }
}

