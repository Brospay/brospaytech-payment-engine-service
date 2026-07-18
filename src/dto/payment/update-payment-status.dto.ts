import { 
  IsString, 
  IsEnum, 
  IsOptional, 
  IsObject,
  MaxLength,
  MinLength
} from 'class-validator';
import { PaymentStatus } from '@/types/common';

export class UpdatePaymentStatusDto {
  @IsString()
  @MinLength(10)
  @MaxLength(64)
  intentId: string;

  @IsEnum(PaymentStatus)
  status: PaymentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  externalTransactionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  failureReason?: string;

  @IsOptional()
  @IsObject()
  tspResponse?: Record<string, any>;

  @IsOptional()
  @IsObject()
  fraudAssessment?: {
    riskScore: number;
    riskFactors: string[];
    recommendation: 'approve' | 'review' | 'decline';
  };

  @IsString()
  @MinLength(10)
  @MaxLength(64)
  requestId: string;
}

// Webhook status update DTO (for TSP callbacks)
export class WebhookStatusUpdateDto {
  @IsString()
  @MaxLength(100)
  tspProvider: string;

  @IsString()
  @MaxLength(100)
  externalTransactionId: string;

  @IsEnum(PaymentStatus)
  status: PaymentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  failureReason?: string;

  @IsOptional()
  @IsObject()
  tspResponse?: Record<string, any>;

  @IsString()
  signature: string;

  @IsString()
  timestamp: string;

  @IsOptional()
  @IsObject()
  additionalData?: Record<string, any>;
}

// Status query DTO
export class PaymentStatusQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  tspProvider?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  page?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  limit?: string;
}
