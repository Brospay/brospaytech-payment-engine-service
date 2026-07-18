import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Payout } from './payout.entity';

export enum BatchPayoutStatus {
  UPLOADED = 'uploaded',
  VALIDATING = 'validating',
  VALIDATION_FAILED = 'validation_failed',
  VALIDATED = 'validated',
  PROCESSING = 'processing',
  PARTIALLY_COMPLETED = 'partially_completed',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

@Entity('batch_payouts')
@Index(['merchant_id', 'created_at'])
@Index(['status'])
export class BatchPayout {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  batch_id: string;

  @Column({ type: 'varchar', length: 255 })
  @Index()
  merchant_id: string;

  @Column({ type: 'varchar', length: 255 })
  file_name: string;

  @Column({ type: 'varchar', length: 50 })
  file_type: string; // csv, xlsx, xls

  @Column({ type: 'int' })
  file_size: number; // in bytes

  @Column({ type: 'varchar', length: 500, nullable: true })
  file_path: string; // S3/storage path

  @Column({ type: 'int' })
  total_payouts: number;

  @Column({ type: 'int', default: 0 })
  successful_payouts: number;

  @Column({ type: 'int', default: 0 })
  failed_payouts: number;

  @Column({ type: 'int', default: 0 })
  pending_payouts: number;

  @Column({ type: 'decimal', precision: 30, scale: 8 })
  total_amount: number;

  @Column({ type: 'varchar', length: 10 })
  currency: string;

  @Column({ type: 'decimal', precision: 30, scale: 8, default: 0 })
  total_fees: number;

  @Column({ type: 'decimal', precision: 30, scale: 8, default: 0 })
  total_debited_amount: number; // total_amount + total_fees

  @Column({
    type: 'enum',
    enum: BatchPayoutStatus,
    default: BatchPayoutStatus.UPLOADED,
  })
  status: BatchPayoutStatus;

  @Column({ type: 'jsonb', nullable: true })
  validation_errors: any[]; // Array of validation errors

  @Column({ type: 'jsonb', nullable: true })
  processing_stats: {
    started_at?: string;
    completed_at?: string;
    processing_time_ms?: number;
    success_rate?: number;
  };

  @Column({ type: 'text', nullable: true })
  failure_reason: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  webhook_url: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ type: 'varchar', length: 255, nullable: true })
  created_by: string; // User ID who uploaded

  @Column({ type: 'varchar', length: 255, nullable: true })
  approved_by: string; // For approval workflow (optional)

  @Column({ type: 'timestamp', nullable: true })
  approved_at: Date;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;

  // Relation to individual payouts
  @OneToMany(() => Payout, (payout) => payout.batch_payout)
  payouts: Payout[];
}


