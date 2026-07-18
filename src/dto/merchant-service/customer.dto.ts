/**
 * Merchant Service Customer DTOs
 * Matches exact proto definitions for type safety
 */

import { IsString, IsNumber, IsOptional, IsArray, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Get Customer Details Request - matches proto exactly
 */
export class GetCustomerDetailsRequestDto {
  @ApiProperty({
    description: 'Customer ID',
    example: 'cust_1234567890'
  })
  @IsString()
  customer_id: string;

  @ApiProperty({
    description: 'Merchant ID',
    example: 'mer_db25ab2b28e6ebda'
  })
  @IsString()
  merchant_id: string;
}

/**
 * Customer Risk Profile - matches proto structure
 */
export class CustomerRiskProfileDto {
  @ApiProperty({
    description: 'Risk level',
    example: 'low',
    enum: ['low', 'medium', 'high', 'critical']
  })
  @IsString()
  risk_level: string;

  @ApiProperty({
    description: 'Risk score (0-100)',
    example: 25
  })
  @IsNumber()
  risk_score: number;

  @ApiProperty({
    description: 'Whether customer is blacklisted',
    example: false
  })
  @IsBoolean()
  is_blacklisted: boolean;

  @ApiPropertyOptional({
    description: 'Last risk check timestamp',
    example: '2024-01-20T10:30:00Z'
  })
  @IsOptional()
  @IsString()
  last_risk_check?: string;

  @ApiPropertyOptional({
    description: 'Risk factors array',
    example: ['first_time_customer', 'high_amount']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  risk_factors?: string[];
}

/**
 * Customer Data - matches proto GetCustomerDetailsResponse
 */
export class CustomerDataDto {
  @ApiProperty({
    description: 'Database ID',
    example: 123
  })
  @IsNumber()
  id: number;

  @ApiProperty({
    description: 'Customer ID',
    example: 'cust_1234567890'
  })
  @IsString()
  customer_id: string;

  @ApiProperty({
    description: 'Customer email',
    example: 'customer@example.com'
  })
  @IsString()
  email: string;

  @ApiProperty({
    description: 'Customer phone',
    example: '+919876543210'
  })
  @IsString()
  phone: string;

  @ApiProperty({
    description: 'Customer first name',
    example: 'John'
  })
  @IsString()
  first_name: string;

  @ApiPropertyOptional({
    description: 'Customer last name',
    example: 'Doe'
  })
  @IsOptional()
  @IsString()
  last_name?: string;

  @ApiPropertyOptional({
    description: 'Date of birth',
    example: '1990-01-15'
  })
  @IsOptional()
  @IsString()
  date_of_birth?: string;

  @ApiProperty({
    description: 'Country code',
    example: 'IN'
  })
  @IsString()
  country: string;

  @ApiPropertyOptional({
    description: 'IP address',
    example: '192.168.1.1'
  })
  @IsOptional()
  @IsString()
  ip_address?: string;

  @ApiPropertyOptional({
    description: 'Device fingerprint',
    example: 'fp_abc123def456'
  })
  @IsOptional()
  @IsString()
  device_fingerprint?: string;

  @ApiProperty({
    description: 'Customer status',
    example: 'active'
  })
  @IsString()
  status: string;

  @ApiPropertyOptional({
    description: 'Customer risk profile',
    type: CustomerRiskProfileDto
  })
  @IsOptional()
  risk_profile?: CustomerRiskProfileDto;

  @ApiProperty({
    description: 'Created timestamp',
    example: '2024-01-20T10:30:00Z'
  })
  @IsString()
  created_at: string;

  @ApiProperty({
    description: 'Updated timestamp',
    example: '2024-01-20T10:30:00Z'
  })
  @IsString()
  updated_at: string;

  // Additional fields from transaction analysis
  @ApiPropertyOptional({
    description: 'Total transaction amount',
    example: 50000.00
  })
  @IsOptional()
  @IsNumber()
  total_transaction_amount?: number;

  @ApiPropertyOptional({
    description: 'Total transaction count',
    example: 15
  })
  @IsOptional()
  @IsNumber()
  total_transaction_count?: number;

  @ApiPropertyOptional({
    description: 'Last transaction timestamp',
    example: '2024-01-20T10:30:00Z'
  })
  @IsOptional()
  @IsString()
  last_transaction_at?: string;
}

/**
 * Get Customer Details Response - matches proto exactly
 */
export class GetCustomerDetailsResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true
  })
  @IsBoolean()
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'Customer retrieved successfully'
  })
  @IsString()
  message: string;

  @ApiPropertyOptional({
    description: 'Customer data',
    type: CustomerDataDto
  })
  @IsOptional()
  customer?: CustomerDataDto;

  @ApiPropertyOptional({
    description: 'Error code if any',
    example: 'CUSTOMER_NOT_FOUND'
  })
  @IsOptional()
  @IsString()
  error_code?: string;
}

