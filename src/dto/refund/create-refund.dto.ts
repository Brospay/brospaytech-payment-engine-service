import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRefundDto {
  @ApiProperty({
    example: 'cust_abc123def456',
    description: 'Customer ID who will receive the refund',
    maxLength: 128
  })
  @IsString()
  @MaxLength(128)
  customerId: string;

  @ApiProperty({
    example: 'txn_xyz789abc123',
    description: 'Transaction ID to be refunded',
    maxLength: 64
  })
  @IsString()
  @MaxLength(64)
  transactionId: string;

  @ApiPropertyOptional({
    example: 'Customer requested refund',
    description: 'Reason for refund',
    maxLength: 500
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiProperty({
    example: 'req_unique_12345',
    description: 'Unique request ID for idempotency',
    maxLength: 64
  })
  @IsString()
  @MaxLength(64)
  requestId: string;
}



