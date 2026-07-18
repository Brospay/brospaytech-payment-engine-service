export interface TransactionSummaryResponse {
    totalTransactions: number;
    totalVolume: number;
    successRate: number;
    failedTransactions: number;
    pendingTransactions: number;
    averageAmount: number;
    topCountries?: Array<{ country: string; count: number; volume: number }>;
    topPaymentMethods?: Array<{ method: string; count: number; volume: number; successRate: number }>;
    fraud?: {
      totalFraudAlerts: number;
      fraudRate: number;
      blockedTransactions: number;
    };
  }


  export interface PayoutPaymentsAnalyticsFilters {
    merchantId: string;
    customerId: string;
    customerEmail: string;
    customerPhone: string;
    status: string;
    currency: string;
    startDate: string;
    endDate: string;
    amountRange: { min: number; max: number };
    includeTimeSeries: boolean;
    includeComparison: boolean;
    granularity: 'hour' | 'day' | 'week' | 'month';
  }

  export interface TransactionAnalyticsFilters {
    merchantIds?: string[];
    startDate: string;
    endDate: string;
    paymentMethods?: string[];
    merchantId?: string;
    statuses?: string[];
    countries?: string[];
    status?: string;
    paymentMethod?: string;
    amountRange?: { min: number; max: number };
    currency?: string;
    includeTimeSeries?: boolean;
    includeComparison?: boolean;
    granularity?: 'hour' | 'day' | 'week' | 'month';
  }

  export interface TransactionSummary {
    totalTransactions: number;
    totalVolume: number;
    averageTicketSize: number;
    successfulTransactions: number;
    failedTransactions: number;
    pendingTransactions: number;
    successRate: number;
    failureRate: number;
    period: string;
    currency: string;
    timeSeries?: TimeSeriesPoint[];
    comparison?: ComparisonMetrics;
  }

  export interface PayoutDashboardAnalytics {
    // Dashboard-specific metrics for 7 cards
    totalManualPayments: number;
    paymentAmount: number;
    approvedPayments: number;
    avgProcessingTime: number; // in minutes
    approvedToday: number;
    pendingApproval: number;
    approvalRate: number;
    
    // Comparison data for each metric
    comparison?: {
      totalManualPayments: ComparisonMetric;
      paymentAmount: ComparisonMetric;
      approvedPayments: ComparisonMetric;
      avgProcessingTime: ComparisonMetric;
      approvedToday: ComparisonMetric;
      pendingApproval: ComparisonMetric;
      approvalRate: ComparisonMetric;
    };
    
    // Additional metadata
    period: string;
    currency: string;
    lastUpdated: string;
  }

  export interface ComparisonMetric {
    previousValue: number;
    changePercentage: number;
    trend: 'UP' | 'DOWN' | 'STABLE';
  }



export interface TimeSeriesPoint {
  timestamp: string;
  value: number;
  count?: number;
  additionalMetrics?: Record<string, number>;
}

export interface ComparisonMetrics {
  previousPeriod: TransactionSummary;
  changePercentage: number;
  trend: 'UP' | 'DOWN' | 'STABLE';
}

export interface TimeSeriesPoint {
  timestamp: string;
  value: number;
  count?: number;
  additionalMetrics?: Record<string, number>;
}

  