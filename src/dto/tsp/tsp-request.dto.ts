import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsBoolean, IsEnum, IsOptional, IsObject, IsUrl, MaxLength } from 'class-validator';

/**
 * TSP configuration creation request
 */
export class CreateTSPConfigurationDto {
  @ApiProperty({
    example: 'stripe',
    description: 'TSP provider name',
    maxLength: 50
  })
  @IsString()
  @MaxLength(50)
  providerName: string;

  @ApiProperty({
    example: 'production',
    description: 'Environment configuration',
    enum: ['sandbox', 'production']
  })
  @IsEnum(['sandbox', 'production'])
  environment: string;

  @ApiProperty({
    example: true,
    description: 'Whether the TSP is active'
  })
  @IsBoolean()
  isActive: boolean;

  @ApiPropertyOptional({
    example: 'https://api.stripe.com',
    description: 'TSP API base URL'
  })
  @IsOptional()
  @IsUrl()
  baseUrl?: string;

  @ApiProperty({
    example: {
      secretKey: 'sk_live_***',
      publicKey: 'pk_live_***',
      webhookSecret: 'whsec_***'
    },
    description: 'TSP API credentials (will be encrypted)'
  })
  @IsObject()
  credentials: Record<string, any>;

  @ApiProperty({
    example: ['upi', 'credit_card', 'debit_card'],
    description: 'Supported payment methods',
    type: [String]
  })
  supportedPaymentMethods: string[];

  @ApiPropertyOptional({
    example: {
      transactionFee: 2.9,
      fixedFee: 0.30,
      currency: 'INR'
    },
    description: 'Fee structure configuration'
  })
  @IsOptional()
  @IsObject()
  feeStructure?: Record<string, any>;

  @ApiPropertyOptional({
    example: {
      timeout: 30000,
      retryAttempts: 3,
      backoffStrategy: 'exponential'
    },
    description: 'API configuration settings'
  })
  @IsOptional()
  @IsObject()
  apiConfig?: Record<string, any>;

  @ApiPropertyOptional({
    example: { region: 'india', priority: 1 },
    description: 'Additional metadata'
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}




