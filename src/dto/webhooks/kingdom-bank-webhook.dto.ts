import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsString, IsOptional, IsBoolean, IsEnum, IsObject, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Kingdom Bank Webhook Notification DTO
 * Based on Kingdom Bank OpenAPI Specification v0.0.1
 */

export class KingdomBankNotificationErrorDto {
  @ApiProperty({
    example: 21002,
    description: 'Numeric error code'
  })
  @IsNumber()
  code: number;

  @ApiProperty({
    example: 'Payment cancelled by the customer',
    description: 'Text of the error message'
  })
  @IsString()
  message: string;
}

export class KingdomBankFeeDto {
  @ApiProperty({
    example: 'Per transaction fee - Percentage',
    description: 'Type of fee applied to this transaction'
  })
  @IsString()
  feeType: string;

  @ApiProperty({
    example: 0.12,
    description: 'Amount charged as fee'
  })
  @IsNumber()
  amount: number;

  @ApiProperty({
    example: 'EUR',
    description: 'ISO 4217 3-character code for the currency of the fee'
  })
  @IsString()
  currency: string;
}

export class KingdomBankPaymentNotificationCustomerDto {
  @ApiPropertyOptional({
    example: '2521',
    description: 'Last 4 chars of the payment instrument used for the payment'
  })
  @IsOptional()
  @IsString()
  last4Chars?: string;

  @ApiPropertyOptional({
    example: 'KINGDOM_WALLET',
    description: 'Payment method used by the customer'
  })
  @IsOptional()
  @IsString()
  paymentMethod?: string;
}

export enum KingdomBankNotificationType {
  PAYMENT = 'PAYMENT',
  PAYOUT = 'PAYOUT', 
  EXTERNAL_TRANSFER = 'EXTERNAL_TRANSFER',
  INTERNAL_TRANSFER = 'INTERNAL_TRANSFER',
  REFUND = 'REFUND',
  CHARGEBACK = 'CHARGEBACK'
}

export enum KingdomBankNotificationStatus {
  PENDING = 'PENDING',
  SCHEDULED = 'SCHEDULED', 
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

export class KingdomBankWebhookNotificationDto {
  @ApiProperty({
    example: 7000042342,
    description: 'Identifier of the notification (if a notification is resent, it will have the same notificationId)'
  })
  @IsNumber()
  notificationId: number;

  @ApiProperty({
    example: 'valorapays_12345_req_test_123456789_1640995200000',
    description: 'The Merchant\'s unique identifier used when making the Payment initialization request'
  })
  @IsString()
  foreignTransactionId: string;

  @ApiPropertyOptional({
    example: 'de07e20b5bc5456bb730c8b3c2273273',
    description: 'Unique identifier of the initialized payment request'
  })
  @IsOptional()
  @IsString()
  requestId?: string;

  @ApiPropertyOptional({
    example: 1000012,
    description: 'ID of the Kingdom Bank transaction that affected the Merchant account (may be absent for failed payments)'
  })
  @IsOptional()
  @IsNumber()
  transactionId?: number;

  @ApiProperty({
    example: '2020-07-28T14:05:17.362Z',
    description: 'Time/date of occurrence (in RFC 3339 format) of the event for which this notification is being sent'
  })
  @IsString()
  timestamp: string;

  @ApiProperty({
    enum: KingdomBankNotificationType,
    description: 'The type of the event/entity for which this notification is being sent'
  })
  @IsEnum(KingdomBankNotificationType)
  type: KingdomBankNotificationType;

  @ApiProperty({
    enum: KingdomBankNotificationStatus,
    description: 'The status of the payment'
  })
  @IsEnum(KingdomBankNotificationStatus)
  status: KingdomBankNotificationStatus;

  @ApiPropertyOptional({
    example: false,
    description: 'The customer completed the payment, but the paid amount is lower than the requested amount'
  })
  @IsOptional()
  @IsBoolean()
  underpaid?: boolean;

  @ApiPropertyOptional({
    example: false,
    description: 'The customer completed the payment, but the paid amount is higher than the requested amount'
  })
  @IsOptional()
  @IsBoolean()
  overpaid?: boolean;

  @ApiPropertyOptional({
    example: '1234567890 Payment ref',
    description: 'The payment reference that was used when the transfer was created'
  })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiProperty({
    example: 100.50,
    description: 'The requested payment amount as passed by the merchant'
  })
  @IsNumber()
  requestAmount: number;

  @ApiProperty({
    example: 'USD',
    description: 'ISO 4217 3-character code for the requested currency of the payment'
  })
  @IsString()
  requestCurrency: string;

  @ApiPropertyOptional({
    example: 100.50,
    description: 'The actual amount that was added/deducted to your account'
  })
  @IsOptional()
  @IsNumber()
  transactionAmount?: number;

