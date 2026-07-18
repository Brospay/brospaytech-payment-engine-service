// Common types and enums for Payment Engine Service
// Shared across all modules for consistency

// Export common customer types for consistent usage across services
export * from './common/customer.types';

export interface BaseResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  requestId: string;
  timestamp: Date;
  message?: string;
}

// Payment-related enums
export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing', 
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

export enum PaymentMethod {
  UPI = 'upi',
  CREDIT_CARD = 'credit_card',
  DEBIT_CARD = 'debit_card',
  NET_BANKING = 'net_banking',
  WALLET = 'wallet',
  EMI = 'emi',
  BNPL = 'bnpl',
}

export enum Currency {
  INR = 'INR',
  USD = 'USD',
  EUR = 'EUR',
  GBP = 'GBP',
  AUD = 'AUD',
  CAD = 'CAD',
  SGD = 'SGD',
  JPY = 'JPY',
  CNY = 'CNY',
  AED = 'AED',
  SAR = 'SAR',
  MYR = 'MYR',
  THB = 'THB',
  IDR = 'IDR',
  PHP = 'PHP',
  NGN = 'NGN',
  GHS = 'GHS',
  TZS = 'TZS',
  UGX = 'UGX',
  KES = 'KES',
  XAF = 'XAF',
  ZAR = 'ZAR',
  
  // Cryptocurrencies
  BTC = 'BTC',
  ETH = 'ETH',
  USDT = 'USDT',
  USDC = 'USDC',
  BNB = 'BNB',
  XRP = 'XRP',
  SOL = 'SOL',
  DOGE = 'DOGE',
  ADA = 'ADA',
  TRX = 'TRX',
}

// TSP-related enums
export enum TSPProvider {
  PAYTARA = 'paytara',
  RAZORPAY = 'razorpay', 
  STRIPE = 'stripe',
  CASHFREE = 'cashfree',
  PHONEPE = 'phonepe',
  PAYU = 'payu',
  KINGDOM_BANK = 'kingdom-bank',
  SULIFU_PAY = 'sulifu-pay',
  PAYAZA = 'payaza',
}

export enum Environment {
  PRODUCTION = 'production',
  SANDBOX = 'sandbox',
  DEVELOPMENT = 'development',
}

export enum TSPHealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown',
}

// Smart Routing enums
export enum RoutingStrategy {
  SMART_ROUTING = 'smart_routing',
  ROUND_ROBIN = 'round_robin',
  WEIGHTED = 'weighted',
  PERFORMANCE_BASED = 'performance_based',
  COST_OPTIMIZED = 'cost_optimized',
  MANUAL_OVERRIDE = 'manual_override',
}

export enum OverrideType {
  DISABLE_SMART_ROUTING = 'disable_smart_routing',
  FORCE_SINGLE_TSP = 'force_single_tsp',
  CUSTOM_TRAFFIC_SPLIT = 'custom_traffic_split',
  EMERGENCY_OVERRIDE = 'emergency_override',
  SCHEDULED_ROUTING = 'scheduled_routing',
  MERCHANT_SPECIFIC = 'merchant_specific',
  GRADUAL_MIGRATION = 'gradual_migration',
}

// Performance and monitoring enums
export enum MeasurementWindow {
  ONE_MINUTE = '1min',
  FIVE_MINUTES = '5min',
  FIFTEEN_MINUTES = '15min',
  ONE_HOUR = '1hour',
  FOUR_HOURS = '4hour',
  ONE_DAY = '1day',
}

export enum BankHealthStatus {
  EXCELLENT = 'excellent',
  GOOD = 'good',
  AVERAGE = 'average',
  POOR = 'poor',
  CRITICAL = 'critical',
}

// Common interfaces
export interface TSPCredentials {
  [key: string]: string; // Dynamic key-value structure
}

// RoutingDecision moved to smart-routing/routing.types.ts

export interface PaymentContext {
  merchantId: string;
  customerId?: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  customerBank?: string;
  customerLocation?: {
    country: string;
    state?: string;
    city?: string;
  };
  userAgent?: string;
  ipAddress?: string;
  requestId: string;
  environment: Environment;
  timestamp: Date;
}

// TSPHealthCheckResult moved to tsp.ts

// TSPHealthStatus is already defined above, no need to re-export

export interface BankRecommendation {
  bankCode: string;
  bankName: string;
  recommendationLevel: 'recommended' | 'caution' | 'avoid';
  reason: string;
  alternativeBanks: string[];
  performanceScore: number;
}

// Error codes
export enum PaymentErrorCode {
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  UNSUPPORTED_CURRENCY = 'UNSUPPORTED_CURRENCY',
  UNSUPPORTED_PAYMENT_METHOD = 'UNSUPPORTED_PAYMENT_METHOD',
  TSP_NOT_AVAILABLE = 'TSP_NOT_AVAILABLE',
  TSP_TIMEOUT = 'TSP_TIMEOUT',
  TSP_ERROR = 'TSP_ERROR',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  INVALID_PAYMENT_METHOD = 'INVALID_PAYMENT_METHOD',
  FRAUD_DETECTED = 'FRAUD_DETECTED',
  BANK_DECLINED = 'BANK_DECLINED',
  BANK_MAINTENANCE = 'BANK_MAINTENANCE',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
}

// Utility types for type safety
export type DatabaseShardId = number; // 0-9 for 10 shards
export type CacheKey = string;
export type MetricsWindow = '1min' | '5min' | '15min' | '1hour' | '1day';

// Performance thresholds for monitoring
export const PERFORMANCE_THRESHOLDS = {
  QUERY_TIME_WARNING: 10, // ms
  QUERY_TIME_ERROR: 50,   // ms
  SUCCESS_RATE_WARNING: 95, // %
  SUCCESS_RATE_ERROR: 90,   // %
  RESPONSE_TIME_WARNING: 3000, // ms
  RESPONSE_TIME_ERROR: 5000,   // ms
  CACHE_HIT_RATE_WARNING: 90,  // %
  CACHE_HIT_RATE_ERROR: 80,    // %
} as const;

// Smart routing factors weights
export const ROUTING_WEIGHTS = {
  PERFORMANCE: 0.25,      // 25% weight on historical performance
  AVAILABILITY: 0.20,     // 20% weight on current availability  
  COST: 0.15,            // 15% weight on processing costs
  LATENCY: 0.15,         // 15% weight on response latency
  BANK_COMPATIBILITY: 0.10, // 10% weight on bank-specific performance
  GEOGRAPHIC: 0.05,      // 5% weight on geographic optimization
  TIME_BASED: 0.05,      // 5% weight on time-based patterns
  CUSTOM: 0.05,          // 5% weight on custom business logic
} as const;
