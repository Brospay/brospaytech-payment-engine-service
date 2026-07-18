import axios, { AxiosInstance } from 'axios';
import { TSPAdapter, TSPResponse, PaymentRequest } from '@/types/tsp';
import { TSPConfiguration } from '@/entities/tsp-configuration.entity';
import { LoggerService } from '@/common/services/logger.service';



// indian banks
export class PaytaraAdapter implements TSPAdapter {
  private client: AxiosInstance;
  private merchantId: string;
  private secretKey: string;

  constructor(
    private config: TSPConfiguration,
    private logger: LoggerService,
  ) {
    this.merchantId = config.credentials['merchant_id'] as string;
    this.secretKey = config.credentials['secret_key'] as string;

    // Paytara typically only has production endpoint
    const baseURL = config.credentials['base_url'] as string || 'https://api.paytara.com';

    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Valorapays-PaymentEngine/1.0',
      },
      timeout: 30000,
    });
  }

  async createPayment(request: PaymentRequest): Promise<TSPResponse> {
    const startTime = Date.now();

    try {
      this.logger.log(`Creating Paytara payment for amount: ${request.amount} ${request.currency}`);

      const paytaraRequest = {
        merchant_id: this.merchantId,
        amount: request.amount,
        currency: request.currency || 'INR',
        order_id: `zp_${request.merchantId}_${Date.now()}`,
        customer_name: request.customerDetails?.name || 'Customer',
        customer_email: request.customerDetails?.email || '',
        customer_mobile: request.customerDetails?.phone || '',
        product_info: request.description || 'Payment',
        return_url: request.returnUrl,
        cancel_url: request.cancelUrl,
        webhook_url: request.webhookUrl,
        hash: this.generateHash({
          merchant_id: this.merchantId,
          amount: request.amount,
          order_id: `zp_${request.merchantId}_${Date.now()}`,
          currency: request.currency || 'INR',
        }),
      };

      const response = await this.client.post('/v2/transaction/initiate', paytaraRequest);

      const responseTime = Date.now() - startTime;

      if (response.data.status === 'success') {
        this.logger.log(`Paytara payment created successfully: ${response.data.transaction_id} (${responseTime}ms)`);

        return {
          success: true,
          transactionId: response.data.transaction_id,
          providerTransactionId: response.data.transaction_id,
          status: 'created',
          amount: request.amount,
          currency: request.currency || 'INR',
          responseTime,
          providerResponse: response.data,
          message: 'Payment initiated successfully',
          redirectUrl: response.data.payment_url,
        };
      } else {
        return {
          success: false,
          transactionId: null,
          providerTransactionId: null,
          status: 'failed',
          amount: request.amount,
          currency: request.currency || 'INR',
          responseTime,
          error: response.data.message || 'Payment initiation failed',
          providerResponse: response.data,
          message: 'Payment initiation failed',
        };
      }

    } catch (error: any) {
      const responseTime = Date.now() - startTime;

      this.logger.error(`Paytara payment creation failed (${responseTime}ms):`, error);

      return {
        success: false,
        transactionId: null,
        providerTransactionId: null,
        status: 'failed',
        amount: request.amount,
        currency: request.currency || 'INR',
        responseTime,
        error: error.response?.data?.message || error.message,
        providerResponse: error.response?.data,
        message: 'Payment creation failed',
      };
    }
  }

  async verifyPayment(transactionId: string, hash?: string): Promise<TSPResponse> {
    const startTime = Date.now();

    try {
      this.logger.log(`Verifying Paytara payment: ${transactionId}`);

      const verifyRequest = {
        merchant_id: this.merchantId,
        transaction_id: transactionId,
        hash: this.generateVerificationHash(transactionId),
      };

      const response = await this.client.post('/v2/transaction/verify', verifyRequest);

      const responseTime = Date.now() - startTime;
      const transaction = response.data;

      if (transaction.status === 'success' && transaction.payment_status === 'captured') {
        this.logger.log(`Paytara payment verified successfully: ${transactionId} (${responseTime}ms)`);

        return {
          success: true,
          transactionId,
          providerTransactionId: transactionId,
          status: 'completed',
          amount: parseFloat(transaction.amount),
          currency: transaction.currency || 'INR',
          responseTime,
          providerResponse: transaction,
          message: 'Payment completed successfully',
        };
      } else {
        return {
          success: false,
          transactionId,
          providerTransactionId: transactionId,
          status: transaction.payment_status || 'failed',
          amount: parseFloat(transaction.amount || '0'),
          currency: transaction.currency || 'INR',
          responseTime,
          error: transaction.failure_reason || 'Payment verification failed',
          providerResponse: transaction,
          message: 'Payment verification failed',
        };
      }

    } catch (error: any) {
      const responseTime = Date.now() - startTime;

      this.logger.error(`Paytara payment verification failed (${responseTime}ms):`, error);

      return {
        success: false,
        transactionId,
        providerTransactionId: transactionId,
        status: 'failed',
        amount: 0,
        currency: 'INR',
        responseTime,
        error: error.response?.data?.message || error.message,
        providerResponse: error.response?.data,
        message: 'Payment verification failed',
      };
    }
  }

  async getPaymentStatus(transactionId: string): Promise<TSPResponse> {
    const startTime = Date.now();

    try {
      this.logger.log(`Getting Paytara payment status: ${transactionId}`);

      const statusRequest = {
        merchant_id: this.merchantId,
        transaction_id: transactionId,
        hash: this.generateVerificationHash(transactionId),
      };

      const response = await this.client.post('/v2/transaction/status', statusRequest);

      const responseTime = Date.now() - startTime;
      const transaction = response.data;

      let status = 'pending';
      let success = false;

      switch (transaction.payment_status) {
        case 'captured':
        case 'success':
          status = 'completed';
          success = true;
          break;
        case 'failed':
          status = 'failed';
          break;
        case 'pending':
        case 'initiated':
          status = 'pending';
          break;
        case 'cancelled':
          status = 'cancelled';
          break;
        default:
          status = 'pending';
      }

      this.logger.log(`Paytara payment status retrieved: ${transactionId} -> ${status} (${responseTime}ms)`);

      return {
        success,
        transactionId,
        providerTransactionId: transactionId,
        status,
        amount: parseFloat(transaction.amount || '0'),
        currency: transaction.currency || 'INR',
        responseTime,
        providerResponse: transaction,
        message: `Payment status: ${status}`,
      };

    } catch (error: any) {
      const responseTime = Date.now() - startTime;

      this.logger.error(`Paytara status check failed (${responseTime}ms):`, error);

      return {
        success: false,
        transactionId,
        providerTransactionId: transactionId,
        status: 'failed',
        amount: 0,
        currency: 'INR',
        responseTime,
        error: error.response?.data?.message || error.message,
        providerResponse: error.response?.data,
        message: 'Status check failed',
      };
    }
  }

  async refundPayment(transactionId: string, amount?: number): Promise<TSPResponse> {
    const startTime = Date.now();

    try {
      this.logger.log(`Processing Paytara refund: ${transactionId}, amount: ${amount}`);

      const refundRequest = {
        merchant_id: this.merchantId,
        transaction_id: transactionId,
        refund_amount: amount,
        refund_id: `refund_${Date.now()}`,
        hash: this.generateRefundHash(transactionId, amount),
      };

      const response = await this.client.post('/v2/transaction/refund', refundRequest);

      const responseTime = Date.now() - startTime;
      const refund = response.data;

      if (refund.status === 'success') {
        this.logger.log(`Paytara refund processed: ${refund.refund_id} (${responseTime}ms)`);

        return {
          success: true,
          transactionId: refund.refund_id,
          providerTransactionId: refund.refund_id,
          status: 'refunded',
          amount: amount || 0,
          currency: 'INR',
          responseTime,
          providerResponse: refund,
          message: 'Refund processed successfully',
        };
      } else {
        return {
          success: false,
          transactionId,
          providerTransactionId: transactionId,
          status: 'failed',
          amount: amount || 0,
          currency: 'INR',
          responseTime,
          error: refund.message || 'Refund failed',
          providerResponse: refund,
          message: 'Refund failed',
        };
      }

    } catch (error: any) {
      const responseTime = Date.now() - startTime;

      this.logger.error(`Paytara refund failed (${responseTime}ms):`, error);

      return {
        success: false,
        transactionId,
        providerTransactionId: transactionId,
        status: 'failed',
        amount: amount || 0,
        currency: 'INR',
        responseTime,
        error: error.response?.data?.message || error.message,
        providerResponse: error.response?.data,
        message: 'Refund failed',
      };
    }
  }

  async createPayout(request: any): Promise<TSPResponse> {
    const startTime = Date.now();
    const crypto = require('crypto');

    try {
      const merchantTransactionId = request.payoutForeignTransactionId || `payout_${Date.now()}`;
      const payoutChannel = this.config.credentials['payout_channel'] as string || 'PT1';

      this.logger.log(`Creating Paytara payout: ${merchantTransactionId}, amount: ${request.amount}`);

      const payoutType = this.determinePayoutType(request);

      const checksumString = `${this.merchantId}|${merchantTransactionId}|${request.amount.toFixed(2)}|${payoutChannel}|${payoutType}|${request.beneficiaryName}|${request.beneficiaryMobile}`;
      const checksum = crypto
        .createHmac('sha256', this.secretKey)
        .update(checksumString)
        .digest('hex');

      const payoutRequest: any = {
        merchantTransactionId,
        amount: request.amount.toFixed(2),
        payoutChannel,
        payoutType,
        beneficiaryName: request.beneficiaryName,
        beneficiaryMobNo: request.beneficiaryMobile,
        payoutRemark: request.purpose || 'Payout',
        checksum,
      };

      if (payoutType === 'UPI' && request.beneficiaryVpa) {
        payoutRequest.beneficiaryVPA = request.beneficiaryVpa;
      } else if (['IMPS', 'NEFT', 'RTGS'].includes(payoutType)) {
        payoutRequest.beneficiaryAccount = request.beneficiaryAccount;
        payoutRequest.beneficiaryIFSC = request.beneficiaryIfsc;
      }

      const response = await this.client.post(
        '/api/v1/payout/initiatePayout',
        payoutRequest,
        {
          headers: {
            'X-MERCHANT-ID': this.merchantId,
            'X-MERCHANT-KEY': this.secretKey,
          },
        }
      );

      const responseTime = Date.now() - startTime;
      const data = response.data;

      if (data.code === '0' && data.msg === 'Success') {
        this.logger.log(`Paytara payout initiated: ${data.data.apitxnid} (${responseTime}ms)`);

        return {
          success: true,
          transactionId: data.data.apitxnid,
          providerTransactionId: data.data.bankref || data.data.apitxnid,
          status: data.data.txn_status === '1' ? 'completed' : 'processing',
          amount: request.amount,
          currency: 'INR',
          responseTime,
          providerResponse: data.data,
          message: data.data.payout_msg || 'Payout initiated successfully',
          // processingFee: 0,
        };
      } else {
        return {
          success: false,
          transactionId: merchantTransactionId,
          providerTransactionId: null,
          status: 'failed',
          amount: request.amount,
          currency: 'INR',
          responseTime,
          error: data.msg || 'Payout initiation failed',
          providerResponse: data,
          message: 'Payout failed',
          // processingFee: 0,
        };
      }

    } catch (error: any) {
      const responseTime = Date.now() - startTime;

      this.logger.error(`Paytara payout failed (${responseTime}ms):`, error);

      return {
        success: false,
        transactionId: null,
        providerTransactionId: null,
        status: 'failed',
        amount: request.amount,
        currency: 'INR',
        responseTime,
        error: error.response?.data?.msg || error.message,
        providerResponse: error.response?.data,
        message: 'Payout creation failed',
        // processingFee: 0,
      };
    }
  }

  async checkPayoutStatus(merchantTransactionId: string): Promise<TSPResponse> {
    const startTime = Date.now();

    try {
      this.logger.log(`Checking Paytara payout status: ${merchantTransactionId}`);

      const response = await this.client.post(
        '/api/v1/payout/checkPayoutStatus',
        { merchantTransactionId },
        {
          headers: {
            'X-MERCHANT-ID': this.merchantId,
            'X-MERCHANT-KEY': this.secretKey,
          },
        }
      );

      const responseTime = Date.now() - startTime;
      const data = response.data;

      if (data.code === '0') {
        const status = data.data.txn_status === '1' ? 'completed' :
          data.data.txn_status === '2' ? 'failed' : 'processing';

        return {
          success: true,
          transactionId: data.data.apitxnid,
          providerTransactionId: data.data.bankref,
          status,
          amount: parseFloat(data.data.amount),
          currency: 'INR',
          responseTime,
          providerResponse: data.data,
          message: data.data.payout_msg,
        };
      } else {
        return {
          success: false,
          transactionId: merchantTransactionId,
          providerTransactionId: null,
          status: 'failed',
          amount: 0,
          currency: 'INR',
          responseTime,
          error: data.msg,
          providerResponse: data,
          message: 'Payout status check failed',
        };
      }

    } catch (error: any) {
      const responseTime = Date.now() - startTime;

      this.logger.error(`Paytara payout status check failed (${responseTime}ms):`, error);

      return {
        success: false,
        transactionId: merchantTransactionId,
        providerTransactionId: null,
        status: 'failed',
        amount: 0,
        currency: 'INR',
        responseTime,
        error: error.response?.data?.msg || error.message,
        providerResponse: error.response?.data,
        message: 'Status check failed',
      };
    }
  }

  private determinePayoutType(request: any): string {
    if (request.payoutType) {
      return request.payoutType.toUpperCase();
    }

    if (request.beneficiaryVpa) {
      return 'UPI';
    }

    if (request.amount < 200000) {
      return 'IMPS';
    }

    return 'NEFT';
  }

  async healthCheck(): Promise<boolean> {
    try {
      this.logger.debug('Performing Paytara health check');

      const healthRequest = {
        merchant_id: this.merchantId,
        hash: this.generateHealthHash(),
      };

      const response = await this.client.post('/v2/merchant/status', healthRequest);

      this.logger.debug('Paytara health check successful');
      return response.data.status === 'active';

    } catch (error) {
      this.logger.warn('Paytara health check failed:', error);
      return false;
    }
  }

  getProviderName(): string {
    return 'paytara';
  }

  getEnvironment(): string {
    return this.config.environment;
  }

  verifyWebhookSignature(payload: any, receivedHash: string): boolean {
    try {
      const generatedHash = this.generateWebhookHash(payload);
      return generatedHash === receivedHash;
    } catch (error) {
      this.logger.error('Paytara webhook signature verification failed:', error);
      return false;
    }
  }

  // Private helper methods for hash generation
  private generateHash(data: any): string {
    const hashString = `${data.merchant_id}|${data.amount}|${data.order_id}|${data.currency}|${this.secretKey}`;
    return Buffer.from(hashString).toString('base64');
  }

  private generateVerificationHash(transactionId: string): string {
    const hashString = `${this.merchantId}|${transactionId}|${this.secretKey}`;
    return Buffer.from(hashString).toString('base64');
  }

  private generateRefundHash(transactionId: string, amount?: number): string {
    const hashString = `${this.merchantId}|${transactionId}|${amount}|${this.secretKey}`;
    return Buffer.from(hashString).toString('base64');
  }

  private generateHealthHash(): string {
    const hashString = `${this.merchantId}|${this.secretKey}`;
    return Buffer.from(hashString).toString('base64');
  }

  private generateWebhookHash(payload: any): string {
    const hashString = `${payload.merchant_id}|${payload.transaction_id}|${payload.status}|${this.secretKey}`;
    return Buffer.from(hashString).toString('base64');
  }
}
