import { Controller, Post, Get, Body, Query, Logger, HttpCode } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SettlementService } from './settlement.service';
import {
  CreateMerchantSettlementDto,
  MerchantSettlementResponseDto,
  GetSettlementStatusDto,
  SettlementStatusResponseDto
} from '../../dto/settlement/settlement.dto';

@Controller('settlements')
@ApiTags('settlements')
export class SettlementController {
  private readonly logger = new Logger(SettlementController.name);

  constructor(private readonly settlementService: SettlementService) {}

  @Post('merchant')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Create merchant settlement',
    description: 'Process merchant settlement with smart TSP routing and balance validation'
  })
  @ApiResponse({
    status: 200,
    description: 'Settlement created successfully',
    type: MerchantSettlementResponseDto
  })
  @ApiResponse({
    status: 400,
    description: 'Insufficient TSP balance or invalid request'
  })
  async createMerchantSettlement(
    @Body() request: CreateMerchantSettlementDto
  ): Promise<MerchantSettlementResponseDto> {
    this.logger.log(`Processing merchant settlement: ${request.settlementId}`, {
      merchantId: request.merchantId,
      amount: request.amount,
      requestId: request.requestId
    });

    return this.settlementService.createMerchantSettlement(request);
  }

  @Get('status')
  @ApiOperation({
    summary: 'Get settlement status',
    description: 'Retrieve current status of a settlement transaction'
  })
  @ApiResponse({
    status: 200,
    description: 'Settlement status retrieved successfully',
    type: SettlementStatusResponseDto
  })
  async getSettlementStatus(
    @Query() request: GetSettlementStatusDto
  ): Promise<SettlementStatusResponseDto> {
    this.logger.log(`Getting settlement status: ${request.settlementId}`);

    return this.settlementService.getSettlementStatus(request);
  }

  @GrpcMethod('PaymentEngineService', 'CreateMerchantSettlement')
  async createMerchantSettlementGrpc(request: any): Promise<any> {
    this.logger.log(`[gRPC] Processing merchant settlement: ${request.settlement_id}`, {
      merchantId: request.merchant_id,
      amount: request.amount
    });

    this.logger.log(`[gRPC] TSP Balances received:`, {
      tsp_balances_raw: request.tsp_balances,
      tsp_balances_type: typeof request.tsp_balances,
      tsp_balances_length: request.tsp_balances?.length,
      tsp_balances_json: JSON.stringify(request.tsp_balances)
    });

    const dto: CreateMerchantSettlementDto = {
      merchantId: request.merchant_id,
      settlementId: request.settlement_id,
      amount: request.amount,
      currency: request.currency || 'INR',
      beneficiaryAccount: request.beneficiary_account,
      beneficiaryIfsc: request.beneficiary_ifsc,
      beneficiaryName: request.beneficiary_name,
      description: request.description,
      type: request.type || 'MANUAL',
      priority: request.priority || 'MEDIUM',
      tspBalances: request.tsp_balances || [],
      metadata: request.metadata || {},
      requestId: request.request_id
    };

    this.logger.log(`[gRPC] DTO created with tspBalances:`, {
      tspBalances_count: dto.tspBalances?.length,
      tspBalances: JSON.stringify(dto.tspBalances)
    });

    const response = await this.settlementService.createMerchantSettlement(dto);

    return {
      success: response.success,
      settlement_id: response.settlementId,
      status: response.status,
      tsp_provider: response.tspProvider,
      external_transaction_id: response.externalTransactionId,
      amount: response.amount,
      currency: response.currency,
      routing_decision: {
        selected_tsp: response.routingDecision.selectedTSP,
        confidence: response.routingDecision.confidence,
        score: response.routingDecision.score,
        reasoning: response.routingDecision.reasoning,
        fallback_chain: response.routingDecision.fallbackChain
      },
      estimated_completion: response.estimatedCompletion,
      error_message: response.errorMessage
    };
  }

  @GrpcMethod('PaymentEngineService', 'GetSettlementStatus')
  async getSettlementStatusGrpc(request: any): Promise<any> {
    this.logger.log(`[gRPC] Getting settlement status: ${request.settlement_id}`);

    const dto: GetSettlementStatusDto = {
      settlementId: request.settlement_id,
      requestId: request.request_id
    };

    const response = await this.settlementService.getSettlementStatus(dto);

    return {
      success: response.success,
      settlement_id: response.settlementId,
      status: response.status,
      amount: response.amount,
      currency: response.currency,
      tsp_provider: response.tspProvider,
      external_transaction_id: response.externalTransactionId,
      failure_reason: response.failureReason,
      completed_at: response.completedAt,
      error_message: response.errorMessage
    };
  }
}

