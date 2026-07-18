import { 
  Controller, 
  Post, 
  Get, 
  Delete,
  Body, 
  Param, 
  Query,
  Headers,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Res
} from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity, ApiParam, ApiQuery } from '@nestjs/swagger';
import { LoggerService } from '@/common/services/logger.service';
import { RefundService } from './refund.service';
import { CreateRefundDto } from '@/dto/refund/create-refund.dto';
import { ApproveRefundDto, RefundAction } from '@/dto/refund/approve-refund.dto';
import { 
  CreateRefundResponseDto, 
  GetRefundResponseDto, 
  ListRefundsResponseDto,
  RefundDto 
} from '@/dto/refund/refund-response.dto';
import { BaseResponse } from '@/dto/common/response.dto';
import { ResponseHelper } from '@/common/helpers/response.helper';
import { RefundStatus } from '@/entities/refund.entity';

/**
 * Refund Controller
 * Handles both REST (for merchants) and gRPC (for admin approval) endpoints
 * Following the same pattern as PaymentIntentController
 */
@Controller('refunds')
@ApiTags('refunds')
@ApiSecurity('API-Key')
export class RefundController {
  constructor(
    private readonly refundService: RefundService,
    private readonly logger: LoggerService
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'Create refund',
    description: 'Initiate a refund for a successful transaction. Only requires customerId and transactionId.'
  })
  @ApiResponse({
    status: 201,
    description: 'Refund created successfully',
    type: CreateRefundResponseDto
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid input or business rule violation'
  })
  @ApiResponse({
    status: 404,
    description: 'Transaction not found'
  })
  @ApiResponse({
    status: 409,
    description: 'Transaction already refunded'
  })
  async createRefund(
    @Headers('x-merchant-id') merchantId: string,
    @Headers('x-request-id') requestId: string,
    @Body() createRefundDto: CreateRefundDto
  ): Promise<any> {
    ResponseHelper.validateMerchantHeaders(merchantId, requestId);

    return ResponseHelper.executeServiceCall(
      () => this.refundService.createRefund(merchantId, createRefundDto),
      requestId,
      'POST /refunds',
      'Refund created successfully',
      'REFUND_CREATION_FAILED',
      'Refund creation failed'
    );
  }

  /**
   * Batch refund endpoint for processing multiple refunds at once
   */
  @Post('batch')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'Create batch refunds',
    description: 'Merchant can create multiple refunds in a single request'
  })
  @ApiResponse({
    status: 201,
    description: 'Batch refunds processed'
  })
  async createBatchRefund(
    @Headers('x-merchant-id') merchantId: string,
    @Headers('x-request-id') requestId: string,
    @Body() batchRefundDto: { refunds: Array<{ customerId: string; transactionId: string; reason: string }> }
  ): Promise<any> {
    ResponseHelper.validateMerchantHeaders(merchantId, requestId);

    return ResponseHelper.executeServiceCall(
      () => this.refundService.createBatchRefund(merchantId, batchRefundDto.refunds, requestId),
      requestId,
      'POST /refunds/batch',
      'Batch refunds processed successfully',
      'BATCH_REFUND_FAILED',
      'Batch refund processing failed'
    );
  }

  @Get(':refundId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Get refund status',
    description: 'Retrieve details and current status of a refund'
  })
  @ApiParam({
    name: 'refundId',
    description: 'Refund ID',
    example: 'refund_abc123def456'
  })
  @ApiResponse({
    status: 200,
    description: 'Refund details retrieved successfully',
    type: GetRefundResponseDto
  })
  @ApiResponse({
    status: 404,
    description: 'Refund not found'
  })
  async getRefund(
    @Param('refundId') refundId: string,
    @Headers('x-merchant-id') merchantId: string,
    @Headers('x-request-id') requestId: string
  ): Promise<any> {
    ResponseHelper.validateMerchantHeaders(merchantId, requestId);

    return ResponseHelper.executeServiceCall(
      () => this.refundService.getRefund(refundId, merchantId),
      requestId,
      `GET /refunds/${refundId}`,
      'Refund retrieved successfully',
      'REFUND_RETRIEVAL_FAILED',
      'Refund retrieval failed'
    );
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'List refunds',
    description: 'Retrieve a paginated list of refunds with optional filters'
  })
  @ApiQuery({
    name: 'customerId',
    required: false,
    description: 'Filter by customer ID',
    example: 'cust_abc123'
  })
  @ApiQuery({
    name: 'transactionId',
    required: false,
    description: 'Filter by transaction ID',
    example: 'txn_xyz789'
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: RefundStatus,
    description: 'Filter by refund status'
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Filter by start date (ISO 8601)',
    example: '2024-01-01T00:00:00Z'
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'Filter by end date (ISO 8601)',
    example: '2024-12-31T23:59:59Z'
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number',
    example: 1
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Items per page',
    example: 20
  })
  @ApiResponse({
    status: 200,
    description: 'Refunds retrieved successfully',
    type: ListRefundsResponseDto
  })
  async listRefunds(
    @Headers('x-merchant-id') merchantId: string,
    @Headers('x-request-id') requestId: string,
    @Query('customerId') customerId?: string,
    @Query('transactionId') transactionId?: string,
    @Query('status') status?: RefundStatus,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('currency') currency?: string
  ): Promise<any> {
    ResponseHelper.validateMerchantHeaders(merchantId, requestId);

    const filters = {
      customerId,
      transactionId,
      status,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      currency
    };

    const pagination = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20
    };

    return ResponseHelper.executeServiceCall(
      () => this.refundService.listRefunds(merchantId, filters, pagination),
      requestId,
      'GET /refunds',
      'Refunds retrieved successfully',
      'REFUND_LIST_RETRIEVAL_FAILED',
      'Failed to retrieve refunds'
    );
  }

  @Delete(':refundId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Cancel refund',
    description: 'Cancel a pending or processing refund'
  })
  @ApiParam({
    name: 'refundId',
    description: 'Refund ID',
    example: 'refund_abc123def456'
  })
  @ApiResponse({
    status: 200,
    description: 'Refund cancelled successfully',
    type: GetRefundResponseDto
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot cancel refund in current status'
  })
  @ApiResponse({
    status: 404,
    description: 'Refund not found'
  })
  async cancelRefund(
    @Param('refundId') refundId: string,
    @Headers('x-merchant-id') merchantId: string,
    @Headers('x-request-id') requestId: string
  ): Promise<any> {
    ResponseHelper.validateMerchantHeaders(merchantId, requestId);

    return ResponseHelper.executeServiceCall(
      () => this.refundService.cancelRefund(refundId, merchantId),
      requestId,
      `DELETE /refunds/${refundId}`,
      'Refund cancelled successfully',
      'REFUND_CANCELLATION_FAILED',
      'Failed to cancel refund'
    );
  }

  /**
   * Get refund statistics for a merchant
   */
  @Get('stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Get refund statistics',
    description: 'Get aggregate refund statistics for the merchant'
  })
  async getRefundStats(
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('currency') currency?: string,
    @Headers('x-merchant-id') merchantId?: string,
    @Headers('x-request-id') requestId?: string
  ): Promise<any> {
    ResponseHelper.validateMerchantHeaders(merchantId, requestId);

    return ResponseHelper.executeServiceCall(
      () => this.refundService.getRefundStats(merchantId, startDate, endDate, currency),
      requestId,
      'GET /refunds/stats',
      'Refund statistics retrieved successfully',
      'REFUND_STATS_FAILED',
      'Failed to retrieve refund statistics'
    );
  }

  /**
   * Get refund analytics for a merchant
   */
  @Get('analytics')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Get refund analytics',
    description: 'Get time-series refund analytics for the merchant'
  })
  async getRefundAnalytics(
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('granularity') granularity?: 'day' | 'week' | 'month',
    @Headers('x-merchant-id') merchantId?: string,
    @Headers('x-request-id') requestId?: string
  ): Promise<any> {
    ResponseHelper.validateMerchantHeaders(merchantId, requestId);

    return ResponseHelper.executeServiceCall(
      () => this.refundService.getRefundAnalytics(merchantId, startDate, endDate, granularity),
      requestId,
      'GET /refunds/analytics',
      'Refund analytics retrieved successfully',
      'REFUND_ANALYTICS_FAILED',
      'Failed to retrieve refund analytics'
    );
  }

  /**
   * Export refunds to CSV
   */
  @Get('export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Export refunds to CSV',
    description: 'Export refund list as CSV file'
  })
  async exportRefunds(
    @Query('customer_id') customerId?: string,
    @Query('status') status?: string,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Headers('x-merchant-id') merchantId?: string,
    @Headers('x-request-id') requestId?: string,
    @Res() res?: any
  ): Promise<any> {
    ResponseHelper.validateMerchantHeaders(merchantId, requestId);

    const csvData = await this.refundService.exportRefundsToCSV(merchantId, {
      customerId,
      status,
      startDate,
      endDate
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=refunds_${Date.now()}.csv`);
    return res.send(csvData);
  }

  // /**
  //  * Admin endpoint to approve or reject a pending refund
  //  */
  // @Post(':refundId/approve')
  // @HttpCode(HttpStatus.OK)
  // @ApiOperation({ 
  //   summary: 'Approve or reject refund (Admin)',
  //   description: 'Admin can approve or reject a pending refund request'
  // })
  // @ApiParam({
  //   name: 'refundId',
  //   description: 'Refund ID',
  //   example: 'refund_abc123def456'
  // })
  // @ApiResponse({
  //   status: 200,
  //   description: 'Refund approved/rejected successfully',
  //   type: GetRefundResponseDto
  // })
  // @ApiResponse({
  //   status: 400,
  //   description: 'Invalid refund status for approval'
  // })
  // @ApiResponse({
  //   status: 404,
  //   description: 'Refund not found'
  // })
  // async approveRefund(
  //   @Param('refundId') refundId: string,
  //   @Headers('x-request-id') requestId: string,
  //   @Body() approveDto: ApproveRefundDto
  // ): Promise<any> {
  //   if (!requestId) {
  //     throw new BadRequestException('x-request-id header is required');
  //   }

  //   const message = approveDto.action === 'approve' 
  //     ? 'Refund approved successfully' 
  //     : 'Refund rejected successfully';

  //   return ResponseHelper.executeServiceCall(
  //     () => this.refundService.approveRefund(refundId, approveDto, requestId),
  //     requestId,
  //     `POST /refunds/${refundId}/approve`,
  //     message,
  //     'REFUND_APPROVAL_FAILED',
  //     'Failed to approve/reject refund'
  //   );
  // }

  /**
   * gRPC: Create single refund
   */
  @GrpcMethod('PaymentEngineService', 'CreateRefund')
  async createRefundGrpc(data: {
    merchant_id: string;
    customer_id: string;
    transaction_id: string;
    reason: string;
    request_id: string;
  }): Promise<any> {
    try {
      this.logger.log(`[gRPC] CreateRefund: merchant=${data.merchant_id}, transaction=${data.transaction_id}`);
      console.log('getting data from grpc', data);

      const refund = await this.refundService.createRefund(data.merchant_id, {
        customerId: data.customer_id,
        transactionId: data.transaction_id,
        reason: data.reason,
        requestId: data.request_id
      });

      return {
        success: true,
        message: 'Refund created successfully',
        refund: this.mapRefundToGrpc(refund),
        error_code: ''
      };
    } catch (error) {
      this.logger.error(`[gRPC] CreateRefund error: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || 'Refund creation failed',
        refund: null,
        error_code: error.name || 'REFUND_CREATION_FAILED'
      };
    }
  }

  /**
   * gRPC: Create batch refunds
   */
  @GrpcMethod('PaymentEngineService', 'CreateBatchRefund')
  async createBatchRefundGrpc(data: {
    merchant_id: string;
    refunds: Array<{
      customer_id: string;
      transaction_id: string;
      reason: string;
    }>;
    request_id: string;
  }): Promise<any> {
    try {
      this.logger.log(`[gRPC] CreateBatchRefund: merchant=${data.merchant_id}, count=${data.refunds.length}`);

      const result = await this.refundService.createBatchRefund(
        data.merchant_id,
        data.refunds.map(r => ({
          customerId: r.customer_id,
          transactionId: r.transaction_id,
          reason: r.reason
        })),
        data.request_id
      );

      return {
        success: true,
        message: 'Batch refunds processed',
        refunds: result.successful.map(r => this.mapRefundToGrpc(r)),
        errors: result.failed.map(f => ({
          transaction_id: f.transactionId,
          customer_id: f.customerId,
          error_message: f.error
        })),
        total_requested: result.totalRequested,
        total_successful: result.totalSuccessful,
        total_failed: result.totalFailed
      };
    } catch (error) {
      this.logger.error(`[gRPC] CreateBatchRefund error: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || 'Batch refund processing failed',
        refunds: [],
        errors: [],
        total_requested: 0,
        total_successful: 0,
        total_failed: 0
      };
    }
  }

  /**
   * gRPC: Get refund details
   */
  @GrpcMethod('PaymentEngineService', 'GetRefund')
  async getRefundGrpc(data: {
    refund_id: string;
    merchant_id: string;
  }): Promise<any> {
    try {
      this.logger.log(`[gRPC] GetRefund: refund=${data.refund_id}, merchant=${data.merchant_id}`);

      const refund = await this.refundService.getRefund(data.refund_id, data.merchant_id);

      return {
        success: true,
        message: 'Refund retrieved successfully',
        refund: this.mapRefundToGrpc(refund),
        error_code: ''
      };
    } catch (error) {
      this.logger.error(`[gRPC] GetRefund error: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || 'Refund retrieval failed',
        refund: null,
        error_code: error.name || 'REFUND_NOT_FOUND'
      };
    }
  }

  /**
   * gRPC: List refunds with filters
   */
  @GrpcMethod('PaymentEngineService', 'ListRefunds')
  async listRefundsGrpc(data: {
    merchant_id: string;
    customer_id?: string;
    transaction_id?: string;
    status?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    limit?: number;
    currency?: string;
  }): Promise<any> {
    try {
      this.logger.log(`[gRPC] ListRefunds called with data: ${JSON.stringify(data)}`);
      

      const filters = {
        customerId: data.customer_id,
        transactionId: data.transaction_id,
        status: data.status as RefundStatus,
        startDate: data.start_date ? new Date(data.start_date) : undefined,
        endDate: data.end_date ? new Date(data.end_date) : undefined,
        currency: data.currency
      };

      const pagination = {
        page: data.page || 1,
        limit: data.limit || 20
      };

      const result = await this.refundService.listRefunds(data.merchant_id, filters, pagination);

      return {
        success: true,
        message: 'Refunds retrieved successfully',
        refunds: result.refunds.map(r => this.mapRefundToGrpc(r)),
        pagination: {
          page: result.pagination.page,
          limit: result.pagination.limit,
          total: result.pagination.total,
          total_pages: result.pagination.totalPages
        }
      };
    } catch (error) {
      this.logger.error(`[gRPC] ListRefunds error: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || 'Failed to retrieve refunds',
        refunds: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          total_pages: 0
        }
      };
    }
  }

  /**
   * gRPC: Get refund statistics
   */
  @GrpcMethod('PaymentEngineService', 'GetRefundStats')
  async getRefundStatsGrpc(data: {
    merchant_id: string;
    start_date?: string;
    end_date?: string;
    currency?: string;
    request_id?: string;
  }): Promise<any> {
    try {
      this.logger.log(`[gRPC] GetRefundStats: merchant=${data.merchant_id}`);

      // Pass merchant_id (empty string means "all merchants" for admin dashboard)
      const stats = await this.refundService.getRefundStats(
        data.merchant_id || '', // Empty string will be handled by service to return all refunds
        data.start_date,
        data.end_date,
        data.currency
      );

      return {
        success: true,
        stats: {
          total_refunds: stats.total,
          pending_refunds: stats.pending,
          approved_refunds: stats.approved,
          rejected_refunds: stats.rejected,
          processing_refunds: stats.processing,
          completed_refunds: stats.completed,
          failed_refunds: stats.failed,
          cancelled_refunds: stats.cancelled,
          total_refund_amount: stats.totalAmount,
          average_refund_amount: stats.averageAmount,
          average_processing_time: stats.averageProcessingTime,
          refund_rate: stats.refundRate
        },
        message: 'Refund statistics retrieved successfully',
        error_message: ''
      };
    } catch (error) {
      this.logger.error(`[gRPC] GetRefundStats error: ${error.message}`, error.stack);
      return {
        success: false,
        stats: {
          total_refunds: 0,
          pending_refunds: 0,
          approved_refunds: 0,
          rejected_refunds: 0,
          processing_refunds: 0,
          completed_refunds: 0,
          failed_refunds: 0,
          cancelled_refunds: 0,
          total_refund_amount: 0,
          average_refund_amount: 0,
          average_processing_time: 0,
          refund_rate: 0
        },
        message: '',
        error_message: error.message || 'Failed to retrieve refund statistics'
      };
    }
  }

  /**
   * gRPC: Cancel refund
   */
  @GrpcMethod('PaymentEngineService', 'CancelRefund')
  async cancelRefundGrpc(data: {
    refund_id: string;
    merchant_id: string;
  }): Promise<any> {
    try {
      this.logger.log(`[gRPC] CancelRefund: refund=${data.refund_id}, merchant=${data.merchant_id}`);

      const refund = await this.refundService.cancelRefund(data.refund_id, data.merchant_id);

      return {
        success: true,
        message: 'Refund cancelled successfully',
        refund: this.mapRefundToGrpc(refund),
        error_code: ''
      };
    } catch (error) {
      this.logger.error(`[gRPC] CancelRefund error: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || 'Refund cancellation failed',
        refund: null,
        error_code: error.name || 'REFUND_CANCELLATION_FAILED'
      };
    }
  }

  /**
   * gRPC: Approve/Reject refund (Admin only)
   */
  @GrpcMethod('PaymentEngineService', 'ApproveRefund')
  async approveRefund(data: {
    refund_id: string;
    action: string;
    approved_by: string;
    notes?: string;
  }): Promise<any> {
    try {
      console.log("APPPROVING REFUNDS === ====== ")
      console.log("=== gRPC ApproveRefund called ===")
      console.log("Data received:", JSON.stringify(data, null, 2))
      
      this.logger.log(`[gRPC] ApproveRefund: refund=${data.refund_id}, action=${data.action}, by=${data.approved_by}`);

      const refund = await this.refundService.approveRefund(
        data.refund_id,
        {
          action: data.action as any,
          approvedBy: data.approved_by,
          notes: data.notes
        },
        `grpc_${Date.now()}`
      );

      return {
        success: true,
        message: `Refund ${data.action === 'approve' ? 'approved' : 'rejected'} successfully`,
        refund: this.mapRefundToGrpc(refund),
        error_code: ''
      };
    } catch (error) {
      this.logger.error(`[gRPC] ApproveRefund error: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || 'Refund approval failed',
        refund: null,
        error_code: error.name || 'REFUND_APPROVAL_FAILED'
      };
    }
  }

  /**
   * Maps RefundDto to gRPC response format
   */
  private mapRefundToGrpc(refund: any): any {
    return {
      refund_id: refund.refundId,
      merchant_id: refund.merchantId,
      customer_id: refund.customerId,
      transaction_id: refund.transactionId,
      payment_intent_id: refund.paymentIntentId,
      amount: refund.amount,
      original_amount: refund.originalAmount,
      currency: refund.currency,
      refund_type: refund.refundType,
      status: refund.status,
      tsp_provider: refund.tspProvider,
      external_refund_id: refund.externalRefundId || '',
      reason: refund.reason,
      created_at: refund.createdAt,
      completed_at: refund.completedAt || '',
      failure_reason: refund.failureReason || '',
      processing_time_ms: refund.processingTimeMs || 0,
      auto_process: refund.autoProcess || false,
      approved_by: refund.approvedBy || '',
      approved_at: refund.approvedAt || '',
      approval_notes: refund.approvalNotes || ''
    };
  }
}
