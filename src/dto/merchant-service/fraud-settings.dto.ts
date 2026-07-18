/**
 * Merchant Service Fraud Settings DTOs
 * Matches exact proto definitions for fraud management
 */

import { IsNumber, IsBoolean, IsOptional, ValidateNested, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * Risk Thresholds - matches proto RiskThresholds message
 */
export class RiskThresholdsDto {
  @ApiProperty({
    description: 'Low risk threshold (0-100)',
    example: 25
  })
  @IsNumber()
  low: number;

  @ApiProperty({
    description: 'Medium risk threshold (0-100)',
    example: 50
  })
  @IsNumber()
  medium: number;

  @ApiProperty({
    description: 'High risk threshold (0-100)',
    example: 75
  })
  @IsNumber()
  high: number;
}

/**
 * Get Merchant Fraud Settings Request - matches proto
 */
export class GetMerchantFraudSettingsRequestDto {
  @ApiProperty({
    description: 'Merchant ID',
    example: 'mer_db25ab2b28e6ebda'
  })
  @IsString()
  merchant_id: string;
}

/**
 * Merchant Fraud Settings Response - matches proto GetMerchantFraudSettingsResponse
 */
export class GetMerchantFraudSettingsResponseDto {
  @ApiProperty({
    description: 'Merchant ID',
    example: 'mer_db25ab2b28e6ebda'
  })
  @IsString()
  merchant_id: string;

  @ApiProperty({
    description: 'Maximum amount per transaction in paisa',
    example: 10000000
  })
  @IsNumber()
  max_amount_per_transaction: number;

  @ApiProperty({
    description: 'Maximum amount per day in paisa',
    example: 50000000
  })
  @IsNumber()
  max_amount_per_day: number;

  @ApiProperty({
    description: 'Maximum transactions per hour',
    example: 10
  })
  @IsNumber()
  max_transactions_per_hour: number;

  @ApiProperty({
    description: 'Enable velocity checks',
    example: true
  })
  @IsBoolean()
  enable_velocity_checks: boolean;

  @ApiProperty({
    description: 'Enable device fingerprinting',
    example: true
  })
  @IsBoolean()
  enable_device_fingerprinting: boolean;

  @ApiProperty({
    description: 'Risk thresholds configuration',
    type: RiskThresholdsDto
  })
  @ValidateNested()
  @Type(() => RiskThresholdsDto)
  risk_thresholds: RiskThresholdsDto;
}

/**
 * Merchant Validation Request - matches proto
 */
export class ValidateMerchantRequestDto {
  @ApiProperty({
    description: 'Merchant ID',
    example: 'mer_db25ab2b28e6ebda'
  })
  @IsString()
  merchant_id: string;

  @ApiProperty({
    description: 'API key',
    example: 'ak_live_1234567890abcdef'
  })
  api_key: string;

  @ApiProperty({
    description: 'HMAC signature',
    example: 'sha256=abc123def456...'
  })
  signature: string;

  @ApiProperty({
    description: 'Unix timestamp',
    example: 1642694400
  })
  @IsNumber()
  timestamp: number;
}

/**
 * Merchant Validation Response - matches proto
 */
export class ValidateMerchantResponseDto {
  @ApiProperty({
    description: 'Whether merchant is valid',
    example: true
  })
  @IsBoolean()
  is_valid: boolean;

  @ApiPropertyOptional({
    description: 'Error message if invalid',
    example: 'Invalid signature'
  })
  @IsOptional()
  error_message?: string;

  @ApiPropertyOptional({
    description: 'Merchant details if valid'
  })
  @IsOptional()
  merchant_details?: {
    merchant_id: number;
    business_name: string;
    status: string;
    environment: string;
  };
}

/**
 * Get Merchant Settings Request
 */
export class GetMerchantSettingsRequestDto {
  @ApiProperty({
    description: 'Merchant ID',
    example: 'mer_db25ab2b28e6ebda'
  })
  @IsString()
  merchant_id: string;
}

/**
 * Merchant Settings Response
 */
export class GetMerchantSettingsResponseDto {
  @ApiProperty({
    description: 'Merchant ID',
    example: 'mer_db25ab2b28e6ebda'
  })
  @IsString()
  merchant_id: string;

  @ApiProperty({
    description: 'Business name',
    example: 'Acme Corp'
  })
  business_name: string;

  @ApiProperty({
    description: 'Merchant status',
    example: 'active'
  })
  status: string;

  @ApiProperty({
    description: 'Environment',
    example: 'production'
  })
  environment: string;

  @ApiProperty({
    description: 'Webhook URL',
    example: 'https://merchant.com/webhook'
  })
  webhook_url: string;

  @ApiProperty({
    description: 'Webhook secret',
    example: 'whsec_1234567890abcdef'
  })
  webhook_secret: string;

  @ApiProperty({
    description: 'Whether webhook is active',
    example: true
  })
  @IsBoolean()
  webhook_active: boolean;

  @ApiProperty({
    description: 'Webhook retry attempts',
    example: 3
  })
  @IsNumber()
  webhook_retry_attempts: number;

  @ApiProperty({
    description: 'Webhook timeout in milliseconds',
    example: 30000
  })
  @IsNumber()
  webhook_timeout_ms: number;

  @ApiProperty({
    description: 'Fraud settings',
    type: GetMerchantFraudSettingsResponseDto
  })
  @ValidateNested()
  @Type(() => GetMerchantFraudSettingsResponseDto)
  fraud_settings: GetMerchantFraudSettingsResponseDto;
}

