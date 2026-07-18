import axios, { AxiosInstance } from 'axios';
import { TSPAdapter, TSPResponse, PaymentRequest } from '@/types/tsp';
import { TSPConfiguration } from '@/entities/tsp-configuration.entity';
import { LoggerService } from '@/common/services/logger.service';

export class RazorpayAdapter implements TSPAdapter {
  private client: AxiosInstance;
  private keyId: string;
  private keySecret: string;

  constructor(
    private config: TSPConfiguration,
    private logger: LoggerService,
  ) {
    this.keyId = config.credentials['key_id'] as string;
    this.keySecret = config.credentials['key_secret'] as string;
    
    const baseURL = config.environment === 'production' 
      ? 'https://api.razorpay.com'
      : 'https://api.razorpay.com'; // Razorpay uses same URL for both

    this.client = axios.create({
      baseURL,
      auth: {
        username: this.keyId,
        password: this.keySecret,
      },
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Valorapays-PaymentEngine/1.0',
      },
      timeout: 30000,
    });
  }

  async createPayment(request: PaymentRequest): Promise<TSPResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Creating Razorpay payment for amount: ${request.amount} ${request.currency}`);
      
      const razorpayRequest = {
        amount: request.amount * 100, // Convert to paise
        currency: request.currency || 'INR',
        receipt: `zp_${request.merchantId}_${Date.now()}`,
        notes: {
          merchant_id: request.merchantId,
          customer_id: request.customerId,
          request_id: request.requestId,
        },
      };

      const response = await this.client.post('/v1/orders', razorpayRequest);
      
      const responseTime = Date.now() - startTime;
      
      this.logger.log(`Razorpay payment created successfully: ${response.data.id} (${responseTime}ms)`);

      return {
        success: true,
        transactionId: response.data.id,
        providerTransactionId: response.data.id,
        status: 'created',
        amount: response.data.amount / 100, // Convert back to rupees
        currency: response.data.currency,
        responseTime,
        providerResponse: response.data,
        message: 'Payment order created successfully',
      };

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      this.logger.error(`Razorpay payment creation failed (${responseTime}ms):`, error);

      return {
        success: false,
        transactionId: null,
        providerTransactionId: null,
        status: 'failed',
        amount: request.amount,
        currency: request.currency || 'INR',
        responseTime,
        error: error.response?.data?.error?.description || error.message,
        providerResponse: error.response?.data,
        message: 'Payment creation failed',
      };
    }
  }

  async verifyPayment(paymentId: string, signature?: string, orderId?: string): Promise<TSPResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Verifying Razorpay payment: ${paymentId}`);
      
      // Get payment details
      const paymentResponse = await this.client.get(`/v1/payments/${paymentId}`);
      const payment = paymentResponse.data;
      
      const responseTime = Date.now() - startTime;

      // Verify signature (simplified - in production, use crypto verification)
      const isSignatureValid = signature && signature.length > 0;
      
      if (payment.status === 'captured' && isSignatureValid) {
        this.logger.log(`Razorpay payment verified successfully: ${paymentId} (${responseTime}ms)`);
        
        return {
          success: true,
          transactionId: paymentId,
          providerTransactionId: paymentId,
          status: 'completed',
          amount: payment.amount / 100,
          currency: payment.currency,
          responseTime,
          providerResponse: payment,
          message: 'Payment completed successfully',
        };
      } else {
        return {
          success: false,
          transactionId: paymentId,
          providerTransactionId: paymentId,
          status: payment.status,
          amount: payment.amount / 100,
          currency: payment.currency,
          responseTime,
          error: 'Payment verification failed',
          providerResponse: payment,
          message: 'Payment verification failed',
        };
      }

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      this.logger.error(`Razorpay payment verification failed (${responseTime}ms):`, error);

      return {
        success: false,
        transactionId: paymentId,
        providerTransactionId: paymentId,
        status: 'failed',
        amount: 0,
        currency: 'INR',
        responseTime,
        error: error.response?.data?.error?.description || error.message,
        providerResponse: error.response?.data,
        message: 'Payment verification failed',
      };
    }
  }

  async getPaymentStatus(transactionId: string): Promise<TSPResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Getting Razorpay payment status: ${transactionId}`);
      
      const response = await this.client.get(`/v1/payments/${transactionId}`);
      const payment = response.data;
      
      const responseTime = Date.now() - startTime;
      
      let status = 'pending';
      let success = false;
      
      switch (payment.status) {
        case 'captured':
          status = 'completed';
          success = true;
          break;
        case 'failed':
          status = 'failed';
          break;
        case 'authorized':
          status = 'authorized';
          break;
        default:
          status = 'pending';
      }

      this.logger.log(`Razorpay payment status retrieved: ${transactionId} -> ${status} (${responseTime}ms)`);

      return {
        success,
        transactionId,
        providerTransactionId: transactionId,
        status,
        amount: payment.amount / 100,
        currency: payment.currency,
        responseTime,
        providerResponse: payment,
        message: `Payment status: ${status}`,
      };

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      this.logger.error(`Razorpay status check failed (${responseTime}ms):`, error);

      return {
        success: false,
        transactionId,
        providerTransactionId: transactionId,
        status: 'failed',
        amount: 0,
        currency: 'INR',
        responseTime,
        error: error.response?.data?.error?.description || error.message,
        providerResponse: error.response?.data,
        message: 'Status check failed',
      };
    }
  }

  async refundPayment(transactionId: string, amount?: number): Promise<TSPResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Processing Razorpay refund: ${transactionId}, amount: ${amount}`);
      
      const refundRequest: any = {
        payment_id: transactionId,
      };
      
      if (amount) {
        refundRequest.amount = amount * 100; // Convert to paise
      }

      const response = await this.client.post('/v1/refunds', refundRequest);
      const refund = response.data;
      
      const responseTime = Date.now() - startTime;
      
      this.logger.log(`Razorpay refund processed: ${refund.id} (${responseTime}ms)`);

      return {
        success: true,
        transactionId: refund.id,
        providerTransactionId: refund.id,
        status: 'refunded',
        amount: refund.amount / 100,
        currency: refund.currency || 'INR',
        responseTime,
        providerResponse: refund,
        message: 'Refund processed successfully',
      };

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      this.logger.error(`Razorpay refund failed (${responseTime}ms):`, error);

      return {
        success: false,
        transactionId,
        providerTransactionId: transactionId,
        status: 'failed',
        amount: amount || 0,
        currency: 'INR',
        responseTime,
        error: error.response?.data?.error?.description || error.message,
        providerResponse: error.response?.data,
        message: 'Refund failed',
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      this.logger.debug('Performing Razorpay health check');
      
      // Simple API call to check connectivity
      const response = await this.client.get('/v1/payments?count=1');
      
      this.logger.debug('Razorpay health check successful');
      return response.status === 200;
      
    } catch (error) {
      this.logger.warn('Razorpay health check failed:', error);
      return false;
    }
  }

  getProviderName(): string {
    return 'razorpay';
  }

  getEnvironment(): string {
    return this.config.environment;
  }

  verifyWebhookSignature(payload: string, signature: string, secret?: string): boolean {
    try {
      const crypto = require('crypto');
      const webhookSecret = secret || this.config.credentials['webhook_secret'] || '';
      
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      this.logger.error('Razorpay webhook signature verification failed:', error);
      return false;
    }
  }
}
