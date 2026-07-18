import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseResponse } from '../common/response.dto';

export class RefundDto {
  @ApiProperty({
    example: 'refund_abc123def456',
    description: 'Unique refund identifier'
  })
  refundId: string;

  @ApiProperty({
    example: 'mer_db25ab2b28e6ebda',
    description: 'Merchant ID'
  })
  merchantId: string;

  @ApiProperty({
    example: 'cust_abc123',
    description: 'Customer ID'
  })
  customerId: string;

  @ApiProperty({
    example: 'txn_xyz789',
    description: 'Original transaction ID'
  })
  transactionId: string;

  @ApiProperty({
    example: 'pi_abc123',
    description: 'Payment intent ID'
  })
  paymentIntentId: string;

  @ApiProperty({
    example: 100.50,
    description: 'Refund amount'
  })
  amount: number;

  @ApiProperty({
    example: 100.50,
    description: 'Original transaction amount'
  })
  originalAmount: number;

  @ApiProperty({
    example: 'INR',
    description: 'Currency code'
  })
  currency: string;

  @ApiProperty({
    example: 'full',
    description: 'Refund type',
    enum: ['full', 'partial']
  })
  refundType: string;

  @ApiProperty({
    example: 'completed',
    description: 'Refund status',
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled']
  })
  status: string;

  @ApiProperty({
    example: 'razorpay',
    description: 'TSP provider'
  })
  tspProvider: string;

  @ApiPropertyOptional({
    example: 'rfnd_xyz123',
    description: 'External refund ID from TSP'
  })
  externalRefundId?: string;

  @ApiPropertyOptional({
    example: 'Customer requested',
    description: 'Reason for refund'
  })
  reason?: string;

  @ApiProperty({
    example: '2024-01-20T10:30:00.000Z',
    description: 'Refund creation timestamp'
  })
  createdAt: string;

  @ApiPropertyOptional({
    example: '2024-01-20T10:32:30.000Z',
    description: 'Refund completion timestamp'
  })
  completedAt?: string;

  @ApiPropertyOptional({
    example: 'Insufficient funds',
    description: 'Failure reason if refund failed'
  })
  failureReason?: string;

  @ApiPropertyOptional({
    example: 1250,
    description: 'Processing time in milliseconds'
  })
  processingTimeMs?: number;
}

export class CreateRefundResponseDto extends BaseResponse<RefundDto> {}

export class GetRefundResponseDto extends BaseResponse<RefundDto> {}

export class ListRefundsResponseDto extends BaseResponse<{
  refunds: RefundDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> {}

