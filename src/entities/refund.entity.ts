import { 
  Entity, 
  Column, 
  Index, 
  ManyToOne, 
  JoinColumn 
} from 'typeorm';
import { BaseEntity } from './base.entity';
import { PaymentIntent } from './payment-intent.entity';
import { PaymentTransaction } from './payment-transaction.entity';

export enum RefundStatus {
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export enum RefundType {
  FULL = 'full',
  PARTIAL = 'partial'
}

@Entity('refunds')
@Index(['refundId'], { unique: true })
@Index(['merchantId', 'createdAt'])
@Index(['transactionId'])
@Index(['customerId'])
@Index(['status', 'createdAt'])
@Index(['merchantId', 'status', 'createdAt'])
@Index(['paymentIntentId'])
@Index(['requestId'], { unique: true })
export class Refund extends BaseEntity {
  @Column({ 
    type: 'varchar', 
    length: 64, 
    unique: true,
    comment: 'Unique refund identifier'
  })
  refundId: string;

  @Column({ 
    type: 'varchar',
    length: 64,
    comment: 'Merchant ID reference' 
  })
  merchantId: string;

  @Column({ 
    type: 'varchar',
    length: 128,
    comment: 'Customer ID reference' 
  })
  customerId: string;

  @Column({ 
    type: 'varchar',
    length: 64,
    comment: 'Original transaction ID being refunded'
  })
  transactionId: string;

  @ManyToOne(() => PaymentTransaction)
  @JoinColumn({ name: 'transactionId', referencedColumnName: 'transactionId' })
  transaction?: PaymentTransaction;

  @Column({ 
    type: 'varchar',
    length: 64,
    comment: 'Payment intent ID reference'
  })
  paymentIntentId: string;

  @ManyToOne(() => PaymentIntent)
  @JoinColumn({ name: 'paymentIntentId', referencedColumnName: 'intentId' })
  paymentIntent?: PaymentIntent;

  @Column({ 
    type: 'decimal',
    precision: 30,
    scale: 8,
    comment: 'Refund amount (supports crypto with 8 decimals)'
  })
  amount: number;

  @Column({ 
    type: 'decimal',
    precision: 30,
    scale: 8,
    comment: 'Original transaction amount'
  })
  originalAmount: number;

  @Column({ 
    type: 'varchar',
    length: 10,
    default: 'INR',
    comment: 'Currency code (ISO 4217 for fiat, crypto codes like USDT, BTC)'
  })
  currency: string;

  @Column({ 
    type: 'enum',
    enum: RefundType,
    default: RefundType.FULL,
    comment: 'Refund type: full or partial'
  })
  refundType: RefundType;

  @Column({ 
    type: 'enum',
    enum: RefundStatus,
    default: RefundStatus.PENDING_APPROVAL,
    comment: 'Current refund status'
  })
  status: RefundStatus;

  @Column({ 
    type: 'boolean',
    default: false,
    comment: 'Auto-process refund without approval'
  })
  autoProcess: boolean;

  @Column({ 
    type: 'varchar',
    length: 50,
    comment: 'TSP provider used for refund'
  })
  tspProvider: string;

  @Column({ 
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'External refund ID from TSP'
  })
  externalRefundId?: string;

  @Column({ 
    type: 'text',
    nullable: true,
    comment: 'Reason for refund'
  })
  reason?: string;

  @Column({ 
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Merchant user who initiated refund'
  })
  initiatedBy?: string;

  @Column({ 
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Admin user who approved/rejected'
  })
  approvedBy?: string;

  @Column({ 
    type: 'timestamp',
    nullable: true,
    comment: 'When refund was approved'
  })
  approvedAt?: Date;

  @Column({ 
    type: 'text',
    nullable: true,
    comment: 'Approval/rejection notes'
  })
  approvalNotes?: string;

  @Column({ 
    type: 'timestamp',
    nullable: true,
    comment: 'When refund was completed'
  })
  completedAt?: Date;

  @Column({ 
    type: 'timestamp',
    nullable: true,
    comment: 'Auto-cancel after this date (T+2 days)'
  })
  autoCancelAt?: Date;

  @Column({ 
    type: 'text',
    nullable: true,
    comment: 'Failure reason if refund failed'
  })
  failureReason?: string;

  @Column({ 
    type: 'varchar',
    length: 64,
    comment: 'Request ID for idempotency'
  })
  requestId: string;

  @Column({ 
    type: 'jsonb',
    nullable: true,
    comment: 'TSP raw response'
  })
  tspResponse?: Record<string, any>;

  @Column({ 
    type: 'jsonb',
    nullable: true,
    comment: 'Additional metadata'
  })
  metadata?: Record<string, any>;

  @Column({ 
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Wallet transaction ID for blocking funds'
  })
  walletBlockTransactionId?: string;

  @Column({ 
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Wallet transaction ID for final debit'
  })
  walletDebitTransactionId?: string;

  @Column({ 
    type: 'decimal',
    precision: 30,
    scale: 8,
    default: 0,
    comment: 'Amount currently blocked in wallet (supports crypto)'
  })
  blockedAmount: number;

  @Column({ 
    type: 'varchar',
    length: 20,
    default: 'sandbox',
    comment: 'Environment'
  })
  environment: string;

  @Column({ 
    type: 'int',
    default: 0,
    comment: 'Number of retry attempts'
  })
  retryCount: number;

  @Column({ 
    type: 'timestamp',
    nullable: true,
    comment: 'Last retry timestamp'
  })
  lastRetryAt?: Date;

  @Column({ 
    type: 'int',
    nullable: true,
    comment: 'Processing time in milliseconds'
  })
  processingTimeMs?: number;
}

