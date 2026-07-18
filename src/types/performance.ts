// Performance monitoring and analytics types
// Enterprise-grade performance tracking data structures

import { 
  TSPProvider, 
  Environment, 
  MeasurementWindow 
} from './common';

// Performance monitoring interfaces
export interface PerformanceMetrics {
  timestamp: Date;
  service: 'payment-engine';
  environment: Environment;
  
  // API Performance
  api: {
    totalRequests: number;
    averageResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    errorRate: number;
    throughputPerSecond: number;
    concurrentConnections: number;
  };

  // Database Performance  
  database: {
    queryCount: number;
    averageQueryTime: number;
    slowQueries: number; // > 10ms
    connectionPoolUtilization: number;
    cacheHitRate: number;
    deadlocks: number;
    replicationLag?: number;
  };

  // Cache Performance
  cache: {
    memoryUtilization: number;
    redisHitRate: number;
    redisLatency: number;
    totalCacheOperations: number;
    cacheEvictions: number;
    hotKeyAccess: Record<string, number>;
  };

  // TSP Performance
  tspPerformance: Record<string, {
    totalCalls: number;
    successRate: number;
    averageLatency: number;
    errorRate: number;
    timeoutRate: number;
    circuitBreakerState: 'open' | 'closed' | 'half_open';
  }>;

  // System Resources
  system: {
    cpuUtilization: number;
    memoryUtilization: number;
    heapUsage: number;
    eventLoopLatency: number;
    gcPauses: number;
    activeHandles: number;
  };
}

// Real-time performance dashboard data
export interface PerformanceDashboard {
  overview: {
    status: 'healthy' | 'degraded' | 'critical';
    totalTransactionsToday: number;
    totalVolumeToday: number;
    overallSuccessRate: number;
    averageProcessingTime: number;
    activeAlertsCount: number;
  };
  
  tspHealth: Array<{
    provider: TSPProvider;
    status: 'healthy' | 'degraded' | 'unhealthy';
    successRate: number;
    averageLatency: number;
    lastChecked: Date;
    issuesSince?: Date;
  }>;

  bankHealth: Array<{
    bankCode: string;
    bankName: string;
    status: 'operational' | 'degraded' | 'down';
    successRate: number;
    affectedTSPs?: string[];
    customerImpact: 'low' | 'medium' | 'high';
    recommendation: string;
  }>;

  performanceTrends: {
    last24Hours: {
      hourlySuccessRates: number[];
      hourlyLatencies: number[];
      hourlyVolumes: number[];
    };
    last7Days: {
      dailySuccessRates: number[];
      dailyLatencies: number[];
      dailyVolumes: number[];
    };
  };

  alerts: Array<{
    id: string;
    severity: 'info' | 'warning' | 'error' | 'critical';
    type: 'performance' | 'availability' | 'cost' | 'security';
    message: string;
    affectedComponent: string;
    startedAt: Date;
    estimatedResolution?: Date;
    actionItems?: string[];
  }>;
}

// Performance alerting
export interface PerformanceAlert {
  alertId: string;
  alertType: 'latency_spike' | 'success_rate_drop' | 'tsp_failure' | 'bank_issue' | 'resource_exhaustion';
  severity: 'info' | 'warning' | 'error' | 'critical';
  component: 'api' | 'database' | 'cache' | 'tsp' | 'routing' | 'system';
  metric: string;
  currentValue: number;
  threshold: number;
  duration: number; // minutes
  affectedServices: string[];
  affectedMerchants?: number[];
  message: string;
  recommendations: string[];
  correlationIds: string[];
  triggeredAt: Date;
  resolvedAt?: Date;
  autoResolved: boolean;
}

// Performance optimization recommendations
export interface OptimizationRecommendation {
  id: string;
  type: 'database' | 'cache' | 'routing' | 'tsp' | 'infrastructure';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  expectedImpact: {
    performanceGain?: number; // percentage improvement
    costSavings?: number;     // cost reduction
    riskReduction?: number;   // risk mitigation
  };
  implementation: {
    effort: 'low' | 'medium' | 'high';
    timeEstimate: string;
    prerequisites: string[];
    rollbackPlan: string;
  };
  metrics: {
    currentValue: number;
    targetValue: number;
    measurementMethod: string;
  };
  generatedAt: Date;
  status: 'pending' | 'approved' | 'rejected' | 'implemented';
}

// Load testing and capacity planning
export interface LoadTestConfiguration {
  testName: string;
  duration: number; // minutes
  targetTPS: number;
  rampUpDuration: number; // minutes
  scenarios: Array<{
    name: string;
    percentage: number; // % of total load
    paymentPattern: {
      amountRange: { min: number; max: number };
      currencies: string[];
      paymentMethods: string[];
      customerBanks?: string[];
    };
  }>;
  environments: Environment[];
  expectedBehavior: {
    maxResponseTime: number; // ms
    minSuccessRate: number;  // %
    maxErrorRate: number;    // %
  };
}

export interface LoadTestResult {
  testId: string;
  configuration: LoadTestConfiguration;
  executedAt: Date;
  duration: number; // actual duration in minutes
  
  results: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    maxResponseTime: number;
    throughputAchieved: number; // actual TPS
    errorRate: number;
    successRate: number;
  };

  tspBreakdown: Record<string, {
    requestCount: number;
    successRate: number;
    averageLatency: number;
    errorBreakdown: Record<string, number>;
  }>;

  performanceProfile: {
    cpuUtilization: number[];
    memoryUtilization: number[];
    databaseConnections: number[];
    cacheHitRates: number[];
    gcPauses: number[];
  };

  issues: Array<{
    severity: 'info' | 'warning' | 'error' | 'critical';
    component: string;
    description: string;
    occurrence: number;
    recommendation: string;
  }>;

  verdict: 'passed' | 'failed' | 'partial';
  recommendations: string[];
}

// Capacity planning
export interface CapacityPlan {
  currentCapacity: {
    maxTPS: number;
    maxConcurrentTransactions: number;
    maxDatabaseConnections: number;
    maxMemoryUsage: number;
  };
  
  projectedLoad: {
    timeframe: '1month' | '3month' | '6month' | '1year';
    expectedTPS: number;
    expectedConcurrentTransactions: number;
    expectedDatabaseLoad: number;
    growthRate: number; // percentage
  };

  scalingRecommendations: {
    infrastructureChanges: Array<{
      component: string;
      currentSpec: string;
      recommendedSpec: string;
      cost: number;
      timeline: string;
    }>;
    architecturalChanges: Array<{
      change: string;
      benefit: string;
      effort: 'low' | 'medium' | 'high';
      priority: 'low' | 'medium' | 'high';
    }>;
    configurationTuning: Array<{
      parameter: string;
      currentValue: any;
      recommendedValue: any;
      impact: string;
    }>;
  };

  riskAssessment: {
    bottlenecks: Array<{
      component: string;
      description: string;
      impact: 'low' | 'medium' | 'high' | 'critical';
      timeline: string;
      mitigation: string;
    }>;
    singlePointsOfFailure: string[];
    scalabilityLimits: Array<{
      component: string;
      currentLimit: string;
      breachEstimate: Date;
      solution: string;
    }>;
  };
}
