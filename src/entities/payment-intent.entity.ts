import { 
  Entity, 
  Column, 
  Index, 
  OneToMany 
} from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('payment_intents')
@Index(['merchantId', 'createdAt'])           // Primary merchant query pattern
@Index(['status', 'updatedAt'])               // Status-based dashboard queries  
@Index(['intentId'], { unique: true })        // Unique intent lookup
@Index(['customerEmail', 'createdAt'])        // Customer transaction history
@Index(['amount', 'currency', 'createdAt'])   // Amount-based analytics
@Index(['expiresAt', 'status'])               // Expiration processing queries
@Index(['merchantId', 'status', 'createdAt']) // Ultra-fast merchant dashboard queries
@Index(['preferredPaymentMethod', 'currency', 'status']) // Payment method analytics
@Index(['customerId', 'status'])              // Customer payment status lookup
export class PaymentIntent extends BaseEntity {
  @Column({ 
    type: 'varchar', 
    length: 64, 
    unique: true,
    comment: 'Unique payment intent identifier'
  })
  intentId: string;

  @Column({ 
    type: 'varchar',
    length: 64,
    comment: 'Merchant ID reference' 
  })
  merchantId: string;

  @Column({ 
    type: 'varchar', 
    length: 128,
    nullable: true,
    comment: 'Customer unique identifier'
  })
  customerId?: string;

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
    comment: 'Customer email address'
  })
  customerEmail: string;

  @Column({ 
    type: 'varchar', 
    length: 100,
    nullable: true,
    comment: 'Customer phone number'
  })
  customerPhone?: string;

  @Column({ 
    type: 'decimal', 
    precision: 20, 
    scale: 8,
    comment: 'Payment amount (supports up to 8 decimals for cryptocurrencies)'
  })
  amount: number;

  @Column({ 
    type: 'varchar', 
    length: 10,
    default: 'INR',
    comment: 'Payment currency code (ISO 4217 for fiat, crypto codes like USDT, BTC)'
  })
  currency: string;

  @Column({ 
    type: 'varchar', 
    length: 500,
    nullable: true,
    comment: 'Payment description'
  })
  description?: string;

  @Column({ 
    type: 'enum',
    enum: ['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing', 'requires_capture', 'canceled', 'succeeded'],
    default: 'requires_payment_method',
    comment: 'Payment intent status'
  })
  status: 'requires_payment_method' | 'requires_confirmation' | 'requires_action' | 'processing' | 'requires_capture' | 'canceled' | 'succeeded';

  @Column({ 
    type: 'varchar', 
    length: 50,
    nullable: true,
    comment: 'Preferred payment method (upi, card, netbanking)'
  })
  preferredPaymentMethod?: string;

  @Column({ 
    type: 'varchar', 
    length: 10,
    nullable: true,
    comment: 'Preferred bank code'
  })
  preferredBankCode?: string;

  @Column({ 
    type: 'int',
    default: 0,
    comment: 'Number of transaction attempts for this intent'
  })
  attemptCount: number;

  @Column({ 
    type: 'decimal', 
    precision: 8, 
    scale: 4,
    default: 0,
    comment: 'Total processing fees across all attempts'
  })
  totalProcessingFees: number;

  @Column({ 
    type: 'varchar', 
    length: 500,
    nullable: true,
    comment: 'Payment URL for customer (from latest successful attempt)'
  })
  paymentUrl?: string;

  @Column({ 
    type: 'timestamptz',
    comment: 'When this payment intent expires',
    default: () => "CURRENT_TIMESTAMP + INTERVAL '15 minutes'"
  })
  expiresAt: Date;

  @Column({ 
    type: 'varchar', 
    length: 255,
    nullable: true,
    comment: 'Return URL after payment completion'
  })
  returnUrl?: string;

  @Column({ 
    type: 'varchar', 
    length: 255,
    nullable: true,
    comment: 'Webhook URL for payment status updates'
  })
  webhookUrl?: string;

  @Column({ 
    type: 'varchar', 
    length: 64,
    comment: 'Unique request correlation ID'
  })
  requestId: string;

  @Column({ 
    type: 'enum',
    enum: ['production', 'sandbox', 'development'],
    default: 'development',
    comment: 'Environment where payment was processed'
  })
  environment: 'production' | 'sandbox' | 'development';

  @Column({ 
    type: 'varchar', 
    length: 45,
    nullable: true,
    comment: 'Client IP address'
  })
  clientIpAddress?: string;

  @Column({ 
    type: 'varchar', 
    length: 500,
    nullable: true,
    comment: 'User agent string'
  })
  userAgent?: string;

  @Column({ 
    type: 'timestamptz',
    nullable: true,
    comment: 'Payment completion timestamp'
  })
  completedAt?: Date;

  @Column({ 
    type: 'timestamptz',
    nullable: true,
    comment: 'Payment failure timestamp'
  })
  failedAt?: Date;

  @Column({ 
    type: 'jsonb',
    nullable: true,
    comment: 'Additional metadata and tracking information'
  })
  metadata?: Record<string, any>;


  @OneToMany(() => require('./payment-transaction.entity').PaymentTransaction, 'intent')
  transactions?: any[];

  // Helper methods for transaction management
  getLatestTransaction(): any {
    return this.transactions?.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  }

  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  getSuccessfulTransaction(): any {
    return this.transactions?.find(t => t.status === 'success');
  }
}
