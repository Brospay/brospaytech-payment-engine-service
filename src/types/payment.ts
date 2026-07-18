// Payment-specific types and interfaces
// Core payment processing data structures

import { 
  PaymentStatus, 
  PaymentMethod, 
  Currency, 
  Environment, 
  PaymentContext 
} from './common';
import { RoutingDecision } from './smart-routing/routing.types';

// Payment Intent interfaces
export interface CreatePaymentIntentRequest {
  merchantId: string;
  customerId?: string;
  customerEmail: string;
  customerPhone?: string;
  amount: number;
  currency: Currency;
  description?: string;
  paymentMethod: PaymentMethod;
  customerBank?: string;
  returnUrl?: string;
  webhookUrl?: string;
  metadata?: Record<string, any>;
  requestId: string;
  environment: Environment;
}

export interface PaymentIntentResponse {
  intentId: string;
  merchantId: string;
  amount: number;
  currency: Currency;
  status: PaymentStatus;
  paymentUrl?: string;
  qrCode?: string;
  deepLink?: string;
  selectedTSP: string;
  routingDecision: RoutingDecision;
  expiresAt: Date;
  estimatedCompletionTime?: number; // seconds
  processingFee: number;
  createdAt: Date;
  metadata?: Record<string, any>;
}

export interface ProcessPaymentRequest {
  intentId: string;
  paymentMethodDetails: {
    type: PaymentMethod;
    cardNumber?: string;
    expiryMonth?: string;
    expiryYear?: string;
    cvv?: string;
    cardHolderName?: string;
    upiId?: string;
    bankCode?: string;
    accountNumber?: string;
    ifscCode?: string;
    walletProvider?: string;
    walletPhone?: string;
  };
  customerDetails: {
    name: string;
    email: string;
    phone?: string;
    address?: {
      street: string;
      city: string;
      state: string;
      country: string;
      postalCode: string;
    };
  };
  deviceInfo?: {
    userAgent: string;
    ipAddress: string;
    deviceId?: string;
    fingerprint?: string;
  };
  requestId: string;
}

export interface PaymentResult {
  intentId: string;
  externalTransactionId?: string;
  status: PaymentStatus;
  amount: number;
  currency: Currency;
  processingTimeMs: number;
  tspProvider: string;
  tspResponse?: Record<string, any>;
  failureReason?: string;
  fraudAssessment?: {
    riskScore: number;
    riskFactors: string[];
    recommendation: 'approve' | 'review' | 'decline';
  };
  completedAt?: Date;
  nextAction?: {
    action: 'redirect' | 'poll_status' | 'show_qr' | 'wait';
    url?: string;
    pollInterval?: number;
    data?: Record<string, any>;
  };
}

// Payout interfaces
export interface CreatePayoutRequest {
  merchantId: number;
  recipientAccount: {
    accountNumber: string;
    ifscCode: string;
    accountHolderName: string;
    bankName?: string;
  };
  amount: number;
  currency: Currency;
  purpose: string;
  description?: string;
  metadata?: Record<string, any>;
  requestId: string;
  environment: Environment;
}

export interface PayoutResponse {
  payoutId: string;
  merchantId: number;
  amount: number;
  currency: Currency;
  status: 'initiated' | 'processing' | 'completed' | 'failed' | 'cancelled';
  selectedTSP: string;
  estimatedCompletionTime?: number; // seconds
  processingFee: number;
  createdAt: Date;
  metadata?: Record<string, any>;
}

// Refund interfaces
export interface CreateRefundRequest {
  intentId: string;
  amount?: number; // Partial refund amount (null = full refund)
  reason: string;
  description?: string;
  metadata?: Record<string, any>;
  requestId: string;
}

export interface RefundResponse {
  refundId: string;
  intentId: string;
  amount: number;
  currency: Currency;
  status: 'initiated' | 'processing' | 'completed' | 'failed';
  selectedTSP: string;
  processingFee: number;
  estimatedCompletionTime?: number; // seconds
  createdAt: Date;
  metadata?: Record<string, any>;
}

// Webhook interfaces
export interface WebhookPayload {
  eventType: 'payment.success' | 'payment.failed' | 'payment.pending' | 'refund.completed' | 'payout.completed';
  intentId: string;
  merchantId: string;
  amount: number;
  currency: Currency;
  status: PaymentStatus;
  tspProvider: string;
  externalTransactionId?: string;
  timestamp: Date;
  signature: string;
  data: Record<string, any>;
}

// Payment analytics interfaces
export interface PaymentAnalytics {
  merchantId: string;
  timeRange: {
    startDate: Date;
    endDate: Date;
  };
  metrics: {
    totalTransactions: number;
    totalVolume: number;
    successRate: number;
    averageAmount: number;
    averageProcessingTime: number;
    topPaymentMethods: Array<{
      method: PaymentMethod;
      count: number;
      volume: number;
    }>;
    topBanks: Array<{
      bankCode: string;
      bankName: string;
      count: number;
      successRate: number;
    }>;
    tspBreakdown: Array<{
      provider: TSPProvider;
      count: number;
      successRate: number;
      averageLatency: number;
    }>;
  };
}

// Fraud detection types
export interface FraudAssessment {
  riskScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: string[];
  recommendation: 'approve' | 'review' | 'decline';
  assessment: {
    velocityCheck: boolean;
    blacklistCheck: boolean;
    deviceCheck: boolean;
    behaviorCheck: boolean;
    locationCheck: boolean;
    amountCheck: boolean;
  };
  confidence: number; // 0-100
  processingTimeMs: number;
}

// Bank performance types
export interface BankPerformanceData {
  bankCode: string;
  bankName: string;
  currentStatus: 'operational' | 'degraded' | 'down' | 'maintenance';
  performanceMetrics: {
    successRate: number;
    averageLatency: number;
    downtimeHours: number;
    lastIncident?: Date;
  };
  recommendation: {
    level: 'recommended' | 'caution' | 'avoid';
    message: string;
    alternativeBanks: string[];
  };
  tspSpecificData: Array<{
    tspProvider: string;
    successRate: number;
    averageLatency: number;
    lastUpdated: Date;
  }>;
}

// Import statements for proper typing
import { TSPProvider } from './common';

// Fix the circular import issue
export { PaymentStatus, Currency } from './common';
