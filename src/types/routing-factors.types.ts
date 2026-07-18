/**
 * Routing Factors Service Types  
 */

export interface RoutingFactorsData {
  performance: PerformanceFactors;
  availability: AvailabilityFactors;
  cost: CostFactors;
  compliance: ComplianceFactors;
  regional: RegionalFactors;
  technical: TechnicalFactors;
  business: BusinessFactors;
  risk: RiskFactors;
}

export interface PerformanceFactors {
  responseTime: Record<string, number>;
  successRate: Record<string, number>;
  throughput: Record<string, number>;
  reliability: Record<string, number>;
}

export interface AvailabilityFactors {
  uptime: Record<string, number>;
  maintenanceWindows: Record<string, string[]>;
  circuitBreakerStatus: Record<string, boolean>;
  healthChecks: Record<string, HealthCheckResult>;
}

export interface HealthCheckResult {
  isHealthy: boolean;
  responseTime: number;
  lastCheck: Date;
  consecutiveFailures: number;
}

export interface CostFactors {
  transactionFees: Record<string, number>;
  volumeDiscounts: Record<string, VolumeDiscount[]>;
  setupCosts: Record<string, number>;
  maintenanceCosts: Record<string, number>;
}

export interface VolumeDiscount {
  minVolume: number;
  maxVolume?: number;
  discountPercentage: number;
}

export interface ComplianceFactors {
  pciCompliance: Record<string, boolean>;
  regulatoryApproval: Record<string, string[]>;
  dataResidency: Record<string, string>;
  certifications: Record<string, string[]>;
}

export interface RegionalFactors {
  supportedRegions: Record<string, string[]>;
  localPreferences: Record<string, string>;
  regulatoryRestrictions: Record<string, string[]>;
  bankNetworkSupport: Record<string, string[]>;
}

export interface TechnicalFactors {
  apiVersion: Record<string, string>;
  sdkAvailability: Record<string, boolean>;
  webhookReliability: Record<string, number>;
  supportedFeatures: Record<string, string[]>;
}

export interface BusinessFactors {
  partnershipLevel: Record<string, 'basic' | 'preferred' | 'strategic'>;
  supportQuality: Record<string, number>;
  innovationScore: Record<string, number>;
  marketShare: Record<string, number>;
}

export interface RiskFactors {
  fraudProtection: Record<string, number>;
  chargebackRates: Record<string, number>;
  securityScore: Record<string, number>;
  incidentHistory: Record<string, IncidentRecord[]>;
}

export interface IncidentRecord {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  date: Date;
  duration: number;
  impact: string;
}

export interface RoutingAnalysisRequest {
  context: RoutingAnalysisContext;
  requestId: string;
  timeRange?: string;
}

export interface RoutingAnalysisContext {
  merchantId: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  region?: string;
  riskLevel: string;
  priority?: 'speed' | 'cost' | 'reliability';
}

export interface RoutingAnalysisResult {
  factors: RoutingFactorsData;
  recommendations: TSPRecommendation[];
  analysisMetadata: {
    analysisTime: number;
    dataFreshness: Date;
    confidence: number;
    requestId: string;
  };
}

export interface TSPRecommendation {
  provider: string;
  score: number;
  ranking: number;
  strengths: string[];
  weaknesses: string[];
  reasoning: string[];
}




