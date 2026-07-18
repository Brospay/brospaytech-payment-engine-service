import { Controller, Post, Get, Body, Param, Headers, HttpCode, Query, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { ApiTags, ApiSecurity, ApiOperation, ApiParam, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { PayoutService } from './payout.service';
import { EpayoutStatus } from './enums/epayout-status.enum';
import {
  CreatePayoutDto,
  GetPayoutStatusDto,
  PayoutResponseDto,
  PayoutStatusResponseDto,
  ListPayoutsDto,
  RetryPayoutDto,
} from '../../dto/payout/payout.dto';
import { GetPayoutMethodsResponseDto } from '../../dto/payout/payout-methods.dto';
import { ResponseHelper } from '@/common/helpers/response.helper';
import { Public } from '@/common/guards/combined-auth.guard';
import { PayoutPaymentsAnalyticsFilters } from '../payment-transaction/types/all.types';

@Controller('payouts')
@ApiTags('payouts')
@ApiSecurity('API-Key')
export class PayoutController {
  private readonly logger = new Logger(PayoutController.name);

  constructor(private readonly payoutService: PayoutService) {}

  @Get('methods')
  @Public()
  @ApiOperation({
    summary: 'Get available payout methods',
    description: 'Retrieves list of all supported payout methods with required field information for each method'
  })
  @ApiResponse({
    status: 200,
    description: 'Payout methods retrieved successfully',
    type: GetPayoutMethodsResponseDto
  })
  async getPayoutMethods(): Promise<GetPayoutMethodsResponseDto> {
    return this.payoutService.getAvailablePayoutMethods();
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Create payout request',
    description: 'Initiates a payout to customer/beneficiary. Validates wallet balance and routes to appropriate TSP.'
  })
  @ApiResponse({
    status: 200,
    description: 'Payout created successfully',
    type: PayoutResponseDto
  })
  @ApiResponse({
    status: 400,
    description: 'Insufficient wallet balance or invalid request'
  })
  async createPayout(
    @Body() createDto: CreatePayoutDto,
    @Headers('x-merchant-id') merchantId: string,
    @Headers('x-request-id') requestId: string
  ): Promise<any> {
    ResponseHelper.validateMerchantHeaders(merchantId, requestId);

    this.logger.log(`[${requestId}] Merchant ${merchantId} creating payout for ${createDto.amount} ${createDto.currency || 'INR'}`);

    return ResponseHelper.executeServiceCall(
      () => this.payoutService.createPayout({
        ...createDto,
        merchantId: merchantId,
        requestId,
      }),
      requestId,
      'POST /payouts',
      'Payout created successfully',
      'PAYOUT_CREATION_FAILED',
      'Payout creation failed'
    );
  }

  @Get(':payoutId')
  @ApiOperation({
    summary: 'Get payout status',
    description: 'Retrieves the current status and details of a payout'
  })
  @ApiParam({ name: 'payoutId', description: 'Payout ID', example: 'payout_123456' })
  @ApiResponse({
    status: 200,
    description: 'Payout status retrieved successfully',
    type: PayoutStatusResponseDto
  })
  async getPayoutStatus(
    @Param('payoutId') payoutId: string,
    @Headers('x-merchant-id') merchantId: string,
    @Headers('x-request-id') requestId: string
  ): Promise<any> {
    ResponseHelper.validateMerchantHeaders(merchantId, requestId);
    ResponseHelper.validateRequiredParams({ payoutId });

    return ResponseHelper.executeServiceCall(
      () => this.payoutService.getPayoutStatus({ payoutId, requestId }),
      requestId,
      `GET /payouts/${payoutId}`,
      'Payout status retrieved successfully',
      'PAYOUT_STATUS_RETRIEVAL_FAILED',
      'Failed to get payout status'
    );
  }

  @Get()
  @ApiOperation({
    summary: 'List payouts',
    description: 'Lists all payouts for the merchant with optional filters'
  })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  @ApiQuery({ name: 'tspProvider', required: false, description: 'Filter by TSP provider' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (ISO format)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (ISO format)' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', example: 20 })
  async listPayouts(
    @Query() query: any,
    @Headers('x-merchant-id') merchantId: string,
    @Headers('x-request-id') requestId: string
  ): Promise<any> {
    ResponseHelper.validateMerchantHeaders(merchantId, requestId);

    const listDto: ListPayoutsDto = {
      merchantId: parseInt(merchantId),
      status: query.status,
      tspProvider: query.tspProvider,
      startDate: query.startDate,
      endDate: query.endDate,
      page: query.page ? parseInt(query.page) : 1,
      limit: query.limit ? parseInt(query.limit) : 20,
    };

    return ResponseHelper.executeServiceCall(
      () => this.payoutService.listPayouts(listDto),
      requestId,
      'GET /payouts',
      'Payouts retrieved successfully',
      'PAYOUT_LIST_RETRIEVAL_FAILED',
      'Failed to retrieve payouts'
    );
  }

  @Get('customer/:customerId')
  @ApiOperation({
    summary: 'List payouts by customer',
    description: 'Lists all payouts for a specific customer'
  })
  @ApiParam({ name: 'customerId', description: 'Customer ID', example: 'cust_123456' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', example: 20 })
  async listPayoutsByCustomer(
    @Param('customerId') customerId: string,
    @Query() query: any,
    @Headers('x-merchant-id') merchantId: string,
    @Headers('x-request-id') requestId: string
  ): Promise<any> {
    ResponseHelper.validateMerchantHeaders(merchantId, requestId);
    ResponseHelper.validateRequiredParams({ customerId });

    const listDto: any = {
      merchantId: parseInt(merchantId),
      customerId,
      page: query.page ? parseInt(query.page) : 1,
      limit: query.limit ? parseInt(query.limit) : 20,
    };

    return ResponseHelper.executeServiceCall(
      () => this.payoutService.listPayoutsByCustomer(listDto),
      requestId,
      `GET /payouts/customer/${customerId}`,
      'Customer payouts retrieved successfully',
      'CUSTOMER_PAYOUT_LIST_RETRIEVAL_FAILED',
      'Failed to retrieve customer payouts'
    );
  }

  @Post(':payoutId/retry')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Retry failed payout',
    description: 'Retries a failed payout, optionally forcing a specific TSP'
  })
  @ApiParam({ name: 'payoutId', description: 'Payout ID to retry', example: 'payout_123456' })
  @ApiResponse({
    status: 200,
    description: 'Payout retry initiated successfully',
    type: PayoutResponseDto
  })
  async retryPayout(
    @Param('payoutId') payoutId: string,
    @Body() retryDto: { forceTsp?: string },
    @Headers('x-merchant-id') merchantId: string,
    @Headers('x-request-id') requestId: string
  ): Promise<any> {
    ResponseHelper.validateMerchantHeaders(merchantId, requestId);
    ResponseHelper.validateRequiredParams({ payoutId });

    return ResponseHelper.executeServiceCall(
      () => this.payoutService.retryPayout({
        payoutId,
        forceTsp: retryDto.forceTsp,
        requestId,
      }),
      requestId,
      `POST /payouts/${payoutId}/retry`,
      'Payout retry initiated successfully',
      'PAYOUT_RETRY_FAILED',
      'Failed to retry payout'
    );
  }

  // gRPC Methods (for Merchant Service → Dashboard Integration)

  @GrpcMethod('PaymentEngineService', 'CreatePayout')
  async createPayoutGrpc(data: any) {
    try {
      const createDto: CreatePayoutDto = {
        merchantId: data.merchant_id,
        customerId: data.customer_id,
        customerEmail: data.customer_email,
        customerPhone: data.customer_phone,
        beneficiaryAccount: data.beneficiary_account,
        beneficiaryIfsc: data.beneficiary_ifsc,
        beneficiarySwift: data.beneficiary_swift,
        beneficiaryName: data.beneficiary_name,
        beneficiaryMobile: data.beneficiary_mobile,
        beneficiaryVpa: data.beneficiary_vpa,
        bankName: data.bank_name,
        amount: data.amount,
        currency: data.currency,
        payoutType: data.payout_type,
        purpose: data.purpose,
        description: data.description,
        webhookUrl: data.webhook_url,
        metadata: data.metadata,
        requestId: data.request_id,
        environment: data.environment,
      };

      const result = await this.payoutService.createPayout(createDto);

      return {
        success: true,
        payout_id: result.payoutId,
        merchant_id: result.merchantId,
        status: result.status,
        amount: result.amount,
        currency: result.currency,
        tsp_provider: result.tspProvider,
        external_payout_id: result.externalPayoutId,
        processing_fee: result.processingFee,
        total_debited_amount: result.totalDebitedAmount,
        created_at: result.createdAt?.toISOString(),
        estimated_completion: result.estimatedCompletion?.toISOString(),
        metadata: result.metadata || {},
        error_message: '',
      };
    } catch (error) {
      this.logger.error(`gRPC CreatePayout failed: ${error.message}`);
      return {
        success: false,
        error_message: error.message,
      };
    }
  }

  @GrpcMethod('PaymentEngineService', 'GetPayoutTransactionsSummary')
  async getPayoutTransactionsSummary(data: any): Promise<any> {
    try {
      const filters = {
        merchantId: data.merchant_id,
        startDate: data.start_date || undefined,
        endDate: data.end_date || undefined,
        status: data.status || undefined,
        paymentMethod: data.payment_method || undefined,
        currency: data.currency || undefined,
        includeTimeSeries: data.include_time_series || false,
        includeComparison: data.include_comparison || false,
        granularity: data.granularity || 'day',
        customerId: data.customer_id || undefined,
        customerEmail: data.customer_email || undefined,
        customerPhone: data.customer_phone || undefined,
        amountRange: data.amount_range || undefined,
      };
      
      const analytics = await this.payoutService.getPayoutTransactionSummary(filters);
      return {
        // Dashboard-specific metrics for 7 cards
        total_manual_payments: analytics.totalManualPayments,
        payment_amount: analytics.paymentAmount,
        approved_payments: analytics.approvedPayments,
        avg_processing_time: analytics.avgProcessingTime,
        approved_today: analytics.approvedToday,
        pending_approval: analytics.pendingApproval,
        approval_rate: analytics.approvalRate,
        
        // Comparison data
        comparison: analytics.comparison ? {
          total_manual_payments: {
            previous_value: analytics.comparison.totalManualPayments.previousValue,
            change_percentage: analytics.comparison.totalManualPayments.changePercentage,
            trend: analytics.comparison.totalManualPayments.trend,
          },
          payment_amount: {
            previous_value: analytics.comparison.paymentAmount.previousValue,
            change_percentage: analytics.comparison.paymentAmount.changePercentage,
            trend: analytics.comparison.paymentAmount.trend,
          },
          approved_payments: {
            previous_value: analytics.comparison.approvedPayments.previousValue,
            change_percentage: analytics.comparison.approvedPayments.changePercentage,
            trend: analytics.comparison.approvedPayments.trend,
          },
          avg_processing_time: {
            previous_value: analytics.comparison.avgProcessingTime.previousValue,
            change_percentage: analytics.comparison.avgProcessingTime.changePercentage,
            trend: analytics.comparison.avgProcessingTime.trend,
          },
          approved_today: {
            previous_value: analytics.comparison.approvedToday.previousValue,
            change_percentage: analytics.comparison.approvedToday.changePercentage,
            trend: analytics.comparison.approvedToday.trend,
          },
          pending_approval: {
            previous_value: analytics.comparison.pendingApproval.previousValue,
            change_percentage: analytics.comparison.pendingApproval.changePercentage,
            trend: analytics.comparison.pendingApproval.trend,
          },
          approval_rate: {
            previous_value: analytics.comparison.approvalRate.previousValue,
            change_percentage: analytics.comparison.approvalRate.changePercentage,
            trend: analytics.comparison.approvalRate.trend,
          },
        } : null,
        
        // Additional metadata
        period: analytics.period,
        currency: analytics.currency,
        last_updated: analytics.lastUpdated,
      };
    } catch (error) {
      this.logger.error(`[gRPC] GetPayoutTransactionsSummary failed: ${error.message}`);
      return {
        total_manual_payments: 0,
        payment_amount: 0,
        approved_payments: 0,
        avg_processing_time: 0,
        approved_today: 0,
        pending_approval: 0,
        approval_rate: 0,
        comparison: null,
        period: '',
        currency: 'INR',
        last_updated: new Date().toISOString(),
        error_message: error.message,
      };
    }
  }  


  @GrpcMethod('PaymentEngineService', 'GetAllPayoutTransactions')
  async getAllPayoutTransactions(data: any): Promise<any> {
    try {
      this.logger.log(`[gRPC] GetAllPayoutTransactions - Admin view (all merchants)`);
      this.logger.log(`[gRPC] GetAllPayoutTransactions - Received data:`, JSON.stringify({
        merchant_id: data.merchant_id,
        status: data.status,
        currency: data.currency,
        currency_type: typeof data.currency,
        currency_undefined: data.currency === undefined,
        currency_null: data.currency === null,
        currency_empty: data.currency === '',
        start_date: data.start_date,
        end_date: data.end_date,
        page: data.page,
        limit: data.limit,
      }));
      
      // Valid status values for payout
      const validStatuses = Object.values(EpayoutStatus);
      let status = data.status;
      
      // Filter out invalid status values
      if (status && !validStatuses.includes(status.toLowerCase())) {
        this.logger.warn(`Invalid status value received: "${status}", ignoring filter`);
        status = undefined;
      }
      
      // Process currency filter - only pass if provided and not empty
      this.logger.log(`[gRPC] GetAllPayoutTransactions - Raw currency value: "${data.currency}" (type: ${typeof data.currency}, isUndefined: ${data.currency === undefined}, isNull: ${data.currency === null}, isEmpty: ${data.currency === ''})`);
      
      const currencyFilter = data.currency && data.currency.trim() !== '' 
        ? data.currency.trim().toUpperCase() 
        : undefined;

      this.logger.log(`[gRPC] GetAllPayoutTransactions - Processed currency filter: "${currencyFilter}" (from "${data.currency}")`);

      const { payouts, total } = await this.payoutService.getAllPayoutTransactions({
        merchantId: data.merchant_id && data.merchant_id.trim() !== '' ? data.merchant_id : undefined, // Optional merchant filter (empty string = all merchants)
        status: status || undefined,
        startDate: data.start_date || undefined,
        endDate: data.end_date || undefined,
        currency: currencyFilter, // Pass currency filter only if provided
        minAmount: data.min_amount || undefined,
        maxAmount: data.max_amount || undefined,
        customerId: data.customer_id || undefined,
        search: data.search || undefined,                  // General search from main search bar
        page: data.page || 1,
        limit: data.limit || 20,
      });

      const page = data.page || 1;
      const limit = data.limit || 20;
      const totalPages = Math.ceil(total / limit);
      return {
        success: true,
        message: 'All transactions retrieved successfully',
        data: {
          transactions: payouts.map((payout) => ({
            id: payout.payoutId,
            payout_id: payout.payoutId,
            merchant_id: payout.merchantId,
            customer_id: payout.customerId,
            customer_email: payout.customerEmail,
            customer_phone: payout.customerPhone,
            amount: payout.amount,
            currency: payout.currency,
            status: payout.status,
            created_at: payout.createdAt.toISOString(),
            updated_at: payout.updatedAt.toISOString(),
            metadata: payout.metadata || {},
          })),
          total_count: total,
          page: page,
          limit: limit,
          total_pages: totalPages,
        },
      };
    } catch (error) {
      this.logger.error(`[gRPC] GetAllTransactions failed: ${error.message}`);
      return {
        success: false,
        message: `Failed to get all transactions: ${error.message}`,
        data: {
          transactions: [],
          pagination: {
            total: 0,
            page: 1,
            limit: 20,
            total_pages: 0,
            has_next: false,
            has_previous: false,
          },
        },
      };
    }
  }
  @GrpcMethod('PaymentEngineService', 'GetPayoutStatus')
  async getPayoutStatusGrpc(data: { payout_id: string; request_id: string }) {
    try {
      const result = await this.payoutService.getPayoutStatus({
        payoutId: data.payout_id,
        requestId: data.request_id,
      });

      return {
        success: true,
        payout_id: result.payoutId,
        merchant_id: result.merchantId,
        status: result.status,
        amount: result.amount,
        currency: result.currency,
        tsp_provider: result.tspProvider,
        external_payout_id: result.externalPayoutId,
        bank_reference_number: result.bankReferenceNumber,
        processing_fee: result.processingFee,
        failure_reason: result.failureReason,
        completed_at: result.completedAt?.toISOString(),
        created_at: result.createdAt?.toISOString(),
        error_message: '',
      };
    } catch (error) {
      this.logger.error(`gRPC GetPayoutStatus failed: ${error.message}`);
      return {
        success: false,
        error_message: error.message,
      };
    }
  }

  @GrpcMethod('PaymentEngineService', 'ListPayouts')
  async listPayoutsGrpc(data: any) {
    try {
      const listDto: ListPayoutsDto = {
        merchantId: data.merchant_id,
        status: data.status,
        currency: data.currency,
        payoutType: data.payout_type,
        tspProvider: data.tsp_provider,
        startDate: data.from_date,
        endDate: data.to_date,
        minAmount: data.min_amount,
        maxAmount: data.max_amount,
        customerId: data.customer_id,
        page: data.page || 1,
        limit: data.limit || 20,
      };

      const result = await this.payoutService.listPayouts(listDto);

      return {
        success: true,
        payouts: result.payouts.map(payout => ({
          payout_id: payout.payoutId,
          merchant_id: payout.merchantId,
          customer_id: payout.customerId,
          customer_email: payout.customerEmail,
          customer_phone: payout.customerPhone,
          beneficiary_account: payout.beneficiaryAccount,
          beneficiary_ifsc: payout.beneficiaryIfsc,
          beneficiary_swift: payout.beneficiarySwift,
          beneficiary_name: payout.beneficiaryName,
          beneficiary_mobile: payout.beneficiaryMobile,
          beneficiary_vpa: payout.beneficiaryVpa,
          bank_name: payout.bankName,
          amount: payout.amount,
          currency: payout.currency,
          payout_type: payout.payoutType,
          purpose: payout.purpose,
          description: payout.description,
          status: payout.status,
          tsp_provider: payout.tspProvider,
          external_payout_id: payout.externalPayoutId,
          processing_fee: payout.processingFee,
          total_debited_amount: payout.totalDebitedAmount,
          estimated_completion: payout.estimatedCompletion?.toISOString(),
          failure_reason: payout.failureReason,
          created_at: payout.createdAt?.toISOString(),
          updated_at: payout.updatedAt?.toISOString(),
        })),
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          total_pages: result.totalPages,
        },
        error_message: '',
      };
    } catch (error) {
      this.logger.error(`gRPC ListPayouts failed: ${error.message}`);
      return {
        success: false,
        error_message: error.message,
      };
    }
  }

  @GrpcMethod('PaymentEngineService', 'GetPayoutsByCustomer')
  async listPayoutsByCustomerGrpc(data: any) {
    try {
      const result = await this.payoutService.listPayoutsByCustomer({
        merchantId: data.merchant_id,
        customerId: data.customer_id,
        page: data.page || 1,
        limit: data.limit || 20,
      });

      return {
        success: true,
        payouts: result.payouts.map(payout => ({
          payout_id: payout.payoutId,
          merchant_id: payout.merchantId,
          customer_id: payout.customerId,
          customer_email: payout.customerEmail,
          customer_phone: payout.customerPhone,
          beneficiary_account: payout.beneficiaryAccount,
          beneficiary_ifsc: payout.beneficiaryIfsc,
          beneficiary_swift: payout.beneficiarySwift,
          beneficiary_name: payout.beneficiaryName,
          beneficiary_mobile: payout.beneficiaryMobile,
          beneficiary_vpa: payout.beneficiaryVpa,
          bank_name: payout.bankName,
          amount: payout.amount,
          currency: payout.currency,
          payout_type: payout.payoutType,
          purpose: payout.purpose,
          description: payout.description,
          status: payout.status,
          tsp_provider: payout.tspProvider,
          external_payout_id: payout.externalPayoutId,
          processing_fee: payout.processingFee,
          total_debited_amount: payout.totalDebitedAmount,
          estimated_completion: payout.estimatedCompletion?.toISOString(),
          failure_reason: payout.failureReason,
          created_at: payout.createdAt?.toISOString(),
          updated_at: payout.updatedAt?.toISOString(),
        })),
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          total_pages: result.totalPages,
        },
        error_message: '',
      };
    } catch (error) {
      this.logger.error(`gRPC GetPayoutsByCustomer failed: ${error.message}`);
      return {
        success: false,
        error_message: error.message,
      };
    }
  }

  @GrpcMethod('PaymentEngineService', 'RetryPayout')
  async retryPayoutGrpc(data: { payout_id: string; force_tsp?: string; request_id: string }) {
    try {
      const result = await this.payoutService.retryPayout({
        payoutId: data.payout_id,
        forceTsp: data.force_tsp,
        requestId: data.request_id,
      });

      return {
        success: true,
        payout_id: result.payoutId,
        status: result.status,
        amount: result.amount,
        currency: result.currency,
        tsp_provider: result.tspProvider,
        external_payout_id: result.externalPayoutId,
        created_at: result.createdAt?.toISOString(),
        estimated_completion: result.estimatedCompletion?.toISOString(),
        error_message: '',
      };
    } catch (error) {
      this.logger.error(`gRPC RetryPayout failed: ${error.message}`);
      return {
        success: false,
        error_message: error.message,
      };
    }
  }

  @GrpcMethod('PaymentEngineService', 'GetPayoutMethods')
  async getPayoutMethodsGrpc(data: { merchant_id: string; request_id: string }) {
    try {
      const result = await this.payoutService.getAvailablePayoutMethods();

      return {
        success: true,
        methods: result.methods.map(method => ({
          method_id: method.methodId,
          type: method.type,
          name: method.name,
          display_name: method.displayName,
          description: method.description,
          supported_currencies: method.supportedCurrencies,
          supported_countries: method.supportedCountries,
          estimated_time: method.estimatedTime,
          min_amount: method.minAmount,
          max_amount: method.maxAmount,
          fee_percentage: method.feePercentage,
          fixed_fee: method.fixedFee,
          is_active: method.isActive,
        })),
        error_message: '',
      };
    } catch (error) {
      this.logger.error(`gRPC GetPayoutMethods failed: ${error.message}`);
      return {
        success: false,
        error_message: error.message,
      };
    }
  }

  @GrpcMethod('PaymentEngineService', 'GetPayoutStats')
  async getPayoutStatsGrpc(data: { merchant_id: string; from_date?: string; to_date?: string; currency?: string; request_id: string }) {
    try {
      const result = await this.payoutService.getPayoutStats(
        data.merchant_id,
        data.from_date,
        data.to_date,
        data.request_id,
        data.currency
      );

      if (!result.success) {
        return {
          success: false,
          error_message: result.error,
        };
      }

      return {
        success: true,
        stats: {
          total_payouts: result.stats.totalPayouts,
          completed_payouts: result.stats.completedPayouts,
          pending_payouts: result.stats.pendingPayouts,
          failed_payouts: result.stats.failedPayouts,
          total_amount: result.stats.totalAmount,
          completed_amount: result.stats.completedAmount,
          pending_amount: result.stats.pendingAmount,
          total_fees: result.stats.totalFees,
          success_rate: result.stats.successRate,
          currency: result.stats.currency,
          payouts_by_method: result.stats.payoutsByMethod,
          payouts_by_status: result.stats.payoutsByStatus,
        },
        error_message: '',
      };
    } catch (error) {
      this.logger.error(`gRPC GetPayoutStats failed: ${error.message}`);
      return {
        success: false,
        error_message: error.message,
      };
    }
  }

  @GrpcMethod('PaymentEngineService', 'GetPayoutAnalytics')
  async getPayoutAnalyticsGrpc(data: any): Promise<any> {
    try {
      this.logger.log(`[gRPC] GetPayoutAnalytics for merchant ${data.merchant_id}, period: ${data.period}`);
      
      const period = data.period || '30d';
      let startDate: Date;
      const endDate = new Date();

      switch (period) {
        case '7d':
          startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      const { payouts } = await this.payoutService.listPayouts({
        merchantId: data.merchant_id_string || String(data.merchant_id),
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        limit: 10000,
      });

      const totalPayouts = payouts.length;
      const successfulPayouts = payouts.filter((p) => p.status === 'completed').length;
      const failedPayouts = payouts.filter((p) => p.status === 'failed').length;
      const totalVolume = payouts
        .filter((p) => p.status === 'completed')
        .reduce((sum, p) => sum + p.amount, 0);
      const successRate = totalPayouts > 0 ? (successfulPayouts / totalPayouts) * 100 : 0;
      const averagePayoutValue = successfulPayouts > 0 ? totalVolume / successfulPayouts : 0;

      const uniqueCustomers = new Set(
        payouts
          .map((p) => p.customerId)
          .filter(Boolean)
      ).size;

      const payoutMethods = payouts.reduce((acc, payout) => {
        const method = payout.payoutType;
        if (!acc[method]) {
          acc[method] = { count: 0, volume: 0 };
        }
        acc[method].count++;
        if (payout.status === 'completed') {
          acc[method].volume += payout.amount;
        }
        return acc;
      }, {});

      const topPayoutMethods = Object.entries(payoutMethods)
        .map(([method, data]: [string, any]) => ({
          method,
          count: data.count,
          volume: data.volume,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Generate trend data (daily aggregation)
      const trendData = [];
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const dayPayouts = payouts.filter((p) => 
          p.createdAt.toISOString().split('T')[0] === dateStr
        );
        
        const dayVolume = dayPayouts
          .filter((p) => p.status === 'completed')
          .reduce((sum, p) => sum + p.amount, 0);
        
        trendData.push({
          date: dateStr,
          volume: dayVolume,
          count: dayPayouts.length,
        });
        
        currentDate.setDate(currentDate.getDate() + 1);
      }

      return {
        success: true,
        message: 'Payout analytics retrieved successfully',
        period: data.period || '30d',
        date_range: {
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
        },
        metrics: {
          total_payouts: totalPayouts,
          successful_payouts: successfulPayouts,
          failed_payouts: failedPayouts,
          total_volume: totalVolume,
          success_rate: successRate,
          average_payout_value: averagePayoutValue,
          unique_customers: uniqueCustomers,
        },
        trends: trendData,
        top_payout_methods: topPayoutMethods,
      };
    } catch (error) {
      this.logger.error(`gRPC GetPayoutAnalytics failed: ${error.message}`);
      return {
        success: false,
        message: error.message,
        error_code: 'PAYOUT_ANALYTICS_FAILED',
      };
    }
  }

  @GrpcMethod('PaymentEngineService', 'GetPayoutDashboardAnalytics')
  async getPayoutDashboardAnalyticsGrpc(data: any): Promise<any> {
    try {
      this.logger.log(`[gRPC] GetPayoutDashboardAnalytics for merchant ${data.merchant_id}`);
      
      const period = data.period || '30d';
      let startDate: Date;
      const endDate = new Date();

      switch (period) {
        case '7d':
          startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      const filters = {
        merchantId: data.merchant_id_string || String(data.merchant_id),
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        currency: data.currency || 'INR',
        includeComparison: data.include_comparison || true,
        includeTimeSeries: false,
        granularity: 'day' as const,
        customerId: undefined,
        customerEmail: undefined,
        customerPhone: undefined,
        status: undefined,
        amountRange: undefined,
      };

      const analytics = await this.payoutService.getPayoutTransactionSummary(filters);

      return {
        total_manual_payments: analytics.totalManualPayments,
        payment_amount: analytics.paymentAmount,
        approved_payments: analytics.approvedPayments,
        avg_processing_time: analytics.avgProcessingTime,
        approved_today: analytics.approvedToday,
        pending_approval: analytics.pendingApproval,
        approval_rate: analytics.approvalRate,
        comparison: analytics.comparison ? {
          total_manual_payments: {
            previous_value: analytics.comparison.totalManualPayments.previousValue,
            change_percentage: analytics.comparison.totalManualPayments.changePercentage,
            trend: analytics.comparison.totalManualPayments.trend,
          },
          payment_amount: {
            previous_value: analytics.comparison.paymentAmount.previousValue,
            change_percentage: analytics.comparison.paymentAmount.changePercentage,
            trend: analytics.comparison.paymentAmount.trend,
          },
          approved_payments: {
            previous_value: analytics.comparison.approvedPayments.previousValue,
            change_percentage: analytics.comparison.approvedPayments.changePercentage,
            trend: analytics.comparison.approvedPayments.trend,
          },
          avg_processing_time: {
            previous_value: analytics.comparison.avgProcessingTime.previousValue,
            change_percentage: analytics.comparison.avgProcessingTime.changePercentage,
            trend: analytics.comparison.avgProcessingTime.trend,
          },
          approved_today: {
            previous_value: analytics.comparison.approvedToday.previousValue,
            change_percentage: analytics.comparison.approvedToday.changePercentage,
            trend: analytics.comparison.approvedToday.trend,
          },
          pending_approval: {
            previous_value: analytics.comparison.pendingApproval.previousValue,
            change_percentage: analytics.comparison.pendingApproval.changePercentage,
            trend: analytics.comparison.pendingApproval.trend,
          },
          approval_rate: {
            previous_value: analytics.comparison.approvalRate.previousValue,
            change_percentage: analytics.comparison.approvalRate.changePercentage,
            trend: analytics.comparison.approvalRate.trend,
          },
        } : null,
        period: analytics.period,
        currency: analytics.currency,
        last_updated: analytics.lastUpdated,
      };
    } catch (error) {
      this.logger.error(`[gRPC] GetPayoutDashboardAnalytics failed: ${error.message}`);
      return {
        total_manual_payments: 0,
        payment_amount: 0,
        approved_payments: 0,
        avg_processing_time: 0,
        approved_today: 0,
        pending_approval: 0,
        approval_rate: 0,
        comparison: null,
        period: '',
        currency: 'INR',
        last_updated: new Date().toISOString(),
        error_message: error.message,
      };
    }
  }

  @GrpcMethod('PaymentEngineService', 'CreateManualPayment')
  async createManualPaymentGrpc(data: any): Promise<any> {
    try {
      this.logger.log(`[gRPC] CreateManualPayment for merchant ${data.merchant_id}, order ${data.order_id}`);
      
      // Validate required fields
      if (!data.merchant_id || !data.order_id || !data.amount || !data.customer_name || !data.reason_for_manual_payment) {
        return {
          success: false,
          message: 'Missing required fields for manual payment creation',
          payment_id: '',
          status: 'failed',
          created_at: new Date().toISOString(),
          error_message: 'Missing required fields: merchant_id, order_id, amount, customer_name, reason_for_manual_payment',
        };
      }

      if (data.amount <= 0) {
        return {
          success: false,
          message: 'Amount must be greater than 0',
          payment_id: '',
          status: 'failed',
          created_at: new Date().toISOString(),
          error_message: 'Invalid amount',
        };
      }

      const result = await this.payoutService.createManualPayment({
        merchantId: data.merchant_id,
        orderId: data.order_id,
        amount: data.amount,
        currency: data.currency || 'INR',
        paymentMethod: data.payment_method || 'bank_transfer',
        customerName: data.customer_name,
        bankReferenceUtr: data.bank_reference_utr || '',
        reasonForManualPayment: data.reason_for_manual_payment,
        requestId: data.request_id,
      });

      return {
        success: result.success,
        message: result.message,
        payment_id: result.paymentId,
        status: result.status,
        created_at: result.createdAt,
        error_message: result.errorMessage || '',
      };

    } catch (error) {
      this.logger.error(`[gRPC] CreateManualPayment failed: ${error.message}`);
      return {
        success: false,
        message: 'Failed to create manual payment',
        payment_id: '',
        status: 'failed',
        created_at: new Date().toISOString(),
        error_message: error.message,
      };
    }
  }


}
