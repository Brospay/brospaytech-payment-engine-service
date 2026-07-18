import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsEnum, IsOptional, Min, IsObject } from 'class-validator';

export class TSPBalanceInfo {
  @ApiProperty({ description: 'TSP name', example: 'paytara' })
  tspName: string;

  @ApiProperty({ description: 'Available balance', example: 250000.00 })
  availableBalance: number;

  @ApiProperty({ description: 'Reserved balance', example: 50000.00 })
  reservedBalance: number;

  @ApiProperty({ description: 'Total balance', example: 300000.00 })
  totalBalance: number;

  @ApiPropertyOptional({ description: 'Account details' })
  accountDetails?: {
    virtualAccountId?: string;
    bankName?: string;
    accountNumber?: string;
  };
}

export class CreateMerchantSettlementDto {
  @ApiProperty({ description: 'Merchant ID', example: 'mer_db25ab2b28e6ebda' })
  @IsString()
  merchantId: string;

  @ApiProperty({ description: 'Settlement ID from wallet service', example: 'sett_123_1234567890' })
  @IsString()
  settlementId: string;

  @ApiProperty({ description: 'Settlement amount', example: 50000.00 })
  @IsNumber()
  @Min(100)
  amount: number;

  @ApiProperty({ description: 'Currency code', example: 'INR' })
  @IsString()
  currency: string;

  @ApiProperty({ description: 'Beneficiary account number', example: '1234567890' })
  @IsString()
  beneficiaryAccount: string;

  @ApiProperty({ description: 'Beneficiary IFSC code', example: 'HDFC0001234' })
  @IsString()
  beneficiaryIfsc: string;

  @ApiProperty({ description: 'Beneficiary name', example: 'ABC Merchants Pvt Ltd' })
  @IsString()
  beneficiaryName: string;

  @ApiProperty({ description: 'Settlement description', example: 'Weekly settlement' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ 
    description: 'Settlement type',
    enum: ['MANUAL', 'AUTO', 'ON_DEMAND'],
    example: 'MANUAL'
  })
  @IsEnum(['MANUAL', 'AUTO', 'ON_DEMAND'])
  type: string;

  @ApiProperty({ 
    description: 'Settlement priority',
    enum: ['HIGH', 'MEDIUM', 'LOW'],
    example: 'MEDIUM'
  })
  @IsEnum(['HIGH', 'MEDIUM', 'LOW'])
  @IsOptional()
  priority?: string;

  @ApiProperty({ 
    description: 'Available TSP balances for routing decision',
    type: [TSPBalanceInfo]
  })
  @IsOptional()
  tspBalances?: TSPBalanceInfo[];

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;

  @ApiProperty({ description: 'Request ID for tracing', example: 'REQ_123456' })
  @IsString()
  requestId: string;
}

export class SettlementRoutingDecision {
  @ApiProperty({ description: 'Selected TSP', example: 'paytara' })
  selectedTSP: string;

  @ApiProperty({ description: 'Routing confidence', example: 0.95 })
  confidence: number;

  @ApiProperty({ description: 'Routing score', example: 92.5 })
  score: number;

  @ApiProperty({ description: 'Routing reasoning', type: [String] })
  reasoning: string[];

  @ApiProperty({ description: 'TSP balance status' })
  tspBalanceStatus: {
    hasBalance: boolean;
    availableBalance: number;
    requiredAmount: number;
  };

  @ApiProperty({ description: 'Fallback chain', type: [String] })
  fallbackChain: string[];
}

export class MerchantSettlementResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'Settlement ID' })
  settlementId: string;

  @ApiProperty({ description: 'Status', example: 'PROCESSING' })
  status: string;

  @ApiProperty({ description: 'Selected TSP provider', example: 'paytara' })
  tspProvider: string;

  @ApiProperty({ description: 'External TSP transaction ID' })
  externalTransactionId?: string;

  @ApiProperty({ description: 'Amount transferred' })
  amount: number;

  @ApiProperty({ description: 'Currency' })
  currency: string;

  @ApiProperty({ description: 'Routing decision details' })
  routingDecision: SettlementRoutingDecision;

  @ApiProperty({ description: 'Estimated completion time' })
  estimatedCompletion?: string;

  @ApiProperty({ description: 'Error message if any' })
  errorMessage?: string;

  @ApiProperty({ description: 'Created timestamp' })
  createdAt: string;
}

export class GetSettlementStatusDto {
  @ApiProperty({ description: 'Settlement ID', example: 'sett_123_1234567890' })
  @IsString()
  settlementId: string;

  @ApiProperty({ description: 'Request ID for tracing', example: 'REQ_123456' })
  @IsString()
  @IsOptional()
  requestId?: string;
}

export class SettlementStatusResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'Settlement ID' })
  settlementId: string;

  @ApiProperty({ description: 'Status' })
  status: string;

  @ApiProperty({ description: 'Amount' })
  amount: number;

  @ApiProperty({ description: 'Currency' })
  currency: string;

  @ApiProperty({ description: 'TSP provider used' })
  tspProvider: string;

  @ApiProperty({ description: 'External transaction ID' })
  externalTransactionId?: string;

  @ApiPropertyOptional({ description: 'Failure reason' })
  failureReason?: string;

  @ApiPropertyOptional({ description: 'Completed timestamp' })
  completedAt?: string;

  @ApiProperty({ description: 'Error message if any' })
  errorMessage?: string;
}

