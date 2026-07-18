import { Environment, Currency } from './common';

/**
 * TSP Response interface for all payment operations
 */
export interface TSPResponse {
  success: boolean;
  transactionId: string | null;
  providerTransactionId: string | null;
  status: string;
  amount: number;
  currency: string;
  responseTime: number;
  error?: string;
  providerResponse?: any;
  message: string;
  redirectUrl?: string;
  clientSecret?: string;
  nextAction?: any;
}

/**
 * TSP Configuration for dynamic provider setup
 */
export interface TSPConfig {
  provider: string;
  environment: Environment;
  credentials: Record<string, any>;
  isActive: boolean;
  endpoints?: Record<string, string>;
}

/**
 * Standard TSP Adapter Interface
 * All TSP providers (Razorpay, Paytara, Stripe) implement this
 */
export interface TSPAdapter {
  // Core payment methods
  createPayment(request: any): Promise<TSPResponse>;
  verifyPayment(transactionId: string, signature?: string, orderId?: string): Promise<TSPResponse>;
  getPaymentStatus(transactionId: string): Promise<TSPResponse>;
  
  // Refund methods
  refundPayment(transactionId: string, amount?: number): Promise<TSPResponse>;
  
  // Payout methods
  createPayout?(payoutData: any): Promise<TSPResponse>;
  checkPayoutStatus?(payoutId: string): Promise<TSPResponse>;
  
  // Sandbox testing methods
  simulatePaymentStatus?(transactionId: string, action: 'PROCESS' | 'DECLINE'): Promise<{ success: boolean; message: string }>;
  
  // Health and metadata
  healthCheck(): Promise<boolean>;
  getProviderName(): string;
  getEnvironment(): string;
  
  // Webhook verification
  verifyWebhookSignature?(payload: string | any, signature: string, secret?: string): boolean;
}

/**
 * Payment request structure for TSP adapters
 */
export interface PaymentRequest {
  merchantId: string;
  customerId?: string;
  amount: number;
  currency: string;
  description?: string;
  customerDetails?: {
    name?: string;
    email?: string;
    phone?: string;
    country?: string;
  };
  paymentMethodDetails?: any;
  returnUrl?: string;
  cancelUrl?: string;
  webhookUrl?: string;
  requestId: string;
  metadata?: Record<string, any>;
}

/**
 * TSP Health Check Result
 */
export interface TSPHealthCheckResult {
  provider: string;
  isHealthy: boolean;
  responseTime: number;
  lastChecked: Date;
  error?: string;
}