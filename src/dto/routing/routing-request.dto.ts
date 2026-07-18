import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsEnum, IsOptional, IsPositive, IsEmail, MaxLength } from 'class-validator';
import { Currency, Environment } from '@/types/common';

/**
 * Routing decision request DTO
 */
export class RoutingDecisionRequestDto {
  @ApiProperty({
    example: 'mer_db25ab2b28e6ebda',
    description: 'Merchant ID for routing decision',
    maxLength: 64
  })
  @IsString()
  @MaxLength(64)
  merchantId: string;

  @ApiProperty({
    example: 100.50,
    description: 'Payment amount',
    minimum: 0.01
  })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({
    example: Currency.INR,
    description: 'Payment currency',
    enum: Currency
  })
  @IsEnum(Currency)
  currency: Currency;

  @ApiProperty({
    example: 'upi',
    description: 'Preferred payment method',
    enum: ['upi', 'credit_card', 'debit_card', 'net_banking', 'wallet']
  })
  @IsString()
  paymentMethod: string;

  @ApiProperty({
    example: Environment.PRODUCTION,
    description: 'Environment for routing',
    enum: Environment
  })
  @IsEnum(Environment)
  environment: Environment;

  @ApiPropertyOptional({
    example: 'john.doe@example.com',
    description: 'Customer email for routing factors'
  })
  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @ApiPropertyOptional({
    example: 'HDFC',
    description: 'Preferred bank for net banking'
  })
  @IsOptional()
  @IsString()
  preferredBank?: string;

  @ApiPropertyOptional({
    example: 'IN',
    description: 'Customer country code'
  })
  @IsOptional()
  @IsString()
  customerCountry?: string;

  @ApiPropertyOptional({
    example: 'high',
    description: 'Customer risk level',
    enum: ['low', 'medium', 'high']
  })
  @IsOptional()
  @IsString()
  riskLevel?: 'low' | 'medium' | 'high';

  @ApiPropertyOptional({
    example: { orderId: 'ORDER123', priority: 'high' },
    description: 'Additional routing context'
  })
  @IsOptional()
  metadata?: Record<string, any>;
}




