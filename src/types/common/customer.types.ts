/**
 * Common Customer Types
 * Simplified to match actual merchant service data flow
 */

// Risk Profile - matches merchant service response exactly
export interface RiskProfile {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  isBlacklisted: boolean;
  lastRiskCheck?: Date;
  riskFactors?: string[];
}

// Customer data returned by customer-resolution service
export interface CustomerResolutionData {
  customerId: string;
  email: string;
  phone?: string;
  name?: string;
  merchantId: string;
  createdAt: Date;
  totalTransactionAmount: number;
  totalTransactionCount: number;
  riskProfile?: RiskProfile;
  isNewCustomer?: boolean;
  lastTransactionAt?: Date;
}

// Customer profile used by fraud analysis (enhanced with transaction history)
export interface FraudAnalysisCustomerProfile {
  // Basic customer info
  customerId: string;
  merchantId: string;
  email?: string;
  phone?: string;
  name?: string;
  createdAt: Date;
  lastTransactionAt?: Date;
  isNewCustomer?: boolean;
  
  // Transaction statistics (calculated by fraud service)
  previousTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  totalTransactionAmount: number;
  totalTransactionCount: number;
  averageAmount: number;
  
  // Risk information (from merchant service)
  riskProfile: RiskProfile;
  
  // Additional fraud-specific data
  deviceFingerprint?: string;
  ipAddress?: string;
  location?: string | {
    country: string;
    region: string;
    city: string;
    coordinates?: [number, number];
  };
}

// Payment customer details (minimal info for payment processing)
export interface PaymentCustomerDetails {
  customerId?: string;
  email: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  country?: string;
}