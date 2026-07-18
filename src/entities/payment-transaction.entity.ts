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

// Separate Transaction Entity for Each TSP Attempt (Stripe Pattern)
@Entity('payment_transactions')
@Index(['paymentIntentId', 'createdAt'])       // Intent-based transaction lookup
@Index(['transactionId'], { unique: true })    // Unique transaction lookup
@Index(['externalTransactionId'])              // TSP transaction correlation
@Index(['status', 'createdAt'])                // Status-based queries
@Index(['tspProvider', 'createdAt'])           // TSP performance analysis
@Index(['responseCode'])                       // Response code analysis
@Index(['merchantId', 'createdAt'])            // Merchant transaction history
@Index(['settlementEligible', 'createdAt'])    // Settlement processing queries
@Index(['tspProvider', 'status', 'createdAt']) // TSP success rate analysis
@Index(['merchantId', 'tspProvider', 'status']) // Merchant-TSP performance
@Index(['responseCode', 'tspProvider'])        // Error code analysis by TSP
export class PaymentTransaction extends BaseEntity {
  @Column({ 
    type: 'varchar', 
    length: 64, 
    unique: true,
    comment: 'Unique transaction identifier'
  })
  transactionId: string;

  @Column({ 
    type: 'varchar', 
    length: 64,
    comment: 'Payment intent ID this transaction belongs to'
  })
  paymentIntentId: string;

  @Column({ 
    type: 'varchar',
    length: 64,
    comment: 'Merchant ID reference' 
  })
  merchantId: string;

  @Column({ 
    type: 'varchar', 
    length: 255,
    nullable: true,
    comment: 'Customer full name'
  })
  customerName?: string;

  @Column({ 
    type: 'varchar', 
    length: 255,
    nullable: true,
    comment: 'Customer email address'
  })
  customerEmail?: string;

  @Column({ 
    type: 'varchar', 
    length: 100,
    nullable: true,
    comment: 'Customer phone number'
  })
  customerPhone?: string;

  @Column({ 
    type: 'int',
    default: 1,
    comment: 'Attempt number for this payment intent (1, 2, 3...)'
  })
  attemptNumber: number;

  @Column({ 
    type: 'varchar', 
    length: 50,
    comment: 'TSP provider used for this transaction attempt'
  })
  tspProvider: string;

  @Column({ 
    type: 'int',
    nullable: true,
    comment: 'TSP configuration ID used for this transaction'
  })
  tspConfigurationId?: number;

  @Column({ 
    type: 'varchar', 
    length: 100,
    nullable: true,
    comment: 'External TSP transaction ID'
  })
  externalTransactionId?: string;

  @Column({ 
    type: 'decimal', 
    precision: 20, 
    scale: 8,
    comment: 'Transaction amount attempted (supports up to 8 decimals for cryptocurrencies)'
  })
  amount: number;

  @Column({ 
    type: 'varchar', 
    length: 10,
    default: 'INR',
    comment: 'Transaction currency code (ISO 4217 for fiat, crypto codes like USDT, BTC)'
  })
  currency: string;

  @Column({ 
    type: 'enum',
    enum: [
      'initiated',         // Transaction started
      'processing',        // Sent to TSP
      'waiting_bank',      // Waiting for bank response
      'waiting_customer',  // Waiting for customer action (2FA, etc.)
      'success',          // Completed successfully
      'failed',           // Failed permanently
      'timeout',          // TSP/Bank timeout
      'abandoned',        // Customer abandoned
      'cancelled',        // Cancelled by merchant/system
      'refunded',         // Refunded after success
      'partial_refund',   // Partially refunded
      'disputed'          // Disputed by customer
    ],
    default: 'initiated',
    comment: 'Detailed transaction status'
  })
  status: 'initiated' | 'processing' | 'waiting_bank' | 'waiting_customer' | 'success' | 'failed' | 'timeout' | 'abandoned' | 'cancelled' | 'refunded' | 'partial_refund' | 'disputed';

  @Column({ 
    type: 'varchar', 
    length: 10,
    comment: 'Standardized response code (0=success, 1000+ = various failure types)'
  })
  responseCode: string;

  @Column({ 
    type: 'enum',
    enum: ['SUCCESS', 'FAILED', 'PENDING', 'WAITING_BANK', 'ABANDONED', 'REFUNDED'],
    comment: 'High-level response code category'
  })
  responseType: 'SUCCESS' | 'FAILED' | 'PENDING' | 'WAITING_BANK' | 'ABANDONED' | 'REFUNDED';

  @Column({ 
    type: 'varchar', 
    length: 255,
    comment: 'Human-readable transaction status description'
  })
  statusDescription: string;

  @Column({ 
    type: 'boolean',
    default: false,
    comment: 'Whether this status is final (no more updates expected)'
  })
  isFinalStatus: boolean;

