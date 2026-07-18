import { 
  Entity, 
  Column, 
  Index, 
  ManyToOne, 
  JoinColumn 
} from 'typeorm';
import { BaseEntity } from './base.entity';
import { PaymentIntent } from './payment-intent.entity';
import { TSPConfiguration } from './tsp-configuration.entity';

// Bank-Level Performance Intelligence for Customer Recommendations
@Entity('bank_performance_metrics')
@Index(['bankCode', 'tspConfigurationId', 'timestamp']) // Bank+TSP performance queries
@Index(['bankCode', 'timestamp'])                      // Bank-specific performance trends
@Index(['tspConfigurationId', 'timestamp'])           // TSP-specific bank performance
@Index(['successRate', 'timestamp'])                  // Performance ranking queries
@Index(['environment', 'timestamp'])                  // Environment-based analysis
@Index(['isDowntime', 'timestamp'])                   // Downtime detection queries
export class BankPerformanceMetrics extends BaseEntity {
  @Column({ 
    type: 'varchar', 
    length: 20,
    comment: 'Bank identifier code (SBI, ICICI, HDFC, etc.)'
  })
  bankCode: string;

  @Column({ 
    type: 'varchar', 
    length: 100,
    comment: 'Full bank name for display'
  })
  bankName: string;

  @Column({ 
    type: 'int',
    comment: 'TSP configuration ID for bank performance tracking'
  })
  tspConfigurationId: number;

  @Column({ 
    type: 'varchar', 
    length: 50,
    comment: 'TSP provider name for quick filtering'
  })
  tspProviderName: string;

  @Column({ 
    type: 'enum',
    enum: ['production', 'sandbox', 'development'],
    comment: 'Environment where metrics were collected'
  })
  environment: 'production' | 'sandbox' | 'development';

  @Column({ 
    type: 'timestamptz',
    comment: 'Metrics measurement timestamp',
    default: () => 'CURRENT_TIMESTAMP'
  })
  timestamp: Date;

  @Column({ 
    type: 'enum',
    enum: ['1min', '5min', '15min', '1hour', '4hour', '1day'],
    comment: 'Measurement window for bank performance'
  })
  measurementWindow: '1min' | '5min' | '15min' | '1hour' | '4hour' | '1day';

  @Column({ 
    type: 'decimal', 
    precision: 5, 
    scale: 2,
    comment: 'Bank success rate percentage with this TSP (0-100)'
  })
  successRate: number;

  @Column({ 
    type: 'int',
    comment: 'Average response time for this bank via TSP (milliseconds)'
  })
  avgResponseTime: number;

  @Column({ 
    type: 'int',
    comment: 'P99 response time for this bank via TSP (milliseconds)'
  })
  p99ResponseTime: number;

  @Column({ 
    type: 'int',
    comment: 'Total transactions for this bank in measurement window'
  })
  totalTransactions: number;

  @Column({ 
    type: 'int',
    comment: 'Successful transactions for this bank'
  })
  successfulTransactions: number;

  @Column({ 
    type: 'int',
    comment: 'Failed transactions for this bank'
  })
  failedTransactions: number;

  @Column({ 
    type: 'int',
    comment: 'Number of timeout errors for this bank'
  })
  timeoutErrors: number;

  @Column({ 
    type: 'int',
    comment: 'Number of declined transactions by bank'
  })
  declinedTransactions: number;

  @Column({ 
    type: 'decimal', 
    precision: 12, 
    scale: 2,
    comment: 'Total transaction volume for this bank'
  })
  totalVolume: number;

  @Column({ 
    type: 'decimal', 
    precision: 12, 
    scale: 2,
    comment: 'Average transaction amount for this bank'
  })
  averageAmount: number;

  @Column({ 
    type: 'boolean',
    default: false,
    comment: 'Whether this bank is currently experiencing downtime'
  })
  isDowntime: boolean;

  @Column({ 
    type: 'timestamptz',
    nullable: true,
    comment: 'When downtime was first detected'
  })
  downtimeStartedAt?: Date;

  @Column({ 
    type: 'int',
    default: 0,
    comment: 'Duration of current downtime in minutes'
  })
  downtimeDuration: number;

  @Column({ 
    type: 'jsonb',
    nullable: true,
    comment: 'Breakdown of error types for this bank'
  })
  errorBreakdown?: {
    insufficientFunds: number;
    invalidAccount: number;
    networkError: number;
    bankTimeout: number;
    maintenanceMode: number;
    otherErrors: number;
  };

  @Column({ 
    type: 'enum',
    enum: ['excellent', 'good', 'average', 'poor', 'critical'],
    comment: 'Overall bank health status'
  })
  healthStatus: 'excellent' | 'good' | 'average' | 'poor' | 'critical';

  @Column({ 
    type: 'decimal', 
    precision: 4, 
    scale: 1,
    comment: 'Bank performance score (0-100)'
  })
  performanceScore: number;

  @Column({ 
    type: 'varchar', 
    length: 255,
    nullable: true,
    comment: 'Customer-facing recommendation message'
  })
  customerRecommendation?: string;

  @Column({ 
    type: 'boolean',
    default: false,
    comment: 'Whether merchants should be alerted about this bank'
  })
  shouldAlertMerchants: boolean;

  @Column({ 
    type: 'varchar', 
    length: 255,
    nullable: true,
    comment: 'Alert message for merchants'
  })
  merchantAlert?: string;

  @Column({ 
    type: 'jsonb',
    nullable: true,
    comment: 'Peak usage hours and patterns for this bank'
  })
  usagePatterns?: {
    peakHours: number[];
    peakDays: number[];
    seasonalTrends: Record<string, number>;
    weekendPerformance: number;
  };

  @Column({ 
    type: 'jsonb',
    nullable: true,
    comment: 'Additional bank performance metadata'
  })
  metadata?: Record<string, any>;

  @Column({ 
    type: 'varchar', 
    length: 64,
    comment: 'Request correlation ID for tracking'
  })
  requestId: string;

  // Relations for Performance Analytics
  @ManyToOne(() => TSPConfiguration, config => config.performanceMetrics)
  @JoinColumn({ name: 'tsp_configuration_id' })
  tspConfiguration: TSPConfiguration;

  @ManyToOne('PaymentTransaction', 'bankMetrics', { nullable: true })
  @JoinColumn({ name: 'payment_transaction_id' })
  paymentTransaction?: any;
}
