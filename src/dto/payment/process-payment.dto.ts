import { 
  IsString, 
  IsOptional, 
  IsObject,
  ValidateNested,
  MaxLength,
  MinLength,
  IsEmail,
  IsUrl
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Internal request interface for service layer
export interface ProcessPaymentRequest {
  intentId: string;
  paymentMethodDetails: PaymentMethodDetailsDto;
  customerDetails?: CustomerDetailsDto;
  merchantId: string;
  tspProvider?: string;
  environment?: string;
  metadata?: Record<string, any>;
}


/**
 * Address information for customer
 */
export class AddressDto {
  @ApiProperty({
    example: '123 Main Street',
    description: 'Street address',
    maxLength: 255
  })
  @IsString()
  @MaxLength(255)
  street: string;

  @ApiProperty({
    example: 'Mumbai',
    description: 'City name',
    maxLength: 100
  })
  @IsString()
  @MaxLength(100)
  city: string;

  @ApiProperty({
    example: 'Maharashtra',
    description: 'State/Province',
    maxLength: 100
  })
  @IsString()
  @MaxLength(100)
  state: string;

  @ApiProperty({
    example: 'IN',
    description: 'Country code (ISO 3166-1 alpha-2)',
    maxLength: 100
  })
  @IsString()
  @MaxLength(100)
  country: string;

  @ApiProperty({
    example: '400001',
    description: 'Postal/ZIP code',
    maxLength: 20
  })
  @IsString()
  @MaxLength(20)
  postalCode: string;
}
/**
 * Payment method details for processing payment
 */
export class PaymentMethodDetailsDto {
  @ApiProperty({
    example: 'upi',
    description: 'Type of payment method',
    enum: ['upi', 'credit_card', 'debit_card', 'net_banking', 'wallet'],
    maxLength: 50
  })
  @IsString()
  @MaxLength(50)
  type: string;

  @ApiPropertyOptional({
    example: '4111111111111111',
    description: 'Card number (masked after validation)',
    maxLength: 20
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  cardNumber?: string;

  @ApiPropertyOptional({
    example: '12',
    description: 'Card expiry month (MM)',
    maxLength: 2
  })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  expiryMonth?: string;

  @ApiPropertyOptional({
    example: '2025',
    description: 'Card expiry year (YYYY)',
    maxLength: 4
  })
  @IsOptional()
  @IsString()
  @MaxLength(4)
  expiryYear?: string;

  @ApiPropertyOptional({
    example: '123',
    description: 'Card CVV (will be encrypted)',
    maxLength: 4
  })
  @IsOptional()
  @IsString()
  @MaxLength(4)
  cvv?: string;

  @ApiPropertyOptional({
    example: 'John Doe',
    description: 'Cardholder name as on card',
    maxLength: 100
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  cardHolderName?: string;

  @ApiPropertyOptional({
    example: 'user@paytm',
    description: 'UPI ID for UPI payments',
    maxLength: 100
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  upiId?: string;

  @ApiPropertyOptional({
    example: 'HDFC0000001',
    description: 'Bank code for net banking',
    maxLength: 20
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  bankCode?: string;

  @ApiPropertyOptional({
    example: '1234567890',
    description: 'Account number (will be masked)',
    maxLength: 50
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  accountNumber?: string;

  @ApiPropertyOptional({
    example: 'HDFC0000001',
    description: 'IFSC code for bank transfer',
    maxLength: 20
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  ifscCode?: string;

  @ApiPropertyOptional({
    example: 'paytm',
    description: 'Wallet provider (paytm, phonepe, gpay)',
    maxLength: 50
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  walletProvider?: string;

  @ApiPropertyOptional({
    example: '+91-9876543210',
    description: 'Phone number linked to wallet',
    maxLength: 15
  })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  walletPhone?: string;
}

/**
 * Customer details for payment processing
 */
export class CustomerDetailsDto {
  @ApiProperty({
    example: 'John Doe',
    description: 'Full name of the customer',
    maxLength: 100
  })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({
    example: 'john.doe@example.com',
    description: 'Customer email address',
    maxLength: 255
  })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiPropertyOptional({
    example: '+91-9876543210',
    description: 'Customer phone number',
    maxLength: 15
  })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  phone?: string;

  @ApiPropertyOptional({
    description: 'Customer billing address'
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;
}



/**
 * Device information for fraud detection
 */
export class DeviceInfoDto {
  @ApiProperty({
    example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    description: 'Browser user agent string',
    maxLength: 1000
  })
  @IsString()
  @MaxLength(1000)
  userAgent: string;

  @ApiProperty({
    example: '203.192.12.34',
    description: 'Customer IP address',
    maxLength: 45
  })
  @IsString()
  @MaxLength(45)
  ipAddress: string;

  @ApiPropertyOptional({
    example: 'device_12345_abcdef',
    description: 'Unique device identifier',
    maxLength: 100
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceId?: string;

  @ApiPropertyOptional({
    example: 'fp_hash_abc123def456',
    description: 'Device fingerprint hash',
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fingerprint?: string;
}

/**
 * Main DTO for processing payment
 */
export class ProcessPaymentDto {
  @ApiProperty({
    example: 'pi_abc123def456',
    description: 'Payment intent ID to process',
    minLength: 10,
    maxLength: 64
  })
  @IsString()
  @MinLength(10)
  @MaxLength(64)
  intentId: string;

  @ApiProperty({
    description: 'Payment method details (card, UPI, wallet, etc.)'
  })
  @ValidateNested()
  @Type(() => PaymentMethodDetailsDto)
  paymentMethodDetails: PaymentMethodDetailsDto;

  @ApiProperty({
    description: 'Customer information for the payment'
  })
  @ValidateNested()
  @Type(() => CustomerDetailsDto)
  customerDetails: CustomerDetailsDto;

  @ApiPropertyOptional({
    description: 'Device information for fraud detection'
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  deviceInfo?: DeviceInfoDto;

  @ApiProperty({
    example: 'req_process_12345',
    description: 'Unique request ID for idempotency',
    minLength: 10,
    maxLength: 64
  })
  @IsString()
  @MinLength(10)
  @MaxLength(64)
  requestId: string;
}

// Internal processing request
export class ProcessPaymentInternalRequest extends ProcessPaymentDto {
  // Additional fields for internal processing
  merchantId?: number;
  selectedTSP?: string;
  routingOverride?: string;
  fraudCheckEnabled?: boolean;
  customProcessingRules?: Record<string, any>;
}
