export interface BaseEvent {
  eventId: string;
  eventType: string;
  timestamp: string;
  source: 'payment-engine';
  version: '1.0';
}

export interface TransactionEvent extends BaseEvent {
  eventType: 'transaction.created' | 'transaction.updated' | 'transaction.completed' | 'transaction.failed';
  transactionId: string;
  merchantId: string;
  customerId?: string;
  data: TransactionEventData;
}

export interface TransactionEventData {
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string;
  tspProvider: string;
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  customerIp?: string;
  customerCountry?: string;
  customerCity?: string;
  customerState?: string;
  userAgent?: string;
  processingTimeMs?: number;
  metadata?: Record<string, any>;
}

export interface PaymentStatusEvent extends BaseEvent {
  eventType: 'payment.processing' | 'payment.succeeded' | 'payment.failed' | 'payment.refunded' | 'payment.intent.cancelled';
  transactionId?: string;
  merchantId?: string;
  customerId?: string;
  data: PaymentStatusEventData;
  environment?: string;
}

export interface PaymentStatusEventData {
  intentId?: string;
  transactionId?: string;
  merchantId?: string;
  status: string;
  previousStatus?: string;
  reason?: string;
  errorCode?: string;
  errorMessage?: string;
  processingTimeMs?: number;
  amount?: number;
  currency?: string;
  paymentMethod?: string;
  paymentMode?: string;
  
  // TSP/Gateway details
  tspProvider?: string;
  tspTransactionId?: string;
  bankCode?: string;
  binNumber?: string;
  
  // Fee breakdown
  platformFee?: number;
  gatewayFee?: number;
  taxes?: number;
  
  // Customer details
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  customerId?: string;
  
  // Geographic data
  customerIp?: string;
  customerCountry?: string;
  customerCity?: string;
  customerState?: string;
  country?: string;
  
  // Device/Browser data
  userAgent?: string;
  deviceType?: string;
  
  // Risk & Fraud data
  riskScore?: number;
  fraudScore?: number;
  isHighRisk?: boolean;
  
  // International payment flag
  isInternational?: boolean;
  
  // Settlement data
  settlementId?: string;
  isSettled?: boolean;
  settledAt?: string;
  
  // Refund data
  refundId?: string;
  refundAmount?: number;
  isRefunded?: boolean;
  refundedAt?: string;
  
  // Webhook data
  webhookUrl?: string;
  webhookDelivered?: boolean;
  webhookAttempts?: number;
  successUrl?: string;
  cancelUrl?: string;
  
  // Full metadata
  metadata?: Record<string, any>;
}

export interface PayoutEvent extends BaseEvent {
  eventType: 'payout.created' | 'payout.processing' | 'payout.completed' | 'payout.failed';
  payoutId: string;
  merchantId: string;
  data: PayoutEventData;
}

export interface PayoutEventData {
  amount: number;
  currency: string;
  status: string;
  payoutType: string;
  tspProvider: string;
  beneficiaryAccount?: string;
  beneficiaryName?: string;
  beneficiaryIfsc?: string;
  beneficiarySwift?: string;
  beneficiaryIban?: string;
  beneficiaryBankName?: string;
  beneficiaryMobile?: string;
  beneficiaryVpa?: string;
  processingFee?: number;
  totalDebitedAmount?: number;
  country?: string;
  externalPayoutId?: string;
  failureReason?: string;
  processingTimeMs?: number;
  metadata?: Record<string, any>;
}

export interface RefundEvent extends BaseEvent {
  eventType: 'refund.created' | 'refund.approved' | 'refund.processing' | 'refund.completed' | 'refund.failed' | 'refund.rejected';
  refundId: string;
  transactionId: string;
  merchantId: string;
  data: RefundEventData;
}

export interface RefundEventData {
  amount: number;
  currency: string;
  status: string;
  refundType: string;
  reason: string;
  customerId?: string;
  externalRefundId?: string;
  failureReason?: string;
  processingTimeMs?: number;
  metadata?: Record<string, any>;
}

export type PaymentEngineEvent = TransactionEvent | PaymentStatusEvent | PayoutEvent | RefundEvent;