/**
 * Update Customer Risk Score Request - matches proto
 */
export class UpdateCustomerRiskScoreRequestDto {
  @ApiProperty({
    description: 'Customer ID',
    example: 'cust_1234567890'
  })
  @IsString()
  customer_id: string;

  @ApiProperty({
    description: 'Merchant ID',
    example: 'mer_db25ab2b28e6ebda'
  })
  @IsString()
  merchant_id: string;

  @ApiProperty({
    description: 'Risk score (0-100)',
    example: 75
  })
  @IsNumber()
  risk_score: number;

  @ApiProperty({
    description: 'Fraud flags array',
    example: ['velocity_exceeded', 'unusual_time']
  })
  @IsArray()
  @IsString({ each: true })
  fraud_flags: string[];
}

/**
 * Update Customer Risk Score Response - matches proto
 */
export class UpdateCustomerRiskScoreResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true
  })
  @IsBoolean()
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'Risk score updated successfully'
  })
  @IsString()
  message: string;
}

/**
 * Create Customer Request - matches proto for customer creation
 */
export class CreateCustomerRequestDto {
  @ApiProperty({
    description: 'Customer email',
    example: 'customer@example.com'
  })
  @IsString()
  email: string;

  @ApiPropertyOptional({
    description: 'Customer phone',
    example: '+919876543210'
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    description: 'First name',
    example: 'John'
  })
  @IsOptional()
  @IsString()
  first_name?: string;

  @ApiPropertyOptional({
    description: 'Last name',
    example: 'Doe'
  })
  @IsOptional()
  @IsString()
  last_name?: string;

  @ApiPropertyOptional({
    description: 'Date of birth',
    example: '1990-01-15'
  })
  @IsOptional()
  @IsString()
  date_of_birth?: string;

  @ApiProperty({
    description: 'Country code',
    example: 'IN'
  })
  @IsString()
  country: string;

  @ApiProperty({
    description: 'IP address',
    example: '192.168.1.1'
  })
  @IsString()
  ip_address: string;

  @ApiPropertyOptional({
    description: 'Device fingerprint',
    example: 'fp_abc123def456'
  })
  @IsOptional()
  @IsString()
  device_fingerprint?: string;

  @ApiProperty({
    description: 'Merchant ID',
    example: 'mer_db25ab2b28e6ebda'
  })
  @IsString()
  merchant_id: string;

  @ApiPropertyOptional({
    description: 'Additional metadata',
    example: { source: 'payment_engine', campaign: 'signup_2024' }
  })
  @IsOptional()
  metadata?: Record<string, string>;
}

/**
 * List Customers Request - for customer search
 */
export class ListCustomersRequestDto {
  @ApiProperty({
    description: 'Merchant ID',
    example: 'mer_db25ab2b28e6ebda'
  })
  @IsString()
  merchant_id: string;

  @ApiPropertyOptional({
    description: 'Page number',
    example: 1
  })
  @IsOptional()
  @IsNumber()
  page?: number;

  @ApiPropertyOptional({
    description: 'Results per page',
    example: 10
  })
  @IsOptional()
  @IsNumber()
  limit?: number;

  @ApiPropertyOptional({
    description: 'Search term (email, phone, name)',
    example: 'customer@example.com'
  })
  @IsOptional()
  @IsString()
  search_term?: string;

  @ApiPropertyOptional({
    description: 'Environment filter',
    example: 'production'
  })
  @IsOptional()
  @IsString()
  environment?: string;
}

/**
 * List Customers Response
 */
export class ListCustomersResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true
  })
  @IsBoolean()
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'Customers retrieved successfully'
  })
  @IsString()
  message: string;

  @ApiProperty({
    description: 'Customer array',
    type: [CustomerDataDto]
  })
  @IsArray()
  customers: CustomerDataDto[];

  @ApiProperty({
    description: 'Total results',
    example: 150
  })
  @IsNumber()
  total: number;

  @ApiProperty({
    description: 'Current page',
    example: 1
  })
  @IsNumber()
  page: number;

  @ApiProperty({
    description: 'Results per page',
    example: 10
  })
  @IsNumber()
  limit: number;
}

