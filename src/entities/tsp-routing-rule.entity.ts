import { 
  Entity, 
  Column, 
  Index 
} from 'typeorm';
import { BaseEntity } from './base.entity';

// Optimized for Ultra-fast Routing Rule Evaluation
@Entity('tsp_routing_rules')
@Index(['isActive', 'priority'])               // Active rule priority lookup
@Index(['conditionsHash', 'weight'])           // Rule matching optimization
@Index(['ruleName'], { unique: true })         // Unique rule identification
@Index(['createdBy', 'createdAt'])             // Admin audit queries
@Index(['environment', 'isActive'])            // Environment-specific rules
export class TSPRoutingRule extends BaseEntity {
  @Column({ 
    type: 'varchar', 
    length: 100,
    unique: true,
    comment: 'Unique rule name identifier'
  })
  ruleName: string;

  @Column({ 
    type: 'varchar', 
    length: 255,
    comment: 'Human-readable rule description'
  })
  description: string;

  @Column({ 
    type: 'boolean',
    default: true,
    comment: 'Whether this routing rule is active'
  })
  isActive: boolean;

  @Column({ 
    type: 'int',
    default: 100,
    comment: 'Rule priority (higher = evaluated first)'
  })
  priority: number;

  @Column({ 
    type: 'int',
    default: 100,
    comment: 'Routing weight for load distribution (0-100)'
  })
  weight: number;

  @Column({ 
    type: 'enum',
    enum: ['production', 'sandbox', 'development', 'all'],
    default: 'all',
    comment: 'Environment where this rule applies'
  })
  environment: 'production' | 'sandbox' | 'development' | 'all';

  @Column({ 
    type: 'jsonb',
    comment: 'Rule conditions for TSP selection'
  })
  conditions: {
    // Amount-based conditions
    minAmount?: number;
    maxAmount?: number;
    
    // Time-based conditions
    timeRanges?: Array<{
      startHour: number;
      endHour: number;
      days?: number[]; // 0=Sunday, 1=Monday, etc.
    }>;
    
    // Geographic conditions
    countries?: string[];
    excludeCountries?: string[];
    
    // Payment method conditions
    paymentMethods?: string[];
    excludePaymentMethods?: string[];
    
    // Bank-specific conditions
    banks?: string[];
    excludeBanks?: string[];
    
    // Performance conditions
    minSuccessRate?: number;
    maxLatency?: number;
    
    // Merchant-specific conditions
    merchantIds?: number[];
    excludeMerchantIds?: number[];
    
    // Custom business logic conditions
    customConditions?: Record<string, any>;
  };

  @Column({ 
    type: 'varchar', 
    length: 64,
    comment: 'Hash of conditions for fast rule matching'
  })
  conditionsHash: string;

  @Column({ 
    type: 'simple-array',
    comment: 'Target TSP provider names for this rule'
  })
  targetTSPs: string[];

  @Column({ 
    type: 'jsonb',
    nullable: true,
    comment: 'TSP selection strategy configuration'
  })
  selectionStrategy?: {
    type: 'weighted' | 'round_robin' | 'performance' | 'cost' | 'custom';
    parameters?: Record<string, any>;
  };

  @Column({ 
    type: 'varchar', 
    length: 100,
    comment: 'Admin user who created this rule'
  })
  createdBy: string;

  @Column({ 
    type: 'varchar', 
    length: 100,
    nullable: true,
    comment: 'Admin user who last updated this rule'
  })
  updatedBy?: string;

  @Column({ 
    type: 'timestamptz',
    nullable: true,
    comment: 'Rule effective start time'
  })
  effectiveFrom?: Date;

  @Column({ 
    type: 'timestamptz',
    nullable: true,
    comment: 'Rule expiration time'
  })
  effectiveTo?: Date;

  @Column({ 
    type: 'jsonb',
    nullable: true,
    comment: 'Rule performance statistics and usage metrics'
  })
  performanceStats?: {
    totalApplications: number;
    successfulApplications: number;
    averageResponseTime: number;
    lastUsed: Date;
  };

  @Column({ 
    type: 'jsonb',
    nullable: true,
    comment: 'Additional rule metadata'
  })
  metadata?: Record<string, any>;
}
