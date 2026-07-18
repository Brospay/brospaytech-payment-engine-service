/**
 * Fraud Management Types
 * Centralized type definitions for fraud detection system
 */

import { FraudAnalysisCustomerProfile } from '../common/customer.types';

// Fraud analysis result
export interface FraudAnalysisResult {
  riskScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  fraudFlags: string[];
  recommendation: 'approve' | 'review' | 'decline';
  reasons: string[];
  confidence?: number;
  analysisTime?: number;
  rulesTriggered?: string[];
}

// Customer profile for fraud analysis - uses common interface with backward compatibility
export interface CustomerProfile extends FraudAnalysisCustomerProfile {
  // Backward compatibility fields (mapped from riskProfile)
  totalAmount: number; // Maps to totalTransactionAmount
  fraudFlags: string[]; // Maps to riskProfile.riskFactors
}

// Fraud check request
export interface FraudCheckRequest {
  transactionId: string;
  merchantId: number;
  customerId: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  customerEmail?: string;
  customerPhone?: string;
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
  billingAddress?: any;
  shippingAddress?: any;
  metadata?: Record<string, any>;
  requestId: string;
}

// Fraud check response
export interface FraudCheckResponse {
  transactionId: string;
  approved: boolean;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  fraudFlags: string[];
  recommendation: 'approve' | 'review' | 'decline';
  reasons: string[];
  requiresManualReview: boolean;
  additionalVerification?: string[];
}

// Fraud rules configuration
export interface FraudRule {
  ruleId: string;
  name: string;
  description: string;
  isActive: boolean;
  priority: number;
  conditions: Record<string, any>;
  action: 'flag' | 'decline' | 'review';
  scoreImpact: number;
}

// Velocity check parameters
export interface VelocityCheck {
  timeWindow: number; // minutes
  maxTransactions: number;
  maxAmount: number;
  checkType: 'customer' | 'ip' | 'device' | 'merchant';
}