  @ApiPropertyOptional({
    example: 'USD',
    description: 'ISO 4217 3-character code for the currency of the amount that was added/deducted to your account'
  })
  @IsOptional()
  @IsString()
  transactionCurrency?: string;

  @ApiPropertyOptional({
    example: 100.50,
    description: 'The actual amount which was processed. Applicable for crypto payment methods'
  })
  @IsOptional()
  @IsNumber()
  processingAmount?: number;

  @ApiPropertyOptional({
    example: 'USDT.TRC20',
    description: 'The character code of the currency of the processing amount'
  })
  @IsOptional()
  @IsString()
  processingCurrency?: string;

  @ApiPropertyOptional({
    example: 100.50,
    description: 'The actual amount paid by the customer to the merchant'
  })
  @IsOptional()
  @IsNumber()
  paidAmount?: number;

  @ApiPropertyOptional({
    example: 'USD',
    description: 'The character code of the currency of the paid amount'
  })
  @IsOptional()
  @IsString()
  paidCurrency?: string;

  @ApiPropertyOptional({
    example: 100.50,
    description: 'The actual amount which the customer has paid without conversion'
  })
  @IsOptional()
  @IsNumber()
  customerAmount?: number;

  @ApiPropertyOptional({
    example: 'EUR',
    description: 'The character code of the currency of the customer amount'
  })
  @IsOptional()
  @IsString()
  customerCurrency?: string;

  @ApiPropertyOptional({
    type: KingdomBankPaymentNotificationCustomerDto,
    description: 'The customer (sender) details. Only present for Payments'
  })
  @IsOptional()
  @Type(() => KingdomBankPaymentNotificationCustomerDto)
  customer?: KingdomBankPaymentNotificationCustomerDto;

  @ApiPropertyOptional({
    example: 'usr-1105002',
    description: 'The externalUserId value provided by the Merchant with the Payment initiation request'
  })
  @IsOptional()
  @IsString()
  externalUserId?: string;

  @ApiPropertyOptional({
    example: 999999,
    description: 'ID of the original transaction. Present only in case of refunds, chargebacks or other payment events'
  })
  @IsOptional()
  @IsNumber()
  originalTransactionId?: number;

  @ApiPropertyOptional({
    example: 'original_payment_12345',
    description: 'Foreign transaction ID of the original transaction. Present only in case of refunds, chargebacks'
  })
  @IsOptional()
  @IsString()
  originalForeignTransactionId?: string;

  @ApiPropertyOptional({
    type: KingdomBankNotificationErrorDto,
    description: 'Error details in case an error or cancellation occurred during competing the payment'
  })
  @IsOptional()
  @Type(() => KingdomBankNotificationErrorDto)
  error?: KingdomBankNotificationErrorDto;

  @ApiPropertyOptional({
    type: [KingdomBankFeeDto],
    description: 'Information about fees applied to this payment'
  })
  @IsOptional()
  @IsArray()
  @Type(() => KingdomBankFeeDto)
  fees?: KingdomBankFeeDto[];

  @ApiPropertyOptional({
    example: 'KINGDOM_WALLET',
    description: 'Payment method used by the customer (e.g., KINGDOM_WALLET, CARD, CRYPTO)'
  })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({
    type: Object,
    description: 'Additional proxy data sent by Kingdom Bank'
  })
  @IsOptional()
  proxyData?: Record<string, any>;
}

/**
 * Kingdom Bank Webhook Headers DTO
 */
export class KingdomBankWebhookHeadersDto {
  @ApiProperty({
    example: 'Ouw9bJx2nUtZAtNUPsElHx2zRNJuc90ZpbM11l+EFL8=',
    description: 'HMAC-SHA256 signature of the webhook payload'
  })
  @IsString()
  'x-signature': string;

  @ApiProperty({
    example: 'dahf141898glkjgsd813hf3jt943j',
    description: 'ID of the key used for signing the payload'
  })
  @IsString()
  'x-signature-key-id': string;

  @ApiPropertyOptional({
    example: 'application/json',
    description: 'Content type of the request'
  })
  @IsOptional()
  @IsString()
  'content-type'?: string;
}

/**
 * Webhook Response DTO for Kingdom Bank
 */
export class KingdomBankWebhookResponseDto {
  @ApiProperty({
    example: true,
    description: 'Whether the webhook was processed successfully'
  })
  @IsBoolean()
  success: boolean;

  @ApiProperty({
    example: 'Webhook processed successfully',
    description: 'Response message'
  })
  @IsString()
  message: string;

  @ApiPropertyOptional({
    example: 'valorapays_12345_req_test_123456789_1640995200000',
    description: 'Transaction ID that was processed'
  })
  @IsOptional()
  @IsString()
  transactionId?: string;

  @ApiPropertyOptional({
    example: 'PROCESSED',
    description: 'Updated transaction status'
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether the transaction status was updated'
  })
  @IsOptional()
  @IsBoolean()
  updated?: boolean;
}
