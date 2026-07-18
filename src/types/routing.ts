// Smart routing types and interfaces
// Advanced routing decision engine data structures

import { 
  TSPProvider, 
  Environment, 
  RoutingStrategy, 
  OverrideType,
  PaymentContext 
} from './common';

// Smart Routing Engine types
export interface SmartRoutingRequest {
  paymentContext: PaymentContext;
  availableTSPs: string[];
  merchantPreferences?: MerchantRoutingPreferences;
  forceRefresh?: boolean; // Bypass cache for routing decision
  requestId: string;
}

export interface SmartRoutingResponse {
  decision: any;
  alternativeOptions: Array<{
    tsp: string;
    score: number;
    reasoning: string;
  }>;
  decisionTimeMs: number;
  cacheHit: boolean;
  analyticsData: {
    factorsConsidered: string[];
    performanceData: Record<string, any>;
    overridesApplied: string[];
  };
}

// Merchant routing preferences
export interface MerchantRoutingPreferences {
  merchantId: number;
  preferredTSPs: string[];
  bannedTSPs: string[];
  costOptimization: boolean;
  performanceOptimization: boolean;
  customRules?: Array<{
    condition: Record<string, any>;
    action: {
      type: 'prefer' | 'avoid' | 'force';
      targetTSP?: string;
      weight?: number;
    };
  }>;
  fallbackStrategy: 'best_performance' | 'lowest_cost' | 'highest_availability';
}

// Routing factor analysis
export interface RoutingFactors {
  // Historical Performance Analysis (25% weight)
  historicalPerformance: {
    tspSuccessRates: Record<string, number>;
    tspAverageLatencies: Record<string, number>;
    tspUptimePercentages: Record<string, number>;
    merchantSpecificHistory: Record<string, {
      successRate: number;
      averageLatency: number;
      totalTransactions: number;
      lastTransactionDate?: Date;
    }>;
    score: number; // 0-100
  };

  // Real-time Availability Analysis (20% weight)
  availabilityAnalysis: {
    tspHealthStatuses: Record<string, any>;
    recentErrorRates: Record<string, number>;
    circuitBreakerStates: Record<string, 'open' | 'closed' | 'half_open'>;
    maintenanceWindows: Record<string, {
      isInMaintenance: boolean;
      scheduledEnd?: Date;
    }>;
    score: number; // 0-100
  };

  // Cost Optimization Analysis (15% weight)
  costAnalysis: {
    tspProcessingFees: Record<string, {
      percentage: number;
      fixed: number;
      total: number;
    }>;
    volumeDiscounts: Record<string, number>;
    merchantNegotiatedRates: Record<string, number>;
    score: number; // 0-100 (lower cost = higher score)
  };

  // Latency Performance Analysis (15% weight)
  latencyAnalysis: {
    realtimeLatencies: Record<string, number>;
    p99Latencies: Record<string, number>;
    geographicLatencies: Record<string, Record<string, number>>;
    timeBasedLatencies: Record<string, {
      hourOfDay: Record<number, number>;
      dayOfWeek: Record<number, number>;
    }>;
    score: number; // 0-100
  };

  // Bank Compatibility Analysis (10% weight) 
  bankCompatibility: {
    bankPerformance: Record<string, Record<string, {
      successRate: number;
      averageLatency: number;
      isCurrentlyDown: boolean;
      lastIncident?: Date;
    }>>;
    bankRecommendations: Record<string, 'recommended' | 'caution' | 'avoid'>;
    score: number; // 0-100
  };

  // Geographic Optimization (5% weight)
  geographicFactors: {
    customerLocation?: {
      country: string;
      state?: string;
      city?: string;
    };
    tspGeographicPerformance: Record<string, Record<string, number>>;
    regionalPreferences: Record<string, string[]>;
    score: number; // 0-100
  };

  // Temporal Analysis (5% weight)
  temporalFactors: {
    currentHour: number;
    currentDay: number; // 0=Sunday
    isWeekend: boolean;
    isHoliday: boolean;
    peakHourPerformance: Record<string, Record<number, number>>;
    weekendPerformance: Record<string, number>;
    holidayPerformance: Record<string, number>;
    score: number; // 0-100
  };

