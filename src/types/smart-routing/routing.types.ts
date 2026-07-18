/**
 * Smart Routing Types
 * Centralized type definitions for smart routing system
 */

// Routing context for decision making with enhanced customer intelligence
export interface RoutingContext {
  merchantId: string;
  customerId?: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  bankCode?: string;
  customerLocation?: string;
  environment?: string;
  merchantIndustry?: string;
  merchantTier?: string;
  requestId?: string;
  timestamp?: Date;
  
  // Enhanced customer intelligence for smart routing
  customerIntelligence?: {
    ipAddress?: string;
    userAgent?: string;
    deviceFingerprint?: string;
    geolocation?: {
      country: string;
      state?: string;
      city?: string;
      timezone?: string;
      coordinates?: { lat: number; lng: number };
    };
    deviceInfo?: {
      platform: string;
      browser: string;
      isMobile: boolean;
      language: string;
      screenResolution?: string;
    };
    riskProfile?: {
      riskLevel: 'low' | 'medium' | 'high' | 'critical';
      riskScore: number;
      riskFactors: string[];
      isBlacklisted: boolean;
    };
    transactionHistory?: {
      totalTransactions: number;
      lastTransactionAt?: Date;
      preferredPaymentMethods: string[];
      averageTransactionAmount: number;
    };
    isNewCustomer?: boolean;
  };
}

// Routing decision result
export interface RoutingDecision {
  selectedTSP: string;
  confidence: number;
  score: number;
  reasoning: string[];
  factors: Record<string, number>;
  alternatives: Array<{
    provider: string;
    score: number;
    reasoning: string[];
  }>;
  fallbackChain: string[];
  routingTime: number;
  timestamp: Date;
  analyticsData: any;
}

// TSP performance metrics
export interface TSPPerformance {
  provider: string;
  successRate: number;
  averageResponseTime: number;
  uptime: number;
  lastUpdated: Date;
  environment: string;
}

// Routing factors weights
export interface RoutingFactors {
  performanceWeight: number;
  costWeight: number;
  geographicWeight: number;
  temporalWeight: number;
  customerWeight: number;
  bankWeight: number;
  environmentWeight: number;
}

// Routing configuration
export interface RoutingConfiguration {
  isSmartRoutingEnabled: boolean;
  fallbackProvider?: string;
  forcedProvider?: string;
  factors: RoutingFactors;
  blacklistedProviders: string[];
  environmentSpecific: boolean;
}
