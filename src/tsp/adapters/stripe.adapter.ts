import axios, { AxiosInstance } from 'axios';
import { TSPAdapter, TSPResponse, PaymentRequest } from '@/types/tsp';
import { TSPConfiguration } from '@/entities/tsp-configuration.entity';
import { LoggerService } from '@/common/services/logger.service';

export class StripeAdapter implements TSPAdapter {
  private client: AxiosInstance;
  private secretKey: string;
  private publishableKey: string;

  constructor(
    private config: TSPConfiguration,
    private logger: LoggerService,
  ) {
    this.secretKey = config.credentials['secret_key'] as string;
    this.publishableKey = config.credentials['publishable_key'] as string;
    
    const baseURL = config.environment === 'production' 
      ? 'https://api.stripe.com'
      : 'https://api.stripe.com'; // Stripe uses same URL but different keys

    this.client = axios.create({
      baseURL,
      headers: {
        'Authorization': `Bearer ${this.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': '2023-10-16',
        'User-Agent': 'Valorapays-PaymentEngine/1.0',
      },
      timeout: 30000,
    });
  }

  async createPayment(request: PaymentRequest): Promise<TSPResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Creating Stripe payment intent for amount: ${request.amount} ${request.currency}`);
      
      const stripeRequest = new URLSearchParams({
        amount: (request.amount * 100).toString(), // Convert to cents
        currency: (request.currency || 'inr').toLowerCase(),
        'metadata[merchant_id]': request.merchantId?.toString() || '',
        'metadata[customer_id]': request.customerId?.toString() || '',
        'metadata[request_id]': request.requestId || '',
        description: request.description || 'Payment',
      });

      // Add customer details if provided
      if (request.customerDetails?.email) {
        stripeRequest.append('receipt_email', request.customerDetails.email);
      }

      // Add payment method types
      stripeRequest.append('payment_method_types[]', 'card');

      const response = await this.client.post('/v1/payment_intents', stripeRequest);
      
      const responseTime = Date.now() - startTime;
      const paymentIntent = response.data;
      
      this.logger.log(`Stripe payment intent created successfully: ${paymentIntent.id} (${responseTime}ms)`);

      return {
        success: true,
        transactionId: paymentIntent.id,
        providerTransactionId: paymentIntent.id,
        status: 'created',
        amount: paymentIntent.amount / 100, // Convert back to dollars/rupees
        currency: paymentIntent.currency.toUpperCase(),
        responseTime,
        providerResponse: paymentIntent,
        message: 'Payment intent created successfully',
        clientSecret: paymentIntent.client_secret,
      };

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      this.logger.error(`Stripe payment intent creation failed (${responseTime}ms):`, error);

      return {
        success: false,
        transactionId: null,
        providerTransactionId: null,
        status: 'failed',
        amount: request.amount,
        currency: request.currency || 'INR',
        responseTime,
        error: error.response?.data?.error?.message || error.message,
        providerResponse: error.response?.data,
        message: 'Payment intent creation failed',
      };
    }
  }

  async verifyPayment(paymentIntentId: string): Promise<TSPResponse> {
    // For Stripe, verification is typically done via webhooks
    // This method serves as a status check
    return this.getPaymentStatus(paymentIntentId);
  }

  async getPaymentStatus(transactionId: string): Promise<TSPResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Getting Stripe payment status: ${transactionId}`);
      
      const response = await this.client.get(`/v1/payment_intents/${transactionId}`);
      
      const responseTime = Date.now() - startTime;
      const paymentIntent = response.data;
      
      let status = 'pending';
      let success = false;
      
      switch (paymentIntent.status) {
        case 'succeeded':
          status = 'completed';
          success = true;
          break;
        case 'canceled':
          status = 'cancelled';
          break;
        case 'requires_action':
          status = 'requires_action';
          break;
        case 'requires_payment_method':
          status = 'requires_payment_method';
          break;
        case 'processing':
          status = 'processing';
          break;
        default:
          status = 'pending';
      }

      this.logger.log(`Stripe payment status retrieved: ${transactionId} -> ${status} (${responseTime}ms)`);

      return {
        success,
        transactionId,
        providerTransactionId: transactionId,
        status,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency.toUpperCase(),
        responseTime,
        providerResponse: paymentIntent,
        message: `Payment status: ${status}`,
        clientSecret: paymentIntent.client_secret,
        nextAction: paymentIntent.next_action,
      };

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      this.logger.error(`Stripe status check failed (${responseTime}ms):`, error);

      return {
        success: false,
        transactionId,
        providerTransactionId: transactionId,
        status: 'failed',
        amount: 0,
        currency: 'INR',
        responseTime,
        error: error.response?.data?.error?.message || error.message,
        providerResponse: error.response?.data,
        message: 'Status check failed',
      };
    }
  }

  async refundPayment(paymentIntentId: string, amount?: number): Promise<TSPResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Processing Stripe refund: ${paymentIntentId}, amount: ${amount}`);
      
      // First, get the charge ID from payment intent
      const paymentIntent = await this.client.get(`/v1/payment_intents/${paymentIntentId}`);
      const charges = paymentIntent.data.charges?.data;
      
      if (!charges || charges.length === 0) {
        throw new Error('No charges found for payment intent');
      }
      
      const chargeId = charges[0].id;
      
      const refundRequest = new URLSearchParams({
        charge: chargeId,
      });
      
      if (amount) {
        refundRequest.append('amount', (amount * 100).toString()); // Convert to cents
      }

      const response = await this.client.post('/v1/refunds', refundRequest);
      
      const responseTime = Date.now() - startTime;
      const refund = response.data;
      
      this.logger.log(`Stripe refund processed: ${refund.id} (${responseTime}ms)`);

      return {
        success: true,
        transactionId: refund.id,
        providerTransactionId: refund.id,
        status: 'refunded',
        amount: refund.amount / 100,
        currency: refund.currency.toUpperCase(),
        responseTime,
        providerResponse: refund,
        message: 'Refund processed successfully',
      };

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      this.logger.error(`Stripe refund failed (${responseTime}ms):`, error);

      return {
        success: false,
        transactionId: paymentIntentId,
        providerTransactionId: paymentIntentId,
        status: 'failed',
        amount: amount || 0,
        currency: 'INR',
        responseTime,
        error: error.response?.data?.error?.message || error.message,
        providerResponse: error.response?.data,
        message: 'Refund failed',
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      this.logger.debug('Performing Stripe health check');
      
      const response = await this.client.get('/v1/account');
      
      this.logger.debug('Stripe health check successful');
      return response.status === 200;
      
    } catch (error) {
      this.logger.warn('Stripe health check failed:', error);
      return false;
    }
  }

  getProviderName(): string {
    return 'stripe';
  }

  getEnvironment(): string {
    return this.config.environment;
  }

  verifyWebhookSignature(payload: string, signature: string, secret?: string): boolean {
    try {
      // Note: For production, use stripe library for proper verification
      const crypto = require('crypto');
      const webhookSecret = secret || this.config.credentials['webhook_secret'] || '';
      
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(`sha256=${expectedSignature}`)
      );
    } catch (error) {
      this.logger.error('Stripe webhook signature verification failed:', error);
      return false;
    }
  }
}
