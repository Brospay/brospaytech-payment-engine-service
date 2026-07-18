import { IsString, IsNumber, IsEnum, IsOptional, IsObject, Min, Matches, IsNotEmpty, Length } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { PayoutStatus, PayoutType } from '../../entities/payout.entity';

export class CreatePayoutDto {
  @ApiProperty({ description: 'Merchant ID (auto-filled from auth)', example: 'mer_123456', required: false })
  @IsOptional()
  @IsString()
  merchantId?: string;

  @ApiProperty({ description: 'Customer ID (for tracking)', example: 'cust_123456', required: false })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty({ description: 'Customer email', example: 'customer@example.com', required: false })
  @IsOptional()
  @IsString()
  customerEmail?: string;

  @ApiProperty({ description: 'Customer phone', example: '+919876543210', required: false })
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiProperty({ description: 'Country code (ISO 3166-1 alpha-2)', example: 'IN', required: false })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;

  @ApiProperty({ description: 'Beneficiary account number', example: '1234567890' })
  @IsString()
  @IsNotEmpty()
  @Length(5, 100)
  beneficiaryAccount: string;

  @ApiProperty({ description: 'IBAN (for EU/international)', example: 'DE89370400440532013000', required: false })
  @IsOptional()
  @IsString()
  @Length(15, 34)
  beneficiaryIban?: string;

  @ApiProperty({ description: 'IFSC code (for Indian banks)', example: 'HDFC0000123', required: false })
  @IsOptional()
  @IsString()
  @Length(5, 20)
  beneficiaryIfsc?: string;

  @ApiProperty({ description: 'SWIFT/BIC code (for international)', example: 'HDFCINBB', required: false })
  @IsOptional()
  @IsString()
  @Length(8, 11)
  beneficiarySwift?: string;

  @ApiProperty({ description: 'BIC code (alternative to SWIFT)', example: 'COBADEFFXXX', required: false })
  @IsOptional()
  @IsString()
  @Length(8, 11)
  beneficiaryBic?: string;

  @ApiProperty({ description: 'Routing number (for US banks)', example: '021000021', required: false })
  @IsOptional()
  @IsString()
  @Length(9, 9)
  beneficiaryRoutingNumber?: string;

  @ApiProperty({ description: 'Account holder name', example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  @Length(2, 200)
  beneficiaryName: string;

  @ApiProperty({ description: 'Beneficiary email', example: 'beneficiary@example.com', required: false })
  @IsOptional()
  @IsString()
  beneficiaryEmail?: string;

  @ApiProperty({ description: 'Beneficiary mobile number', example: '+919876543210', required: false })
  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'Invalid mobile number format (E.164)' })
  beneficiaryMobile?: string;

  @ApiProperty({ description: 'Beneficiary address', example: '123 Main St', required: false })
  @IsOptional()
  @IsString()
  beneficiaryAddress?: string;

  @ApiProperty({ description: 'Beneficiary city', example: 'New York', required: false })
  @IsOptional()
  @IsString()
  beneficiaryCity?: string;

  @ApiProperty({ description: 'Beneficiary state/region', example: 'NY', required: false })
  @IsOptional()
  @IsString()
  beneficiaryState?: string;

  @ApiProperty({ description: 'Beneficiary postal code', example: '10001', required: false })
  @IsOptional()
  @IsString()
  beneficiaryPostalCode?: string;

  @ApiProperty({ description: 'Beneficiary document ID (CPF/CNPJ for Brazil, DNI/CUIT for Argentina, etc.)', example: '12345678900', required: false })
  @IsOptional()
  @IsString()
  beneficiaryDocumentId?: string;

  @ApiProperty({ description: 'Customer document ID (fallback if beneficiary document not provided)', example: '12345678900', required: false })
  @IsOptional()
  @IsString()
  customerDocumentId?: string;

  @ApiProperty({ description: 'UPI VPA (for UPI payouts)', example: 'user@paytm', required: false })
  @IsOptional()
  @IsString()
  beneficiaryVpa?: string;

  @ApiProperty({ description: 'Bank name', example: 'HDFC Bank', required: false })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiProperty({ description: 'Beneficiary bank name (alternative)', example: 'Commerzbank AG', required: false })
  @IsOptional()
  @IsString()
  beneficiaryBankName?: string;

  @ApiProperty({ description: 'Beneficiary bank code (required for certain providers)', example: 'YESB', required: false })
  @IsOptional()
  @IsString()
  @Length(2, 32)
  beneficiaryBankCode?: string;

  @ApiProperty({ description: 'Account type', example: 'CHECKING', enum: ['CHECKING', 'SAVINGS', 'CURRENT'], required: false })
  @IsOptional()
  @IsString()
  beneficiaryAccountType?: string;

  @ApiProperty({ description: 'Crypto wallet tag/memo', example: '123456', required: false })
  @IsOptional()
  @IsString()
  beneficiaryTag?: string;

