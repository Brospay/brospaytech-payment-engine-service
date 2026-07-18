import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseResponse } from '@/dto/common/response.dto';
import { Currency } from '@/types/common';

/**
 * Transaction data structure
 */
export class TransactionDto {
  @ApiProperty({
    example: 'txn_abc123def456',
    description: 'Unique transaction ID'
  })
  transactionId: string;

  @ApiProperty({
    example: 'pi_abc123def456',
    description: 'Associated payment intent ID'
  })
  intentId: string;

  @ApiProperty({
    example: 'mer_db25ab2b28e6ebda',
    description: 'Merchant ID'
  })
  merchantId: string;

  @ApiProperty({
    example: 100.50,
    description: 'Transaction amount'
  })
  amount: number;

  @ApiProperty({
    example: Currency.INR,
    description: 'Transaction currency',
    enum: Currency
  })
  currency: Currency;

  @ApiProperty({
    example: 'succeeded',
    description: 'Transaction status',
    enum: ['pending', 'processing', 'succeeded', 'failed', 'cancelled']
  })
  status: string;

  @ApiProperty({
    example: 'razorpay',
    description: 'Payment service provider'
  })
  tspProvider: string;

  @ApiPropertyOptional({
    example: 'ext_txn_789456',
    description: 'External transaction ID from TSP'
  })
  externalTransactionId?: string;

  @ApiProperty({
    example: 'upi',
    description: 'Payment method used',
    enum: ['upi', 'credit_card', 'debit_card', 'net_banking', 'wallet']
  })
  paymentMethod: string;

  @ApiPropertyOptional({
    example: 'Insufficient funds',
    description: 'Failure reason if transaction failed'
  })
  failureReason?: string;

  @ApiProperty({
    example: '2024-01-20T10:30:00.000Z',
    description: 'Transaction creation timestamp'
  })
  createdAt: string;

  @ApiPropertyOptional({
    example: '2024-01-20T10:32:30.000Z',
    description: 'Transaction completion timestamp'
  })
  completedAt?: string;

  @ApiProperty({
    example: 1250,
    description: 'Processing time in milliseconds'
  })
  processingTimeMs: number;

  @ApiPropertyOptional({
    example: { orderId: 'ORDER123', reference: 'REF456' },
    description: 'Additional transaction metadata'
  })
  metadata?: Record<string, any>;
}

/**
 * Response for getting transactions by intent
 */
export class GetTransactionsByIntentResponseDto extends BaseResponse<TransactionDto[]> {
  @ApiProperty({
    description: 'List of transactions for the payment intent',
    type: [TransactionDto]
  })
  data: TransactionDto[];
}

/**
 * Response for getting single transaction
 */
export class GetTransactionResponseDto extends BaseResponse<TransactionDto> {
  @ApiProperty({
    description: 'Transaction details',
    type: TransactionDto
  })
  data: TransactionDto;
}




