import { 
  Entity, 
  Column, 
  Index, 
  OneToMany 
} from 'typeorm';
import { BaseEntity } from './base.entity';
import { PaymentIntent } from './payment-intent.entity';
import { TSPPerformanceMetrics } from './tsp-performance-metrics.entity';
import { TSPProvider } from '../enums/tsp-provider.enum';

// Optimized for Ultra-fast TSP Configuration Lookups
@Entity('tsp_configurations')
@Index(['providerName', 'environment'], { unique: true }) 
@Index(['providerName', 'isActive'])                    
@Index(['priority', 'isActive'])                         
@Index(['environment', 'isActive'])                     
export class TSPConfiguration extends BaseEntity {
  @Column({ 
    type: 'enum',
    enum: TSPProvider,
    comment: 'TSP provider name from predefined list'
  })
  providerName: TSPProvider;

  @Column({ 
    type: 'varchar', 
    length: 100,
    comment: 'Human-readable provider display name'
  })
  displayName: string;

  @Column({ 
    type: 'enum',
    enum: ['production', 'sandbox', 'development'],
    comment: 'TSP environment configuration'
  })
  environment: 'production' | 'sandbox' | 'development';

  @Column({ 
    type: 'boolean',
    default: true,
    comment: 'Whether this TSP configuration is active'
  })
  isActive: boolean;

  @Column({ 
    type: 'int',
    default: 100,
    comment: 'TSP priority for routing (higher = more preferred)'
  })
  priority: number;

  @Column({ 
    type: 'jsonb',
    comment: 'Dynamic key-value credentials for TSP integration'
  })
  credentials: Record<string, string>;

  @Column({ 
    type: 'jsonb',
    nullable: true,
    comment: 'TSP-specific configuration options'
  })
  configuration?: Record<string, any>;

  @Column({ 
    type: 'decimal', 
    precision: 10, 
    scale: 2,
    nullable: true,
    comment: 'Minimum amount supported by this TSP'
  })
  minAmount?: number;

  @Column({ 
    type: 'decimal', 
    precision: 10, 
    scale: 2,
    nullable: true,
    comment: 'Maximum amount supported by this TSP'
  })
  maxAmount?: number;

  @Column({ 
    type: 'simple-array',
    nullable: true,
    comment: 'Supported currencies by this TSP'
  })
  supportedCurrencies?: string[];

  @Column({ 
    type: 'simple-array',
    nullable: true,
    comment: 'Supported payment methods by this TSP'
  })
  supportedPaymentMethods?: string[];

  @Column({ 
    type: 'simple-array',
    nullable: true,
    comment: 'Countries where this TSP operates'
  })
  supportedCountries?: string[];

  @Column({ 
    type: 'decimal', 
    precision: 5, 
    scale: 2,
    default: 0.00,
    comment: 'Processing fee percentage for this TSP'
  })
  processingFeePercentage: number;

  @Column({ 
    type: 'decimal', 
    precision: 10, 
    scale: 2,
    default: 0.00,
    comment: 'Fixed processing fee for this TSP'
  })
  processingFeeFixed: number;

  @Column({ 
    type: 'boolean',
    default: true,
    comment: 'Whether this TSP supports instant payouts'
  })
  supportsInstantPayouts: boolean;

  @Column({ 
    type: 'boolean',
    default: true,
    comment: 'Whether this TSP supports refunds'
  })
  supportsRefunds: boolean;

  @Column({ 
    type: 'boolean',
    default: true,
    comment: 'Whether this TSP supports recurring payments'
  })
  supportsRecurring: boolean;

  @Column({ 
    type: 'int',
    default: 30000,
    comment: 'Request timeout in milliseconds'
  })
  timeoutMs: number;

  @Column({ 
    type: 'int',
    default: 3,
    comment: 'Maximum retry attempts'
  })
  maxRetries: number;

  @Column({ 
    type: 'varchar', 
    length: 500,
    nullable: true,
    comment: 'TSP base URL for API calls'
  })
  baseUrl?: string;

  @Column({ 
    type: 'varchar', 
    length: 500,
    nullable: true,
    comment: 'TSP webhook URL endpoint'
  })
  webhookUrl?: string;

  @Column({ 
    type: 'varchar', 
    length: 100,
    nullable: true,
    comment: 'Last known health check status'
  })
  healthStatus?: string;

  @Column({ 
    type: 'timestamptz',
    nullable: true,
    comment: 'Last successful health check timestamp'
  })
  lastHealthCheck?: Date;

  @Column({ 
    type: 'jsonb',
    nullable: true,
    comment: 'Additional TSP metadata and configuration'
  })
  metadata?: Record<string, any>;

  @Column({ 
    type: 'varchar', 
    length: 100,
    nullable: true,
    comment: 'Admin user who created/updated this configuration'
  })
  createdBy?: string;

  @Column({ 
    type: 'varchar', 
    length: 100,
    nullable: true,
    comment: 'Admin user who last updated this configuration'
  })
  updatedBy?: string;
  
  @OneToMany('PaymentTransaction', 'tspConfiguration')
  transactions?: any[];

  @OneToMany(() => TSPPerformanceMetrics, metrics => metrics.tspConfiguration)
  performanceMetrics?: TSPPerformanceMetrics[];
}
