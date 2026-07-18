/**
 * Performance Monitoring Types
 */

export interface TSPHealthMetrics {
  provider: string;
  isHealthy: boolean;
  responseTime: number;
  averageLatency: number;
  totalTransactions: number;
  successRate: number;
  errorRate: number;
  availability: number;
  lastChecked: Date;
  issues: string[];
}

export interface BankPerformanceData {
  bankCode: string;
  bankName?: string;
  successRate: number;
  averageResponseTime: number;
  downtimeMinutes: number;
  transactionVolume: number;
  errorCodes: Record<string, number>;
  trendData: {
    direction: 'up' | 'down' | 'stable';
    percentage: number;
  };
}

export interface TSPPerformanceMetrics {
  provider: string;
  successRate: number;
  averageResponseTime: number;
  errorRate: number;
  volume: number;
  availability: number;
  lastUpdate: Date;
  trends: {
    successRate: TrendData;
    responseTime: TrendData;
    volume: TrendData;
  };
}

export interface TrendData {
  direction: 'up' | 'down' | 'stable';
  percentage: number;
  period: string;
}

export interface RealTimePerformanceData {
  provider: string;
  currentResponseTime: number;
  currentSuccessRate: number;
  activeConnections: number;
  queueLength: number;
  healthStatus: 'healthy' | 'degraded' | 'down';
  lastHeartbeat: Date;
}

export interface BankInsightsData {
  bankCode: string;
  performanceScore: number;
  recommendation: 'preferred' | 'acceptable' | 'avoid';
  issues: string[];
  strengths: string[];
  bestTimeWindows: string[];
  averageProcessingTime: number;
}

export interface PerformanceSummaryData {
  overallHealth: number;
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  averageResponseTime: number;
  topPerformingTSPs: Array<{
    provider: string;
    score: number;
  }>;
  recentIncidents: Array<{
    provider: string;
    issue: string;
    timestamp: Date;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }>;
  recommendations: string[];
}

export interface TSPComparisonData {
  providers: Array<{
    name: string;
    successRate: number;
    responseTime: number;
    cost: number;
    reliability: number;
    overallScore: number;
  }>;
  bestFor: {
    speed: string;
    reliability: string;
    cost: string;
    volume: string;
  };
  recommendations: string[];
}

export interface PerformanceAlert {
  id: string;
  type: 'degraded_performance' | 'high_error_rate' | 'timeout' | 'downtime';
  severity: 'low' | 'medium' | 'high' | 'critical';
  provider: string;
  message: string;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
  affectedTransactions: number;
}

export interface UpdateMetricsRequest {
  provider: string;
  metrics: {
    responseTime?: number;
    successRate?: number;
    errorRate?: number;
    availability?: number;
    volume?: number;
  };
  timestamp: Date;
}

export interface CacheMetricsData {
  key: string;
  data: any;
  ttl?: number;
  tags?: string[];
}
