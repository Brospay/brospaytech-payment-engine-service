import { 
  IsString, 
  IsNumber, 
  IsEmail, 
  IsOptional, 
  IsEnum, 
  IsObject,
  IsPositive,
  MaxLength,
  MinLength,
  IsUrl,
  IsBoolean
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Currency, PaymentMethod, Environment } from '@/types/common';
import { ISO_COUNTRY_CODES, normalizeCountryCode } from '@/common/constants/countries';
import { IsIn } from 'class-validator';

/**
 * Enhanced Create Payment Intent DTO
 * Supports both legacy flow (customer details inline) and new flow (customerId only)
 */
export class CreatePaymentIntentDto {
  @ApiProperty({
    example: 'mer_db25ab2b28e6ebda',
    description: 'Merchant ID for the payment intent',
    maxLength: 64
  })
  @IsString()
  @IsOptional()
  @MaxLength(64)
  merchantId: string;

  @ApiPropertyOptional({
    example: 'cust_abc123',
    description: 'Existing customer ID (if using customer ID flow)',
    maxLength: 128
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  customerId?: string;

  @ApiPropertyOptional({
    example: 'john.doe@example.com',
    description: 'Customer email (required if customerId not provided)',
    maxLength: 255
  })
  // @IsOptional()
  @IsEmail()
  @MaxLength(255)
  customerEmail?: string;

  @ApiPropertyOptional({
    example: '+91-9876543210',
    description: 'Customer phone number',
    maxLength: 100
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerPhone?: string;

  @ApiPropertyOptional({
    example: 'John',
    description: 'Customer first name',
    maxLength: 100
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerFirstName?: string;

  @ApiPropertyOptional({
    example: 'Doe',
    description: 'Customer last name',
    maxLength: 100
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerLastName?: string;

  @ApiPropertyOptional({
    example: 'IN',
    description: 'Customer country code (ISO 3166-1 alpha-2)',
    maxLength: 2
  })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  @Transform(({ value }) => normalizeCountryCode(value))
  @IsIn(ISO_COUNTRY_CODES, { message: 'Invalid country code. Use ISO 3166-1 alpha-2 (e.g., US, IN, GB).' })
  customerCountry?: string;

  @ApiProperty({
    example: 100.50,
    description: 'Payment amount in the specified currency',
    minimum: 0.01
  })
  @IsNumber()
  @IsPositive()
  @Transform(({ value }) => parseFloat(value))
  amount: number;

  @ApiProperty({
    example: Currency.INR,
    description: 'Payment currency',
    enum: Currency
  })
  @IsEnum(Currency)
  currency: Currency;

  @ApiPropertyOptional({
    example: 'Payment for order #12345',
    description: 'Payment description',
    maxLength: 500
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    example: PaymentMethod.UPI,
    description: 'Preferred payment method',
    enum: PaymentMethod
  })
  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({
    example: 'HDFC',
    description: 'Customer preferred bank for net banking',
    maxLength: 20
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  customerBank?: string;

  @ApiPropertyOptional({
    example: 'https://merchant.com/payment-success',
    description: 'URL to redirect customer after payment completion',
    maxLength: 500
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  returnUrl?: string;


  @ApiPropertyOptional({
    example: { orderId: 'ORDER123', userId: 'USER456' },
    description: 'Additional metadata for the payment'
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiProperty({
    example: 'req_12345_67890',
    description: 'Unique request ID for idempotency',
    minLength: 10,
    maxLength: 64
  })
  @IsString()
  @MinLength(10)
  @IsOptional()
  @MaxLength(64)
  requestId: string;
  
}

// Internal request format for service layer
export class CreatePaymentIntentInternalRequest {
  merchantId: string;
  customerId?: string;
  customerEmail: string;
  customerPhone?: string;
  amount: number;
  currency: Currency;
  description?: string;
  paymentMethod: PaymentMethod;
  customerBank?: string;
  returnUrl?: string;
  webhookUrl?: string;
  metadata?: Record<string, any>;
  requestId: string;
  environment: Environment;
  
  // Additional context from routing
  selectedTSP?: string;
  routingDecision?: any;
  processingFee?: number;
}
