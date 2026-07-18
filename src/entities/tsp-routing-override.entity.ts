import { 
  Entity, 
  Column, 
  Index, 
  ManyToOne, 
  JoinColumn 
} from 'typeorm';
import { BaseEntity } from './base.entity';
import { TSPConfiguration } from './tsp-configuration.entity';

// Admin Override Controls for Smart Routing System
@Entity('tsp_routing_overrides') 
@Index(['overrideType', 'isActive'])           // Override type filtering
@Index(['merchantId', 'isActive'])             // Merchant-specific overrides
@Index(['effectiveFrom', 'effectiveTo'])       // Time-based override queries
@Index(['createdBy', 'createdAt'])             // Admin audit queries
@Index(['priority', 'isActive'])               // Priority-based override lookup
export class TSPRoutingOverride extends BaseEntity {
  @Column({ 
    type: 'enum',
    enum: ['disable_smart_routing', 'force_single_tsp', 'custom_traffic_split', 'emergency_override', 'scheduled_routing', 'merchant_specific', 'gradual_migration'],
    comment: 'Type of routing override'
  })
  overrideType: 'disable_smart_routing' | 'force_single_tsp' | 'custom_traffic_split' | 'emergency_override' | 'scheduled_routing' | 'merchant_specific' | 'gradual_migration';

  @Column({ 
    type: 'varchar', 
    length: 100,
    comment: 'Human-readable override name'
  })
  overrideName: string;

  @Column({ 
    type: 'varchar', 
    length: 255,
    comment: 'Override description and purpose'
  })
  description: string;

  @Column({ 
    type: 'boolean',
    default: true,
    comment: 'Whether this override is currently active'
  })
  isActive: boolean;

  @Column({ 
    type: 'int',
    default: 1000,
    comment: 'Override priority (higher = takes precedence)'
  })
  priority: number;

  @Column({ 
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: 'Specific merchant ID (null = applies to all)'
  })
  merchantId?: string;

  @Column({ 
    type: 'simple-array',
    nullable: true,
    comment: 'List of merchant IDs this override applies to'
  })
  targetMerchantIds?: string[];

  @Column({ 
    type: 'enum',
    enum: ['production', 'sandbox', 'development', 'all'],
    default: 'all',
    comment: 'Environment where this override applies'
  })
  environment: 'production' | 'sandbox' | 'development' | 'all';

  @Column({ 
    type: 'jsonb',
    comment: 'Override configuration parameters'
  })
  overrideConfig: {
    // For force_single_tsp
    forcedTSP?: string;
    
    // For custom_traffic_split
    trafficSplit?: Record<string, number>; // { "paytara": 70, "razorpay": 30 }
    
    // For disable_smart_routing
    fallbackTSP?: string;
    
    // For emergency_override
    emergencyTSP?: string;
    reason?: string;
    
    // For scheduled_routing
    scheduledRules?: Array<{
      startTime: string;
      endTime: string;
      targetTSP: string;
      days?: number[];
    }>;
    
    // For merchant_specific
    merchantRules?: Record<string, any>;
    
    // For gradual_migration
    migrationConfig?: {
      fromTSP: string;
      toTSP: string;
      trafficPercentage: number;
      stepSize: number;
      stepDuration: number;
    };
    
    // Common parameters
    maxAmount?: number;
    minAmount?: number;
    paymentMethods?: string[];
    customConditions?: Record<string, any>;
  };

  @Column({ 
    type: 'timestamptz',
    nullable: true,
    comment: 'Override effective start time'
  })
  effectiveFrom?: Date;

  @Column({ 
    type: 'timestamptz',
    nullable: true,
    comment: 'Override expiration time'
  })
  effectiveTo?: Date;

  @Column({ 
    type: 'varchar', 
    length: 100,
    comment: 'Admin user who created this override'
  })
  createdBy: string;

  @Column({ 
    type: 'varchar', 
    length: 100,
    nullable: true,
    comment: 'Admin user who last updated this override'
  })
  updatedBy?: string;

  @Column({ 
    type: 'varchar', 
    length: 255,
    nullable: true,
    comment: 'Reason for creating this override'
  })
  reason?: string;

  @Column({ 
    type: 'boolean',
    default: false,
    comment: 'Whether this is an emergency override'
  })
  isEmergency: boolean;

  @Column({ 
    type: 'jsonb',
    nullable: true,
    comment: 'Override usage statistics'
  })
  usageStats?: {
    totalApplications: number;
    affectedTransactions: number;
    performanceImpact: number;
    lastUsed: Date;
  };

  @Column({ 
    type: 'jsonb',
    nullable: true,
    comment: 'Override approval workflow details'
  })
  approvalDetails?: {
    approvedBy?: string;
    approvedAt?: Date;
    approvalReason?: string;
    requiresApproval: boolean;
  };

  @Column({ 
    type: 'jsonb',
    nullable: true,
    comment: 'Additional override metadata'
  })
  metadata?: Record<string, any>;

  // Relations
  @ManyToOne(() => TSPConfiguration, { nullable: true })
  @JoinColumn({ name: 'tsp_configuration_id' })
  targetTSPConfiguration?: TSPConfiguration;
}
