/**
 * Merchant Webhook Types
 * Centralized type definitions for merchant webhook delivery system
 */

// Merchant webhook event types
export type MerchantWebhookEventType = 
  | 'payment.success' 
  | 'payment.failed' 
  | 'payment.pending' 
  | 'payment.refunded';

// Merchant webhook payload structure
export interface MerchantWebhookPayload {
  event: MerchantWebhookEventType;
  intentId: string;
  transactionId: string;
  merchantId: string;
  amount: number;
  currency: string;
  status: string;
  responseCode: string;
  customerMessage: string;
  merchantMessage: string;
  tspProvider: string;
  timestamp: string;
  metadata: Record<string, any>;
}

// Merchant webhook configuration from Merchant Service
export interface MerchantWebhookConfig {
  success: boolean;
  webhookUrl: string;
  webhookSecret: string;
  isActive: boolean;
  retryAttempts: number;
  timeoutMs: number;
}

// Webhook delivery options
export interface WebhookDeliveryOptions {
  url: string;
  payload: MerchantWebhookPayload;
  signature: string;
  maxRetries: number;
  timeoutMs: number;
  requestId: string;
}

// Webhook delivery result
export interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  responseTime?: number;
  attemptCount: number;
  errorMessage?: string;
}