  @Column({ 
    type: 'boolean',
    default: false,
    comment: 'Whether this transaction requires follow-up checking'
  })
  requiresFollowup: boolean;

  @Column({ 
    type: 'boolean',
    default: false,
    comment: 'Whether this transaction is eligible for settlement'
  })
  settlementEligible: boolean;

  @Column({ 
    type: 'int',
    nullable: true,
    comment: 'TSP response time in milliseconds'
  })
  responseTimeMs?: number;

  @Column({ 
    type: 'varchar', 
    length: 255,
    nullable: true,
    comment: 'Error message or failure reason'
  })
  errorMessage?: string;

  @Column({ 
    type: 'varchar', 
    length: 50,
    nullable: true,
    comment: 'Error category for better classification'
  })
  errorCategory?: string;

  @Column({ 
    type: 'jsonb',
    nullable: true,
    comment: 'Complete TSP request payload (encrypted)'
  })
  tspRequest?: Record<string, any>;

  @Column({ 
    type: 'jsonb',
    nullable: true,
    comment: 'Complete TSP response payload'
  })
  tspResponse?: Record<string, any>;

  @Column({ 
    type: 'varchar', 
    length: 10,
    nullable: true,
    comment: 'Bank code extracted from payment method'
  })
  bankCode?: string;

  @Column({ 
    type: 'varchar', 
    length: 50,
    nullable: true,
    comment: 'Payment method used (UPI, card, netbanking)'
  })
  paymentMethod?: string;

  @Column({ 
    type: 'jsonb',
    nullable: true,
    comment: 'Payment method details (encrypted sensitive data)'
  })
  paymentMethodDetails?: Record<string, any>;

  @Column({ 
    type: 'decimal', 
    precision: 8, 
    scale: 4,
    nullable: true,
    comment: 'Processing fee for this transaction'
  })
  processingFee?: number;

  @Column({ 
    type: 'varchar', 
    length: 64,
    comment: 'Request correlation ID'
  })
  requestId: string;

  @Column({ 
    type: 'enum',
    enum: ['production', 'sandbox', 'development'],
    comment: 'Environment where transaction was processed'
  })
  environment: 'production' | 'sandbox' | 'development';

  @Column({ 
    type: 'varchar', 
    length: 45,
    nullable: true,
    comment: 'Customer IP address'
  })
  customerIpAddress?: string;

  @Column({ 
    type: 'varchar', 
    length: 500,
    nullable: true,
    comment: 'Customer user agent'
  })
  customerUserAgent?: string;

  @Column({ 
    type: 'timestamptz',
    nullable: true,
    comment: 'When transaction was sent to TSP'
  })
  sentToTspAt?: Date;

  @Column({ 
    type: 'timestamptz',
    nullable: true,
    comment: 'When response received from TSP'
  })
  receivedFromTspAt?: Date;

  @Column({ 
    type: 'timestamptz',
    nullable: true,
    comment: 'When bank responded (if applicable)'
  })
  bankResponseAt?: Date;

  @Column({ 
    type: 'timestamptz',
    nullable: true,
    comment: 'Transaction completion timestamp'
  })
  completedAt?: Date;

  @Column({ 
    type: 'timestamptz',
    nullable: true,
    comment: 'Transaction failure timestamp'
  })
  failedAt?: Date;

  @Column({ 
    type: 'timestamptz',
    nullable: true,
    comment: 'Transaction timeout timestamp'
  })
  timedOutAt?: Date;

  @Column({ 
    type: 'timestamptz',
    nullable: true,
    comment: 'Transaction abandonment timestamp'
  })
  abandonedAt?: Date;

  @Column({ 
    type: 'timestamptz',
    nullable: true,
    comment: 'When transaction expires and becomes abandoned'
  })
  expiresAt?: Date;

  @Column({ 
    type: 'jsonb',
    nullable: true,
    comment: 'Fraud assessment results for this transaction'
  })
  fraudAssessment?: Record<string, any>;

  @Column({ 
    type: 'jsonb',
    nullable: true,
    comment: 'Smart routing decision details for this transaction'
  })
  routingDecision?: Record<string, any>;

  @Column({ 
    type: 'jsonb',
    nullable: true,
    comment: 'Additional transaction metadata'
  })
  metadata?: Record<string, any>;

  // Relations
  @ManyToOne(() => PaymentIntent, { eager: false })
  @JoinColumn({ name: 'paymentIntentId', referencedColumnName: 'intentId' })
  intent: PaymentIntent;

  @ManyToOne(() => TSPConfiguration, { nullable: true })
  @JoinColumn({ name: 'tsp_configuration_id' })
  tspConfiguration?: TSPConfiguration;
}
