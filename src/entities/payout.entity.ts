import { 
  Entity, 
  Column, 
  Index,
  ManyToOne,
  JoinColumn
} from 'typeorm';
import { BaseEntity } from './base.entity';
import { BatchPayout } from './batch-payout.entity';

export enum PayoutStatus {
  INITIATED = 'initiated',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REVERSED = 'reversed'
}

export enum PayoutType {
  UPI = 'upi',
  IMPS = 'imps',
  NEFT = 'neft',
  RTGS = 'rtgs',
  BANK_TRANSFER = 'bank_transfer',
  CRYPTO = 'crypto'
}

@Entity('payouts')
@Index(['payoutId'], { unique: true })
@Index(['merchantId', 'createdAt'])
@Index(['customerId', 'createdAt'])
@Index(['merchantId', 'customerId', 'createdAt'])
@Index(['status', 'createdAt'])
@Index(['tspProvider', 'createdAt'])
@Index(['externalPayoutId'])
@Index(['beneficiaryAccount'])
@Index(['merchantId', 'status', 'createdAt'])
@Index(['tspProvider', 'status', 'createdAt'])
export class Payout extends BaseEntity {
  @Column({ 
    type: 'varchar', 
    length: 64, 
    unique: true,
    comment: 'Unique payout identifier (payout_xxx)'
  })
  payoutId: string;

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
    comment: 'Batch payout ID if part of batch processing' 
  })
  @Index()
  batch_payout_id: string;

  @ManyToOne(() => BatchPayout, (batch) => batch.payouts, { nullable: true })
  @JoinColumn({ name: 'batch_payout_id' })
  batch_payout: BatchPayout;

  @Column({ 
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Customer ID reference (for tracking customer payouts)' 
  })
  customerId: string;

  @Column({ 
    type: 'varchar',
    length: 200,
    nullable: true,
    comment: 'Customer email' 
  })
  customerEmail: string;

  @Column({ 
    type: 'varchar',
    length: 20,
    nullable: true,
    comment: 'Customer phone number' 
  })
  customerPhone: string;

  @Column({ 
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Wallet transaction ID reference' 
  })
  walletTransactionId: string;

  @Column({ 
    type: 'varchar',
    length: 100,
    comment: 'Beneficiary account number' 
  })
  beneficiaryAccount: string;

  @Column({ 
    type: 'varchar',
    length: 20,
    nullable: true,
    comment: 'IFSC code for Indian bank transfers' 
  })
  beneficiaryIfsc: string;

  @Column({ 
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'BIC/SWIFT code for international transfers' 
  })
  beneficiarySwift: string;

  @Column({ 
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: 'IBAN for international bank transfers (European banking)' 
  })
  beneficiaryIban: string;

  @Column({ 
    type: 'varchar',
    length: 200,
    comment: 'Account holder name' 
  })
  beneficiaryName: string;

  @Column({ 
    type: 'varchar',
    length: 20,
    nullable: true,
    comment: 'Beneficiary mobile number' 
  })
  beneficiaryMobile: string;

  @Column({ 
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Beneficiary UPI VPA for UPI payouts' 
  })
  beneficiaryVpa: string;

  @Column({ 
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Bank name' 
  })
  bankName: string;

  @Column({ 
    type: 'decimal',
    precision: 30,
    scale: 8,
    comment: 'Payout amount (supports crypto with 8 decimals)' 
  })
  amount: number;

  @Column({ 
    type: 'varchar',
    length: 10,
    default: 'INR',
    comment: 'Currency code (INR, USD, EUR, etc.)' 
  })
  currency: string;

  @Column({ 
    type: 'enum',
    enum: PayoutType,
    comment: 'Payout transfer type'
  })
  payoutType: PayoutType;

  @Column({ 
    type: 'varchar',
    length: 200,
    comment: 'Purpose of payout (WINNINGS, REFUND, SETTLEMENT, etc.)' 
  })
  purpose: string;

  @Column({ 
    type: 'text',
    nullable: true,
    comment: 'Additional description' 
  })
  description: string;

  @Column({ 
    type: 'enum',
    enum: PayoutStatus,
    default: PayoutStatus.INITIATED,
    comment: 'Current payout status'
  })
  status: PayoutStatus;

  @Column({ 
    type: 'varchar',
    length: 50,
    comment: 'TSP provider (paytara, kingdom_bank, razorpay, etc.)' 
  })
  tspProvider: string;

  @Column({ 
    type: 'varchar',
    length: 200,
    nullable: true,
    comment: 'External TSP payout ID' 
  })
  externalPayoutId: string;

  @Column({ 
    type: 'varchar',
    length: 200,
    nullable: true,
    comment: 'Bank reference number (UTR)' 
  })
  bankReferenceNumber: string;

  @Column({ 
    type: 'decimal',
    precision: 30,
    scale: 8,
    default: 0,
    comment: 'Processing fee charged (supports crypto)' 
  })
  processingFee: number;

  @Column({ 
    type: 'decimal',
    precision: 30,
    scale: 8,
    comment: 'Total amount debited from merchant wallet (supports crypto)' 
  })
  totalDebitedAmount: number;

  @Column({ 
    type: 'timestamp',
    nullable: true,
    comment: 'Estimated completion timestamp' 
  })
  estimatedCompletion: Date;

  @Column({ 
    type: 'timestamp',
    nullable: true,
    comment: 'Actual completion timestamp' 
  })
  completedAt: Date;

  @Column({ 
    type: 'text',
    nullable: true,
    comment: 'Failure reason if payout failed' 
  })
  failureReason: string;

  @Column({ 
    type: 'varchar',
    length: 64,
    comment: 'Original request ID for tracking' 
  })
  requestId: string;

  @Column({ 
    type: 'varchar',
    length: 20,
    default: 'sandbox',
    comment: 'Environment (sandbox/production)' 
  })
  environment: string;

  @Column({ 
    type: 'text',
    nullable: true,
    comment: 'Webhook URL for merchant notification' 
  })
  webhookUrl: string;

  @Column({ 
    type: 'jsonb',
    nullable: true,
    comment: 'Additional metadata' 
  })
  metadata: Record<string, any>;

  @Column({ 
    type: 'jsonb',
    nullable: true,
    comment: 'TSP raw response' 
  })
  tspResponse: Record<string, any>;

  @Column({ 
    type: 'int',
    default: 0,
    comment: 'Retry count for failed payouts' 
  })
  retryCount: number;

  @Column({ 
    type: 'timestamp',
    nullable: true,
    comment: 'Last retry attempt timestamp' 
  })
  lastRetryAt: Date;

  @Column({ 
    type: 'timestamp',
    nullable: true,
    comment: 'Next retry scheduled time' 
  })
  nextRetryAt: Date;

  @Column({ 
    type: 'int',
    nullable: true,
    comment: 'Response time from TSP in milliseconds' 
  })
  responseTime: number;
}