  // Custom Business Logic (5% weight)
  customFactors: {
    merchantSpecificRules: Array<{
      condition: Record<string, any>;
      impact: number;
      targetTSP?: string;
    }>;
    industrySpecificRules: Array<{
      industry: string;
      rules: Record<string, any>;
    }>;
    customScoring: Record<string, number>;
    score: number; // 0-100
  };
}

// Routing rule configuration
export interface RoutingRuleConfig {
  ruleName: string;
  description: string;
  priority: number;
  conditions: {
    merchantIds?: number[];
    amountRange?: { min?: number; max?: number };
    paymentMethods?: string[];
    timeRanges?: Array<{
      startHour: number;
      endHour: number;
      days?: number[];
    }>;
    geographicRules?: {
      includeCountries?: string[];
      excludeCountries?: string[];
      includeStates?: string[];
      excludeStates?: string[];
    };
    performanceThresholds?: {
      minSuccessRate?: number;
      maxLatency?: number;
      minUptimePercentage?: number;
    };
    bankRules?: {
      includeBanks?: string[];
      excludeBanks?: string[];
      bankPerformanceThresholds?: Record<string, {
        minSuccessRate: number;
        maxLatency: number;
      }>;
    };
    customConditions?: Record<string, any>;
  };
  actions: {
    targetTSPs: string[];
    selectionStrategy: 'weighted' | 'round_robin' | 'performance' | 'cost';
    weights?: Record<string, number>;
    fallbackTSP?: string;
  };
  isActive: boolean;
  effectiveFrom?: Date;
  effectiveTo?: Date;
  createdBy: string;
}

// Override system types
export interface RoutingOverrideConfig {
  overrideType: OverrideType;
  overrideName: string;
  description: string;
  isActive: boolean;
  priority: number;
  merchantId?: string;
  targetMerchantIds?: string[];
  environment: Environment | 'all';
  overrideConfig: {
    // Force single TSP
    forcedTSP?: string;
    
    // Traffic distribution
    trafficSplit?: Record<string, number>;
    
    // Emergency override
    emergencyTSP?: string;
    reason?: string;
    
    // Scheduled routing
    scheduledRules?: Array<{
      startTime: string; // HH:MM format
      endTime: string;   // HH:MM format
      targetTSP: string;
      days?: number[];   // 0=Sunday
    }>;
    
    // Gradual migration
    migrationConfig?: {
      fromTSP: string;
      toTSP: string;
      currentPercentage: number;
      targetPercentage: number;
      stepSize: number;
      stepDurationHours: number;
    };
  };
  effectiveFrom?: Date;
  effectiveTo?: Date;
  createdBy: string;
  reason?: string;
  isEmergency: boolean;
  requiresApproval: boolean;
}

// Performance-based routing
export interface PerformanceBasedRouting {
  enabled: boolean;
  performanceWeights: {
    successRate: number;
    latency: number;
    uptime: number;
    errorRate: number;
    costEfficiency: number;
  };
  fallbackRules: {
    onTSPFailure: 'next_best' | 'predefined_order' | 'stop_processing';
    maxRetries: number;
    retryDelayMs: number;
  };
  adaptiveThresholds: {
    enableAdaptiveScoring: boolean;
    learningWindow: '1hour' | '4hour' | '1day' | '7day';
    adaptationRate: number; // 0-1
  };
}

// Route optimization analytics
export interface RouteOptimizationAnalytics {
  timeframe: {
    startDate: Date;
    endDate: Date;
  };
  routingDecisions: {
    total: number;
    smartRouting: number;
    manualOverride: number;
    fallback: number;
  };
  tspDistribution: Record<string, {
    percentage: number;
    transactions: number;
    volume: number;
    averageSuccessRate: number;
  }>;
  costSavings: {
    totalSaved: number;
    savingsPercentage: number;
    costOptimizedRoutes: number;
  };
  performanceImprovement: {
    averageLatencyReduction: number;
    successRateImprovement: number;
    downtimeAvoidance: number;
  };
  recommendations: Array<{
    type: 'rule_adjustment' | 'tsp_configuration' | 'override_review';
    priority: 'high' | 'medium' | 'low';
    description: string;
    estimatedImpact: {
      performanceGain?: number;
      costSavings?: number;
      riskReduction?: number;
    };
  }>;
}
