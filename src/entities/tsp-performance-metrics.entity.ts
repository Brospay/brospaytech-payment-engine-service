import { 
  Entity, 
  Column, 
  Index, 
  ManyToOne, 
  JoinColumn 
} from 'typeorm';
import { BaseEntity } from './base.entity';
import { TSPConfiguration } from './tsp-configuration.entity';

// Time-series Optimization for Real-time Performance Analytics
@Entity('tsp_performance_metrics')
@Index(['tspConfigurationId', 'timestamp'])    // Time-series queries by TSP
@Index(['providerName', 'environment', 'timestamp']) // Multi-dimensional analysis
@Index(['measurementWindow', 'timestamp'])     // Window-based aggregation queries
@Index(['timestamp'])                          // Time-based range queries
@Index(['successRate', 'timestamp'])           // Performance ranking queries
@Index(['averageLatency', 'timestamp'])        // Latency analysis queries
@Index(['providerName', 'measurementWindow', 'timestamp']) // Ultra-fast aggregation queries
export class TSPPerformanceMetrics extends BaseEntity {
  @Column({ 
    type: 'int',
    comment: 'TSP configuration ID reference'
  })
  tspConfigurationId: number;

  @Column({ 
    type: 'varchar', 
    length: 50,
    comment: 'TSP provider name for quick filtering'
  })
  providerName: string;

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
    enum: ['1min', '5min', '15min', '1hour', '1day'],
    comment: 'Measurement window duration'
  })
  measurementWindow: '1min' | '5min' | '15min' | '1hour' | '1day';

  @Column({ 
    type: 'decimal', 
    precision: 5, 
    scale: 2,
    comment: 'Success rate percentage (0-100)'
  })
  successRate: number;

  @Column({ 
    type: 'int',
    comment: 'Average response latency in milliseconds'
  })
  averageLatency: number;

  @Column({ 
    type: 'int',
    comment: 'P99 response latency in milliseconds'
  })
  p99Latency: number;

  @Column({ 
    type: 'int',
    comment: 'Total number of transactions in window'
  })
  totalTransactions: number;

  @Column({ 
    type: 'int',
    comment: 'Number of successful transactions'
  })
  successfulTransactions: number;

  @Column({ 
    type: 'int',
    comment: 'Number of failed transactions'
  })
  failedTransactions: number;

  @Column({ 
    type: 'int',
    comment: 'Number of timeout errors'
  })
  timeoutErrors: number;

  @Column({ 
    type: 'int',
    comment: 'Number of network errors'
  })
  networkErrors: number;

  @Column({ 
    type: 'decimal', 
    precision: 12, 
    scale: 2,
    comment: 'Total transaction volume in window'
  })
  totalVolume: number;

  @Column({ 
    type: 'decimal', 
    precision: 12, 
    scale: 2,
    comment: 'Average transaction amount'
  })
  averageAmount: number;

  @Column({ 
    type: 'decimal', 
    precision: 10, 
    scale: 4,
    comment: 'Total processing fees collected'
  })
  totalFees: number;

  @Column({ 
    type: 'jsonb',
    nullable: true,
    comment: 'Breakdown of errors by type and frequency'
  })
  errorBreakdown?: Record<string, number>;

  @Column({ 
    type: 'jsonb',
    nullable: true,
    comment: 'Geographic performance distribution'
  })
  geographicBreakdown?: Record<string, any>;

  @Column({ 
    type: 'jsonb',
    nullable: true,
    comment: 'Payment method performance breakdown'
  })
  paymentMethodBreakdown?: Record<string, any>;

  @Column({ 
    type: 'jsonb',
    nullable: true,
    comment: 'Additional performance metrics and metadata'
  })
  additionalMetrics?: Record<string, any>;

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
}
