import { Controller, Post, Get, Body, Param, Headers, HttpCode, Req } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { ApiTags, ApiSecurity, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { PaymentIntentService } from './payment-intent.service';
import { 
  CreatePaymentIntentDto, 
  ProcessPaymentDto,
  CreatePaymentIntentResponseDto,
  ProcessPaymentResponseDto,
  GetPaymentStatusResponseDto,
  CustomerDetailsDto,
  PaymentMethodDetailsDto,
  DeviceInfoDto
} from '@/dto/payment';
import { 
  CreatePaymentIntentApi, 
  GetPaymentStatusApi, 
  ProcessPaymentApi 
} from '@/common/decorators/api.decorators';
import { ResponseHelper } from '@/common/helpers/response.helper';
import { Public } from '@/common/guards/combined-auth.guard';

@Controller('payment-intent')
@ApiTags('payments')
@ApiSecurity('API-Key')
export class PaymentIntentController {
  constructor(private readonly paymentIntentService: PaymentIntentService) {}

  @Post()
  @CreatePaymentIntentApi(CreatePaymentIntentResponseDto)
  async createPaymentIntentHttp(
    @Body() createDto: CreatePaymentIntentDto,
    @Headers('x-merchant-id') merchantId: string,
    @Headers('x-request-id') requestId: string
  ): Promise<CreatePaymentIntentResponseDto> {
    ResponseHelper.validateMerchantHeaders(merchantId, requestId);

    return ResponseHelper.executeServiceCall(
      () => this.paymentIntentService.createPaymentIntent({
        ...createDto,
        merchantId: merchantId,
        requestId,
      }),
      requestId,
      'POST /payment-intent',
      'Payment intent created successfully',
      'PAYMENT_INTENT_CREATION_FAILED',
      'Payment intent creation failed'
    );
  }

  @Get(':intentId')
  @GetPaymentStatusApi(GetPaymentStatusResponseDto)
  async getPaymentIntentStatusHttp(
    @Param('intentId') intentId: string,
    @Headers('x-request-id') requestId: string,
    @Headers('x-merchant-id') merchantId: string
  ): Promise<GetPaymentStatusResponseDto> {
    ResponseHelper.validateMerchantHeaders(merchantId, requestId);
    ResponseHelper.validateRequiredParams({ intentId });

    return ResponseHelper.executeServiceCall(
      () => this.paymentIntentService.getPaymentStatus(intentId),
      requestId,
      `GET /payment-intent/${intentId}`,
      'Payment status retrieved successfully',
      'PAYMENT_STATUS_RETRIEVAL_FAILED',
      'Failed to get payment status'
    );
  }

  @Post(':intentId/confirm')
  @HttpCode(200)
  @ApiTags('payments')
  @ApiOperation({
    summary: 'Confirm payment and get TSP redirect URL',
    description: 'Confirms payment with customer details and returns redirect URL to TSP payment page. For Payaza, include card details in paymentMethodDetails.'
  })
  @Public()
  async confirmPaymentHttp(
    @Param('intentId') intentId: string,
    @Body() confirmDto: {
      customerDetails: CustomerDetailsDto;
      deviceInfo?: DeviceInfoDto;
      paymentMethodDetails?: PaymentMethodDetailsDto;
    },
    @Headers('x-request-id') requestId?: string,
    @Headers('x-forwarded-for') xForwardedFor?: string,
    @Headers('x-real-ip') xRealIp?: string,
    @Req() req?: any
  ) {
    const generatedRequestId = requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    ResponseHelper.validateRequiredParams({ intentId });

    const clientIp = xForwardedFor?.split(',')[0].trim() || xRealIp || req?.ip || req?.connection?.remoteAddress;

    return ResponseHelper.executeServiceCall(
      () => this.paymentIntentService.confirmPaymentWithTSP({
        intentId,
        customerDetails: confirmDto.customerDetails,
        paymentMethodDetails: confirmDto.paymentMethodDetails,
        deviceInfo: {
          ...confirmDto.deviceInfo,
          ipAddress: clientIp,
        },
        requestId: generatedRequestId,
      }),
      generatedRequestId,
      `POST /payment-intent/${intentId}/confirm`,
      'Payment confirmation successful',
      'PAYMENT_CONFIRMATION_FAILED',
      'Payment confirmation failed'
    );
  }

  @Post(':intentId/process')
  @ProcessPaymentApi(ProcessPaymentResponseDto)
  async processPaymentHttp(
    @Param('intentId') intentId: string,
    @Body() processDto: ProcessPaymentDto,
    @Headers('x-merchant-id') merchantId: string,
    @Headers('x-request-id') requestId: string
  ): Promise<ProcessPaymentResponseDto> {
    ResponseHelper.validateMerchantHeaders(merchantId, requestId);
    ResponseHelper.validateRequiredParams({ intentId });

    return ResponseHelper.executeServiceCall(
      () => this.paymentIntentService.processPayment({
        intentId,
        merchantId: merchantId,
        paymentMethodDetails: processDto.paymentMethodDetails,
        customerDetails: processDto.customerDetails,
        deviceInfo: processDto.deviceInfo,
        requestId,
      }),
      requestId,
      `POST /payment-intent/${intentId}/process`,
      'Payment processed successfully',
      'PAYMENT_PROCESSING_FAILED',
      'Payment processing failed'
    );
  }

  // gRPC Methods (Internal Service Communication)
  @GrpcMethod('PaymentEngineService', 'CreatePaymentIntent')
  async createPaymentIntentGrpc(data: CreatePaymentIntentDto) {
    try {
      const result = await this.paymentIntentService.createPaymentIntent(data);
      return {
        success: true,
        intent_id: result.intentId,
        merchant_id: result.merchantId,
        amount: result.amount,
        currency: result.currency,
        status: result.status,
        // selected_tsp: result.selectedTSP,
        expires_at: result.expiresAt.toISOString(),
        processing_fee: result.processingFee,
        created_at: result.createdAt.toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @GrpcMethod('PaymentEngineService', 'ProcessPayment')
  async processPaymentGrpc(data: {
    intent_id: string;
    payment_method_details: any;
    customer_details: any;
    merchant_id: string;
    request_id: string;
    device_info?: any;
  }) {
    try {
      const result = await this.paymentIntentService.processPayment({
        intentId: data.intent_id,
        paymentMethodDetails: data.payment_method_details,
        customerDetails: data.customer_details,
        merchantId: data.merchant_id,
        requestId: data.request_id,
        deviceInfo: data.device_info,
      });
      return {
        success: true,
        intent_id: result.intentId,
        external_transaction_id: result.externalTransactionId,
        status: result.status,
        amount: result.amount,
        currency: result.currency,
        processing_time_ms: result.processingTimeMs,
        tsp_provider: result.tspProvider,
        completed_at: result.completedAt?.toISOString(),
        failure_reason: result.failureReason,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @GrpcMethod('PaymentEngineService', 'GetPaymentStatus')
  async getPaymentStatusGrpc(data: { intent_id: string; merchant_id?: number }) {
    try {
      const result = await this.paymentIntentService.getPaymentStatus(data.intent_id);
      return {
        success: true,
        intent_id: result.intentId,
        status: result.status,
        amount: result.amount,
        currency: result.currency,
        external_transaction_id: result.externalTransactionId,
        tsp_provider: result.tspProvider,
        created_at: result.createdAt.toISOString(),
        completed_at: result.completedAt?.toISOString(),
        failure_reason: result.failureReason,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Post(':intentId/cancel')
  @HttpCode(200)
  @ApiTags('payments')
  @ApiOperation({
    summary: 'Cancel payment intent',
    description: 'Cancels a payment intent (e.g., when timer expires or user abandons payment)'
  })
  @Public()
  async cancelPaymentHttp(
    @Param('intentId') intentId: string,
    @Headers('x-request-id') requestId?: string
  ) {
    const generatedRequestId = requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    ResponseHelper.validateRequiredParams({ intentId });

    return ResponseHelper.executeServiceCall(
      () => this.paymentIntentService.cancelPaymentIntent(intentId, generatedRequestId),
      generatedRequestId,
      `POST /payment-intent/${intentId}/cancel`,
      'Payment intent cancelled successfully',
      'PAYMENT_INTENT_CANCELLATION_FAILED',
      'Failed to cancel payment intent'
    );
  }

  /**
   * PUBLIC: Get payment intent details for payment page (No Auth Required)
   */
  @Get('public/:intentId')
  @Public()
  @HttpCode(200)
  @ApiTags('public')
  @ApiOperation({ 
    summary: 'Get payment intent details (Public)',
    description: 'Retrieves payment intent details for customer payment page without authentication. Validates expiry and provides merchant info.'
  })
  @ApiParam({
    name: 'intentId',
    description: 'Payment intent ID from redirect URL',
    example: 'pi_1234567890'
  })
  @ApiResponse({
    status: 200,
    description: 'Payment intent details retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            intentId: { type: 'string', example: 'pi_1234567890' },
            merchantId: { type: 'string', example: 'mer_123456' },
            merchantName: { type: 'string', example: 'Awesome Store' },
            merchantLogo: { type: 'string', example: 'https://cdn.example.com/logo.png' },
            amount: { type: 'number', example: 50000 },
            currency: { type: 'string', example: 'INR' },
            description: { type: 'string', example: 'Product purchase' },
            status: { type: 'string', example: 'requires_payment_method' },
            expiresAt: { type: 'string', example: '2024-01-01T12:00:00Z' },
            isExpired: { type: 'boolean', example: false },
            customerEmail: { type: 'string', example: 'customer@example.com' },
            customerPhone: { type: 'string', example: '+919876543210' },
            supportedPaymentMethods: { 
              type: 'array', 
              items: { type: 'string' },
              example: ['card', 'upi', 'netbanking', 'wallet']
            },
            processingFee: { type: 'number', example: 1000 },
            returnUrl: { type: 'string', example: 'https://merchant.com/success' },
            cancelUrl: { type: 'string', example: 'https://merchant.com/cancel' },
            redirectUrl: { type: 'string', example: 'https://pay.tsp.com/checkout/abc123', description: 'TSP redirect URL for fiat payments (available when status is processing)' },
            cryptoAddress: { type: 'string', example: '0x1234...5678', description: 'Crypto wallet address for crypto payments (available when status is processing)' },
            cryptoCurrency: { type: 'string', example: 'USDT.TRC20', description: 'Crypto currency for payment (available when status is processing)' }
          }
        },
        meta: {
          type: 'object',
          properties: {
            request_id: { type: 'string' },
            timestamp: { type: 'string' },
            api_version: { type: 'string', example: 'v1' }
          }
        }
      }
    }
  })
  @ApiResponse({
    status: 404,
    description: 'Payment intent not found'
  })
  @ApiResponse({
    status: 410,
    description: 'Payment intent expired'
  })
  async getPublicPaymentIntentDetails(
    @Param('intentId') intentId: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    const generatedRequestId = requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    ResponseHelper.validateRequiredParams({ intentId });

    return ResponseHelper.executeServiceCall(
      () => this.paymentIntentService.getPublicPaymentIntentDetails(intentId),
      generatedRequestId,
      `GET /payment-intent/public/${intentId}`,
      'Payment intent details retrieved successfully',
      'PAYMENT_INTENT_NOT_FOUND',
      'Payment intent not found or expired'
    );
  }

  /**
   * Update payment intent with customer intelligence
   */
  @Post(':intentId/update-intelligence')
  @HttpCode(200)
  @ApiOperation({ 
    summary: 'Update payment intent with customer intelligence',
    description: 'Collects customer digital intelligence and re-optimizes routing'
  })
  @ApiParam({
    name: 'intentId',
    description: 'Payment intent ID',
    example: 'pi_1234567890'
  })
  async updatePaymentIntentIntelligence(
    @Param('intentId') intentId: string,
    @Body() updateDto: {
      digitalIntelligence: {
        ipAddress?: string;
        userAgent?: string;
        deviceFingerprint?: string;
        geolocation?: {
          country: string;
          state?: string;
          city?: string;
          timezone?: string;
          coordinates?: { lat: number; lng: number };
        };
        browserData?: {
          language: string;
          platform: string;
          screenResolution: string;
          colorDepth: number;
          timezoneOffset: number;
        };
      };
      additionalCustomerDetails?: {
        firstName?: string;
        lastName?: string;
        phone?: string;
      };
    },
    @Headers('x-request-id') requestId: string,
  ) {
    return ResponseHelper.executeServiceCall(
      () => this.paymentIntentService.updatePaymentIntentWithCustomerIntelligence(
        intentId,
        updateDto.digitalIntelligence,
        updateDto.additionalCustomerDetails,
        requestId
      ),
      requestId,
      `POST /payment-intent/${intentId}/update-intelligence`,
      'Payment intent updated with customer intelligence',
      'PAYMENT_INTENT_INTELLIGENCE_UPDATE_FAILED',
      'Failed to update payment intent with customer intelligence'
    );
  }
}