  @ApiProperty({ description: 'Crypto wallet memo (alternative to tag)', example: '123456', required: false })
  @IsOptional()
  @IsString()
  beneficiaryMemo?: string;

  @ApiProperty({ description: 'Payout amount', example: 5000.00 })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiProperty({ description: 'Currency code', example: 'INR', default: 'INR' })
  @IsString()
  @IsOptional()
  @Length(3, 3)
  currency?: string;

  @ApiProperty({ description: 'Payout type', enum: PayoutType, example: PayoutType.IMPS })
  @IsEnum(PayoutType)
  payoutType: PayoutType;

  @ApiProperty({ description: 'Purpose of payout', example: 'PAYOUT', required: false, default: 'PAYOUT' })
  @IsOptional()
  @IsString()
  @Length(2, 200)
  purpose?: string;

  @ApiProperty({ description: 'Additional description', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Webhook URL for notification', required: false })
  @IsOptional()
  @IsString()
  webhookUrl?: string;

  @ApiProperty({ description: 'Additional metadata', required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiProperty({ description: 'Request ID for tracking (auto-filled)', example: 'req_123456', required: false })
  @IsOptional()
  @IsString()
  requestId?: string;

  @ApiProperty({ description: 'Environment', example: 'sandbox', default: 'sandbox' })
  @IsString()
  @IsOptional()
  environment?: string;
}

export class PayoutResponseDto {
  @ApiProperty()
  payoutId: string;

  @ApiProperty()
  merchantId: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  currency: string;

  @ApiProperty({ enum: PayoutStatus })
  status: PayoutStatus;

  @ApiProperty()
  tspProvider: string;

  @ApiProperty()
  externalPayoutId: string;

  @ApiProperty()
  processingFee: number;

  @ApiProperty()
  totalDebitedAmount: number;

  @ApiProperty()
  estimatedCompletion: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ required: false })
  metadata?: Record<string, any>;
}

export class GetPayoutStatusDto {
  @ApiProperty({ description: 'Payout ID', example: 'payout_123456' })
  @IsString()
  @IsNotEmpty()
  payoutId: string;

  @ApiProperty({ description: 'Request ID for tracking', example: 'req_123456' })
  @IsString()
  @IsNotEmpty()
  requestId: string;
}

export class PayoutStatusResponseDto {
  @ApiProperty()
  payoutId: string;

  @ApiProperty()
  merchantId: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  currency: string;

  @ApiProperty({ enum: PayoutStatus })
  status: PayoutStatus;

  @ApiProperty()
  tspProvider: string;

  @ApiProperty()
  externalPayoutId: string;

  @ApiProperty()
  bankReferenceNumber: string;

  @ApiProperty()
  processingFee: number;

  @ApiProperty()
  failureReason: string;

  @ApiProperty()
  completedAt: Date;

  @ApiProperty()
  createdAt: Date;
}

export class ListPayoutsDto {
  @ApiProperty({ description: 'Merchant ID', example: 1 })
  @IsNumber()
  @Min(1)
  merchantId: number;

  @ApiProperty({ description: 'Filter by status', enum: PayoutStatus, required: false })
  @IsOptional()
  @IsEnum(PayoutStatus)
  status?: PayoutStatus;

  @ApiProperty({ description: 'Filter by currency', example: 'INR', required: false })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ description: 'Filter by payout type', example: 'BANK_TRANSFER', required: false })
  @IsOptional()
  @IsString()
  payoutType?: string;

  @ApiProperty({ description: 'Filter by TSP provider', example: 'paytara', required: false })
  @IsOptional()
  @IsString()
  tspProvider?: string;

  @ApiProperty({ description: 'Start date (ISO format)', required: false })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiProperty({ description: 'End date (ISO format)', required: false })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiProperty({ description: 'Minimum amount', example: 100, required: false })
  @IsOptional()
  @IsNumber()
  minAmount?: number;

  @ApiProperty({ description: 'Maximum amount', example: 10000, required: false })
  @IsOptional()
  @IsNumber()
  maxAmount?: number;

  @ApiProperty({ description: 'Filter by customer ID', example: 'cust_123456', required: false })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty({ description: 'Page number', example: 1, default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiProperty({ description: 'Items per page', example: 20, default: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;
}

export class RetryPayoutDto {
  @ApiProperty({ description: 'Payout ID to retry', example: 'payout_123456' })
  @IsString()
  @IsNotEmpty()
  payoutId: string;

  @ApiProperty({ description: 'Force use specific TSP', example: 'kingdom_bank', required: false })
  @IsOptional()
  @IsString()
  forceTsp?: string;

  @ApiProperty({ description: 'Request ID for tracking', example: 'req_123456' })
  @IsString()
  @IsNotEmpty()
  requestId: string;
}

