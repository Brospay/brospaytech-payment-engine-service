import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Response metadata following API Gateway pattern
 */
export class ResponseMeta {
  @ApiProperty({
    example: 'req_12345_67890',
    description: 'Unique request identifier for tracking'
  })
  request_id: string;

  @ApiProperty({
    example: '2024-01-20T10:30:00.000Z',
    description: 'Response timestamp in ISO format'
  })
  timestamp: string;

  @ApiProperty({
    example: 1250,
    description: 'Processing time in milliseconds'
  })
  processing_time_ms: number;

  @ApiProperty({
    example: 'v1',
    description: 'API version'
  })
  api_version: string;

  @ApiProperty({
    example: 'POST /payment-intent',
    description: 'Endpoint that was called'
  })
  endpoint: string;

  @ApiProperty({
    example: 'merchant',
    description: 'Type of authenticated user'
  })
  user_type: string;
}

/**
 * Error details structure
 */
export class ErrorDetails {
  @ApiProperty({
    example: 'PAYMENT_INTENT_CREATION_FAILED',
    description: 'Error code for programmatic handling'
  })
  code: string;

  @ApiProperty({
    example: 'Payment intent creation failed due to invalid merchant ID',
    description: 'Human-readable error message'
  })
  message: string;

  @ApiProperty({
    example: 'validation_error',
    description: 'Type of error that occurred'
  })
  type: string;

  @ApiPropertyOptional({
    description: 'Additional error details'
  })
  details?: any;

  @ApiPropertyOptional({
    example: [
      {
        field: 'amount',
        message: 'Amount must be greater than 0'
      }
    ],
    description: 'Field-level validation errors'
  })
  validation_errors?: Array<{
    field: string;
    message: string;
  }>;
}

/**
 * Base response structure following API Gateway pattern
 */
export class BaseResponse<T = any> {
  @ApiProperty({
    example: true,
    description: 'Whether the operation was successful'
  })
  success: boolean;

  @ApiPropertyOptional({
    description: 'Response data (null for failed requests)'
  })
  data: T | null;

  @ApiProperty({
    example: 'Payment intent created successfully',
    description: 'Human-readable response message'
  })
  message: string;

  @ApiPropertyOptional({
    description: 'Error details (null for successful requests)'
  })
  error: ErrorDetails | null;

  @ApiProperty({
    description: 'Response metadata including request tracking'
  })
  meta: ResponseMeta;
}

/**
 * Success response wrapper
 */
export class SuccessResponse<T> extends BaseResponse<T> {
  success: true = true;
  data: T;
  error: null = null;
}

/**
 * Error response wrapper
 */
export class ErrorResponse extends BaseResponse<null> {
  success: false = false;
  data: null = null;
  error: ErrorDetails;
}




