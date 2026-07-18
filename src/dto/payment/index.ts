// Central export file for payment DTOs

export * from './create-payment-intent.dto';
export * from './process-payment.dto';
export * from './update-payment-status.dto';
export * from './payment-responses.dto';

// Re-export all DTOs  
export * from '../common';
export * from '../transaction';
export * from '../routing';  
export * from '../performance';
export * from '../tsp';
export * from '../health';

// Remove circular import

// Export interfaces for external use
export interface PaymentIntentResponse {
  intentId: string;
  merchantId: string;
  amount: number;
  currency: string;
  status: string;
  selectedTSP: string;
  routingDecision: any;
  expiresAt: Date;
  estimatedCompletionTime?: number;
  processingFee: number;
  createdAt: Date;
  metadata?: Record<string, any>;
}

export interface PaymentResult {
  intentId: string;
  externalTransactionId?: string;
  status: string;
  amount: number;
  currency: string;
  processingTimeMs: number;
  tspProvider: string;
  tspResponse?: Record<string, any>;
  failureReason?: string;
  completedAt?: Date;
}
