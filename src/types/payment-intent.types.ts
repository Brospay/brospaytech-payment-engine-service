/**
 * Payment Intent Service Types - Aligned with existing DTOs
 */

import { Currency } from './common';
import { FraudAnalysisResult } from './fraud/fraud.types';
import { RoutingDecision } from './smart-routing/routing.types';

// Create Payment Intent Types
export interface CreatePaymentIntentRequest {
  merchantId: string;
  customerId?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerFirstName?: string;
  customerLastName?: string;
  customerCountry?: string;
  amount: number;
  currency: Currency;
  description?: string;
  paymentMethod: string;
  customerBank?: string;
  returnUrl?: string;
  metadata?: Record<string, any>;
  requestId: string;
  // environment: string;
}

export interface CreatePaymentIntentResponse {
  intentId: string;
  merchantId: string;
  customerId?: string;
  amount: number;
  currency: Currency;
  status: string;
  description?: string;
  expiresAt: Date;
  estimatedCompletionTime?: number;
  processingFee: number;
  createdAt: Date;
  metadata?: Record<string, any>;
  paymentPageUrl?: string;
  selectedTSP?: string;
  requiresCardDetails?: boolean;
}

// Process Payment Types
export interface ProcessPaymentRequest {
  intentId: string;
  merchantId: string;
  paymentMethodDetails: PaymentMethodDetails;
  customerDetails?: CustomerDetails;
  deviceInfo?: DeviceInfo;
  metadata?: Record<string, any>;
  requestId: string;
}

export interface PaymentMethodDetails {
  type: string;
  card?: {
    number: string;
    expMonth: number;
    expYear: number;
    cvc: string;
    holderName?: string;
  };
  netbanking?: {
    bankCode: string;
  };
  upi?: {
    vpa: string;
  };
  wallet?: {
    provider: string;
    phoneNumber?: string;
  };
}

export interface CustomerDetails {
  customerId?: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
}

export interface DeviceInfo {
  ipAddress?: string;
  userAgent?: string;
  fingerprint?: string;
  language?: string;
  timezone?: string;
  screenResolution?: string;
  platform?: string;
}

// Process Payment Response - Aligned with PaymentResultResponseDto
export interface ProcessPaymentResponse {
  intentId: string;
  externalTransactionId?: string;
  status: string;
  amount: number;
  currency: Currency;
  processingTimeMs: number;
  tspProvider: string;
  tspResponse?: {
    transactionId?: string;
    gatewayTransactionId?: string;
    bankTransactionId?: string;
    paymentUrl?: string;
    qrCode?: string;
  };
  failureReason?: string;
  completedAt?: Date;
  redirectUrl?: string;
  nextSteps?: {
    action: 'redirect' | 'poll' | 'wait' | 'none';
    url?: string;
    pollInterval?: number;
    expiresAt?: Date;
    instructions?: string;
  };
}

// Internal Service Response (includes ResponseCodeManager data) - for service layer only
export interface ProcessPaymentInternalResponse extends ProcessPaymentResponse {
  transactionId: string;
  responseCode: string;
  message: string;
  merchantMessage: string;
  isSuccessful: boolean;
  requiresFollowup: boolean;
  transactionCategory: TransactionCategoryInfo;
  settlement: SettlementInfo;
  retry: RetryInfo;
  parallelProcessingResult: ParallelProcessingResult;
  fraudAnalysis: FraudAnalysisResult;
  routingDecision: RoutingDecision;
  httpStatusCode: number;
  error?: {
    code: string;
    type: string;
    category: string;
    details?: string;
  };
}

export interface TransactionCategoryInfo {
  isSuccessful: boolean;
  isFailed: boolean;
  isPending: boolean;
  requiresCustomerAction: boolean;
  canRetry: boolean;
  category: string;
  type: string;
}

export interface SettlementInfo {
  isEligible: boolean;
  amount: number;
  type: 'credit' | 'debit' | 'none';
  reason: string;
}

export interface RetryInfo {
  canRetry: boolean;
  maxRetries: number;
  retryDelaySeconds: number;
  reason?: string;
}

export interface ParallelProcessingResult {
  provider: string;
  ranking: number;
  confidence: number;
  responseTime: number;
}

export interface GetPaymentStatusResponse {
  intentId: string;
  status: string;
  amount: number;
  currency: Currency;
  transactionId?: string;
  externalTransactionId?: string;
  tspProvider: string;
  createdAt: Date;
  completedAt?: Date;
  failureReason?: string;
  events?: Array<{
    event: string;
    timestamp: Date;
    description?: string;
  }>;
  metadata?: Record<string, any>;
}

export interface PaymentTransactionSummary {
  transactionId: string;
  status: string;
  responseCode: string;
  tspProvider: string;
  amount: number;
  currency: Currency;
  createdAt: Date;
  responseTime?: number;
}

// Utility Types
export interface ExpirationCheckResult {
  isExpired: boolean;
  expiredMinutes: number;
  remainingMs: number;
}

export interface CleanupResult {
  processedCount: number;
  abandonedCount: number;
  errors: Array<{
    intentId: string;
    error: string;
  }>;
}

export interface TSPSelectionContext {
  riskLevel: string;
  amount: number;
  currency: Currency;
  paymentMethod: string;
  bankCode?: string;
}
