import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiHeader, ApiResponse, ApiParam } from '@nestjs/swagger';

/**
 * Common API Headers for merchant endpoints
 */
export function MerchantApiHeaders() {
  return applyDecorators(
    ApiHeader({
      name: 'Authorization',
      description: 'Bearer token with API Key',
      required: true,
      example: 'Bearer zp_test_394b81cfcba5a2836811f97622eb9891',
      schema: {
        type: 'string',
        pattern: '^Bearer zp_(test|live)_[a-zA-Z0-9]{32}$'
      }
    }),
    ApiHeader({
      name: 'x-merchant-id',
      description: 'Merchant ID provided during onboarding',
      required: true,
      example: 'mer_db25ab2b28e6ebda',
      schema: {
        type: 'string',
        pattern: '^mer_[a-zA-Z0-9]{16}$'
      }
    }),
    ApiHeader({
      name: 'x-timestamp',
      description: 'ISO 8601 timestamp for replay protection',
      required: true,
      example: '2024-01-20T10:30:00.000Z',
      schema: {
        type: 'string',
        format: 'date-time'
      }
    }),
    ApiHeader({
      name: 'x-signature',
      description: 'HMAC-SHA256 signature calculated as: HMAC-SHA256(apiKey + timestamp + requestBody, secretSalt). The secretSalt is provided during merchant onboarding.',
      required: true,
      example: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2',
      schema: {
        type: 'string',
        pattern: '^[a-f0-9]{64}$',
        description: 'Calculate: crypto.createHmac("sha256", secretSalt).update(apiKey + timestamp + JSON.stringify(body)).digest("hex")'
      }
    })
  );
}

/**
 * Common API error responses
 */
export function CommonApiResponses() {
  return applyDecorators(
    ApiResponse({
      status: 400,
      description: 'Invalid request data'
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized - Invalid or missing API key'
    }),
    ApiResponse({
      status: 429,
      description: 'Too many requests'
    }),
    ApiResponse({
      status: 500,
      description: 'Internal server error'
    })
  );
}

/**
 * Payment Intent ID parameter
 */
export function PaymentIntentIdParam() {
  return ApiParam({
    name: 'intentId',
    description: 'Payment intent ID',
    example: 'pi_abc123def456'
  });
}

/**
 * Complete payment API decorator with operation and common responses
 */
export function PaymentApiEndpoint(summary: string, description: string, successStatus: number = 200, successType?: any) {
  const decorators = [
    ApiOperation({ summary, description }),
    MerchantApiHeaders(),
    CommonApiResponses(),
    ApiResponse({
      status: successStatus,
      description: `${summary} - Success`,
      ...(successType && { type: successType })
    })
  ];

  return applyDecorators(...decorators);
}

/**
 * Analytics/Monitoring API endpoint (merchant-facing)
 */
export function AnalyticsApiEndpoint(summary: string, description: string, successType?: any) {
  return applyDecorators(
    ApiOperation({ summary, description }),
    MerchantApiHeaders(),
    CommonApiResponses(),
    ApiResponse({
      status: 200,
      description: `${summary} - Success`,
      ...(successType && { type: successType })
    })
  );
}

/**
 * Internal service API endpoint (no merchant auth)
 */
export function InternalApiEndpoint(summary: string, description: string, successType?: any) {
  return applyDecorators(
    ApiOperation({ summary, description }),
    ApiHeader({
      name: 'x-request-id',
      description: 'Unique request ID for tracking',
      required: true,
      example: 'req_internal_12345'
    }),
    CommonApiResponses(),
    ApiResponse({
      status: 200,
      description: `${summary} - Success`,
      ...(successType && { type: successType })
    })
  );
}

/**
 * Public API endpoint (no authentication)
 */
export function PublicApiEndpoint(summary: string, description: string, successType?: any) {
  return applyDecorators(
    ApiOperation({ summary, description }),
    ApiResponse({
      status: 200,
      description: `${summary} - Success`,
      ...(successType && { type: successType })
    }),
    ApiResponse({
      status: 500,
      description: 'Internal server error'
    })
  );
}

/**
 * Payment intent specific endpoints
 */
export function CreatePaymentIntentApi(successType: any) {
  return PaymentApiEndpoint(
    'Create Payment Intent',
    'Creates a new payment intent with smart routing and fraud detection. Supports both customer ID lookup and inline customer creation.',
    201,
    successType
  );
}

export function GetPaymentStatusApi(successType: any) {
  return applyDecorators(
    PaymentApiEndpoint(
      'Get Payment Status',
      'Retrieves the current status and details of a payment intent',
      200,
      successType
    ),
    PaymentIntentIdParam()
  );
}

export function ProcessPaymentApi(successType: any) {
  return applyDecorators(
    PaymentApiEndpoint(
      'Process Payment',
      'Processes a payment intent with the provided payment method details. Includes fraud detection, TSP routing, and real-time processing.',
      200,
      successType
    ),
    PaymentIntentIdParam(),
    ApiResponse({
      status: 402,
      description: 'Payment failed - insufficient funds, declined card, etc.'
    }),
    ApiResponse({
      status: 404,
      description: 'Payment intent not found'
    })
  );
}
