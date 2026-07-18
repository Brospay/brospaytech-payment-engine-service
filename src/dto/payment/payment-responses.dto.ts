import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Currency } from '@/types/common';
import { BaseResponse } from '@/dto/common/response.dto';

/**
 * Payment Intent response data
 */
export class PaymentIntentResponseDto {
  @ApiProperty({
    example: 'pi_abc123def456',
    description: 'Unique payment intent ID'
  })
  intentId: string;

  @ApiProperty({
    example: 'mer_db25ab2b28e6ebda',
    description: 'Merchant ID'
  })
  merchantId: string;

  @ApiPropertyOptional({
    example: 'cust_abc123',
    description: 'Customer ID (if resolved)'
  })
  customerId?: string;

  @ApiProperty({
    example: 100.50,
    description: 'Payment amount'
  })
  amount: number;

  @ApiProperty({
    example: Currency.INR,
    description: 'Payment currency',
    enum: Currency
  })
  currency: Currency;

  @ApiProperty({
    example: 'pending',
    description: 'Current payment status',
    enum: ['pending', 'processing', 'succeeded', 'failed', 'cancelled', 'expired']
  })
  status: string;

  // @ApiProperty({
  //   example: 'razorpay',
  //   description: 'Selected payment service provider'
  // })
  // selectedTSP: string;

  @ApiPropertyOptional({
    example: 'Payment for order #12345',
    description: 'Payment description'
  })
  description?: string;

  @ApiProperty({
    example: '2024-01-20T11:00:00.000Z',
    description: 'When payment intent expires'
  })
  expiresAt: Date;

  @ApiPropertyOptional({
    example: 30000,
    description: 'Estimated completion time in milliseconds'
  })
  estimatedCompletionTime?: number;

  @ApiProperty({
    example: 2.50,
    description: 'Processing fee amount'
  })
  processingFee: number;

  @ApiProperty({
    example: '2024-01-20T10:30:00.000Z',
    description: 'When payment intent was created'
  })
  createdAt: Date;

  @ApiPropertyOptional({
    example: { orderId: 'ORDER123', userId: 'USER456' },
    description: 'Additional metadata'
  })
  metadata?: Record<string, any>;

  @ApiPropertyOptional({
    example: 'https://pay.valorapays.com/pay/pi_abc123def456?token=tok_xyz789',
    description: 'Payment page URL for customer redirection'
  })
  paymentPageUrl?: string;

  // @ApiPropertyOptional({
  //   description: 'Smart routing decision details'
  // })
  // routingDecision?: {
  //   selectedProvider: string;
  //   reason: string;
  //   alternativeProviders: string[];
  //   routingScore: number;
  //   estimatedSuccessRate: number;
  // };
}

/**
 * Payment processing response data
 */
export class PaymentResultResponseDto {
  @ApiProperty({
    example: 'pi_abc123def456',
    description: 'Payment intent ID'
  })
  intentId: string;

  @ApiPropertyOptional({
    example: 'txn_ext_789456',
    description: 'External transaction ID from TSP'
  })
  externalTransactionId?: string;

  @ApiProperty({
    example: 'processing',
    description: 'Current payment status',
    enum: ['processing', 'succeeded', 'failed', 'pending_confirmation']
  })
  status: string;

  @ApiProperty({
    example: 100.50,
    description: 'Payment amount'
  })
  amount: number;

  @ApiProperty({
    example: Currency.INR,
    description: 'Payment currency',
    enum: Currency
  })
  currency: Currency;

  @ApiProperty({
    example: 1250,
    description: 'Processing time in milliseconds'
  })
  processingTimeMs: number;

  @ApiProperty({
    example: 'razorpay',
    description: 'Payment service provider used'
  })
  tspProvider: string;

  @ApiPropertyOptional({
    description: 'TSP response details (filtered for security)'
  })
  tspResponse?: {
    transactionId?: string;
    gatewayTransactionId?: string;
    bankTransactionId?: string;
    paymentUrl?: string;
    qrCode?: string;
  };

  @ApiPropertyOptional({
    example: 'Insufficient funds',
    description: 'Failure reason if payment failed'
  })
  failureReason?: string;

  @ApiPropertyOptional({
    example: '2024-01-20T10:32:30.000Z',
    description: 'When payment was completed'
  })
  completedAt?: Date;

  @ApiPropertyOptional({
    example: 'https://pay.razorpay.com/redirect?token=abc123',
    description: 'Redirect URL for 3D Secure or other confirmations'
  })
  redirectUrl?: string;

  @ApiPropertyOptional({
    description: 'Next steps for payment completion'
  })
  nextSteps?: {
    action: 'redirect' | 'poll' | 'wait' | 'none';
    url?: string;
    pollInterval?: number;
    expiresAt?: Date;
    instructions?: string;
  };
}

/**
 * Payment status response data
 */
export class PaymentStatusResponseDto {
  @ApiProperty({
    example: 'pi_abc123def456',
    description: 'Payment intent ID'
  })
  intentId: string;

  @ApiProperty({
    example: 'succeeded',
    description: 'Current payment status',
    enum: ['pending', 'processing', 'succeeded', 'failed', 'cancelled', 'expired']
  })
  status: string;

  @ApiProperty({
    example: 100.50,
    description: 'Payment amount'
  })
  amount: number;

  @ApiProperty({
    example: Currency.INR,
    description: 'Payment currency',
    enum: Currency
  })
  currency: Currency;

  @ApiPropertyOptional({
    example: 'txn_abc123def456',
    description: 'Internal transaction ID'
  })
  transactionId?: string;

  @ApiPropertyOptional({
    example: 'txn_ext_789456',
    description: 'External transaction ID'
  })
  externalTransactionId?: string;

  @ApiProperty({
    example: 'razorpay',
    description: 'Payment service provider'
  })
  tspProvider: string;

  @ApiProperty({
    example: '2024-01-20T10:30:00.000Z',
    description: 'When payment was created'
  })
  createdAt: Date;

  @ApiPropertyOptional({
    example: '2024-01-20T10:32:30.000Z',
    description: 'When payment was completed'
  })
  completedAt?: Date;

  @ApiPropertyOptional({
    example: 'Insufficient funds',
    description: 'Failure reason if applicable'
  })
  failureReason?: string;

  @ApiPropertyOptional({
    description: 'Payment timeline events'
  })
  events?: Array<{
    event: string;
    timestamp: Date;
    description?: string;
  }>;

  @ApiPropertyOptional({
    description: 'Additional payment metadata'
  })
  metadata?: Record<string, any>;
}

/**
 * Typed response wrappers for each endpoint
 */
export class CreatePaymentIntentResponseDto extends BaseResponse<PaymentIntentResponseDto> {
  @ApiProperty({
    description: 'Payment intent details'
  })
  @Type(() => PaymentIntentResponseDto)
  data: PaymentIntentResponseDto;
}

export class ProcessPaymentResponseDto extends BaseResponse<PaymentResultResponseDto> {
  @ApiProperty({
    description: 'Payment processing result'
  })
  @Type(() => PaymentResultResponseDto)
  data: PaymentResultResponseDto;
}

export class GetPaymentStatusResponseDto extends BaseResponse<PaymentStatusResponseDto> {
  @ApiProperty({
    description: 'Payment status details'
  })
  @Type(() => PaymentStatusResponseDto)
  data: PaymentStatusResponseDto;
}
