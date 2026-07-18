import { ApiProperty } from '@nestjs/swagger';

/**
 * Payout Method Field Information
 * Describes what fields are required for each payout type
 */
export class PayoutMethodFieldDto {
  @ApiProperty({ example: 'beneficiaryAccount', description: 'Field name' })
  fieldName: string;

  @ApiProperty({ example: 'Beneficiary Account Number', description: 'Human-readable label' })
  label: string;

  @ApiProperty({ example: 'text', enum: ['text', 'number', 'email', 'tel', 'select'], description: 'Input type' })
  type: string;

  @ApiProperty({ example: true, description: 'Whether field is required' })
  required: boolean;

  @ApiProperty({ example: 'Enter bank account number', description: 'Placeholder text', required: false })
  placeholder?: string;

  @ApiProperty({ example: '^[0-9]{9,18}$', description: 'Validation regex pattern', required: false })
  pattern?: string;

  @ApiProperty({ example: 'Account number must be 9-18 digits', description: 'Validation error message', required: false })
  validationMessage?: string;

  @ApiProperty({ example: 9, description: 'Minimum length', required: false })
  minLength?: number;

  @ApiProperty({ example: 18, description: 'Maximum length', required: false })
  maxLength?: number;

  @ApiProperty({ 
    example: ['NEFT', 'RTGS', 'IMPS'], 
    description: 'Options for select fields', 
    required: false,
    type: [String]
  })
  options?: string[];
}

/**
 * Single Payout Method Information
 */
export class PayoutMethodDto {
  @ApiProperty({ example: 'bank_account', description: 'Payout method identifier' })
  methodId: string;

  @ApiProperty({ example: 'Bank Account Transfer', description: 'Display name' })
  displayName: string;

  @ApiProperty({ example: 'Standard bank account transfer via NEFT/RTGS/IMPS', description: 'Method description' })
  description: string;

  @ApiProperty({ example: ['INR', 'USD'], description: 'Supported currencies', type: [String] })
  supportedCurrencies: string[];

  @ApiProperty({ example: ['IN', 'US', 'GB'], description: 'Supported countries', type: [String] })
  supportedCountries: string[];

  @ApiProperty({ example: '2-24 hours', description: 'Estimated processing time' })
  estimatedTime: string;

  @ApiProperty({ example: 10, description: 'Minimum payout amount' })
  minAmount: number;

  @ApiProperty({ example: 1000000, description: 'Maximum payout amount' })
  maxAmount: number;

  @ApiProperty({ example: 0.2, description: 'Processing fee percentage' })
  feePercentage: number;

  @ApiProperty({ example: 5, description: 'Fixed processing fee' })
  fixedFee: number;

  @ApiProperty({ type: [PayoutMethodFieldDto], description: 'Required fields for this method' })
  requiredFields: PayoutMethodFieldDto[];

  @ApiProperty({ example: true, description: 'Whether this method is currently active' })
  isActive: boolean;
}

/**
 * Response for Get Available Payout Methods API
 */
export class GetPayoutMethodsResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Payout methods retrieved successfully' })
  message: string;

  @ApiProperty({ type: [PayoutMethodDto], description: 'List of available payout methods' })
  data: PayoutMethodDto[];

  @ApiProperty({ example: null, required: false })
  error: string | null;
}

