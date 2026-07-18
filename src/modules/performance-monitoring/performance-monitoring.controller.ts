import { Controller, Get, Query, Headers, Param, Logger } from '@nestjs/common';
import { ApiTags, ApiSecurity, ApiParam, ApiQuery } from '@nestjs/swagger';
import { GrpcMethod } from '@nestjs/microservices';
import { PerformanceMonitoringService } from './performance-monitoring.service';
import { AnalyticsApiEndpoint } from '@/common/decorators/api.decorators';
import { ResponseHelper } from '@/common/helpers/response.helper';
import {
  GetTSPPerformanceResponseDto,
  GetBankPerformanceResponseDto,
  GetPerformanceSummaryResponseDto,
  GetTSPComparisonResponseDto,
  GetPerformanceAlertsResponseDto
} from '@/dto/payment';

@Controller('performance')
@ApiTags('performance')
@ApiSecurity('API-Key')
export class PerformanceMonitoringController {
  private readonly logger = new Logger(PerformanceMonitoringController.name);

  constructor(
    private readonly performanceService: PerformanceMonitoringService,
  ) {}

  @Get('tsp/:provider')
  @AnalyticsApiEndpoint(
    'Get TSP Performance Metrics',
    'Retrieves detailed performance metrics for a specific payment service provider including success rates, latency, and error breakdown',
    GetTSPPerformanceResponseDto
  )
  @ApiParam({
    name: 'provider',
    description: 'TSP provider name',
    example: 'razorpay',
    enum: ['razorpay', 'stripe', 'paytara']
  })
  @ApiQuery({
    name: 'timeRange',
    description: 'Time range for metrics',
    example: 'realtime',
    enum: ['realtime', '1h', '24h', '7d'],
    required: false
  })
  async getTSPPerformance(
    @Param('provider') provider: string,
    @Query('timeRange') timeRange: 'realtime' | '1h' | '24h' | '7d' = 'realtime',
    @Headers('x-merchant-id') merchantId: string,
    @Headers('x-request-id') requestId = `perf_tsp_${Date.now()}`
  ): Promise<GetTSPPerformanceResponseDto> {
    ResponseHelper.validateMerchantHeaders(merchantId, requestId);
    ResponseHelper.validateRequiredParams({ provider });

    return ResponseHelper.executeServiceCall(
      () => this.performanceService.getTSPPerformance(provider, timeRange),
      requestId,
      `GET /performance/tsp/${provider}`,
      'TSP performance metrics retrieved successfully',
      'TSP_PERFORMANCE_RETRIEVAL_FAILED',
      'Failed to fetch TSP performance metrics'
    ) as unknown as Promise<GetTSPPerformanceResponseDto>;
  }

  @Get('banks')
  @AnalyticsApiEndpoint(
    'Get Bank Performance Insights',
    'Retrieves performance analytics for banking partners including success rates, latency, and downtime metrics',
    GetBankPerformanceResponseDto
  )
  @ApiQuery({
    name: 'bankCode',
    description: 'Specific bank code (optional)',
    example: 'HDFC',
    required: false
  })
  @ApiQuery({
    name: 'timeRange',
    description: 'Time range for bank metrics',
    example: '24h',
    enum: ['1h', '24h', '7d'],
    required: false
  })
  async getBankPerformance(
    @Headers('x-merchant-id') merchantId: string,
    @Query('bankCode') bankCode?: string,
    @Query('timeRange') timeRange: '1h' | '24h' | '7d' = '24h',
    @Headers('x-request-id') requestId = `perf_bank_${Date.now()}`
  ): Promise<GetBankPerformanceResponseDto> {
    ResponseHelper.validateMerchantHeaders(merchantId, requestId);

    return ResponseHelper.executeServiceCall(
      () => this.performanceService.getBankPerformance(bankCode, timeRange),
      requestId,
      'GET /performance/banks',
      'Bank performance data retrieved successfully',
      'BANK_PERFORMANCE_RETRIEVAL_FAILED',
      'Failed to fetch bank performance data'
    ) as unknown as Promise<GetBankPerformanceResponseDto>;
  }

  @Get('summary')
  @AnalyticsApiEndpoint(
    'Get Performance Summary',
    'Retrieves overall system performance summary including transaction volumes, success rates, and provider breakdown',
    GetPerformanceSummaryResponseDto
  )
  async getPerformanceSummary(
    @Headers('x-merchant-id') merchantId: string,
    @Headers('x-request-id') requestId = `perf_summary_${Date.now()}`
  ): Promise<GetPerformanceSummaryResponseDto> {
    ResponseHelper.validateMerchantHeaders(merchantId, requestId);

    return ResponseHelper.executeServiceCall(
      () => this.performanceService.getPerformanceSummary(),
      requestId,
      'GET /performance/summary',
      'Performance summary retrieved successfully',
      'PERFORMANCE_SUMMARY_FAILED',
      'Failed to fetch performance summary'
    ) as unknown as Promise<GetPerformanceSummaryResponseDto>;
  }

  @Get('tsps/comparison')
  @AnalyticsApiEndpoint(
    'Get TSP Performance Comparison',
    'Compares performance metrics across all payment service providers to identify best performers',
    GetTSPComparisonResponseDto
  )
  @ApiQuery({
    name: 'timeRange',
    description: 'Time range for comparison',
    example: '1h',
    enum: ['realtime', '1h', '24h', '7d'],
    required: false
  })
  async getTSPComparison(
    @Query('timeRange') timeRange: 'realtime' | '1h' | '24h' | '7d' = '1h',
    @Headers('x-merchant-id') merchantId: string,
    @Headers('x-request-id') requestId = `perf_comparison_${Date.now()}`
  ): Promise<GetTSPComparisonResponseDto> {
    ResponseHelper.validateMerchantHeaders(merchantId, requestId);

    return ResponseHelper.executeServiceCall(
      async () => {
        const tsps = ['paytara', 'razorpay', 'stripe'];
        const comparisons = [];
        
        for (const tsp of tsps) {
          const performance = await this.performanceService.getTSPPerformance(tsp, timeRange);
          comparisons.push({
            provider: tsp,
            ...performance,
          });
        }
        
        // Sort by success rate desc
        comparisons.sort((a, b) => b.successRate - a.successRate);
        
        return {
          comparisons,
          bestPerformer: comparisons[0]?.provider,
          averageSuccessRate: comparisons.reduce((sum, c) => sum + c.successRate, 0) / comparisons.length,
          averageLatency: comparisons.reduce((sum, c) => sum + c.averageLatency, 0) / comparisons.length,
          timeRange
        };
      },
      requestId,
      'GET /performance/tsps/comparison',
      'TSP comparison data retrieved successfully',
      'TSP_COMPARISON_FAILED',
      'Failed to fetch TSP comparison data'
    );
  }

  @Get('alerts')
  @AnalyticsApiEndpoint(
    'Get Performance Alerts',
    'Retrieves active performance alerts including critical and warning notifications for all TSPs',
    GetPerformanceAlertsResponseDto
  )
  async getPerformanceAlerts(
    @Headers('x-merchant-id') merchantId: string,
    @Headers('x-request-id') requestId = `perf_alerts_${Date.now()}`
  ): Promise<GetPerformanceAlertsResponseDto> {
    ResponseHelper.validateMerchantHeaders(merchantId, requestId);

    return ResponseHelper.executeServiceCall(
      () => Promise.resolve({
        alerts: [
          {
            id: 'alert_1',
            type: 'latency',
            severity: 'warning',
            provider: 'stripe',
            message: 'Average latency increased by 15% in last hour',
            threshold: 1000,
            current: 1150,
            timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
          },
          {
            id: 'alert_2', 
            type: 'success_rate',
            severity: 'critical',
            provider: 'paytara',
            message: 'Success rate dropped below 95%',
            threshold: 95,
            current: 92.5,
            timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          },
        ],
        totalAlerts: 2,
        criticalAlerts: 1,
        warningAlerts: 1,
      }),
      requestId,
      'GET /performance/alerts',
      'Performance alerts retrieved successfully',
      'PERFORMANCE_ALERTS_FAILED',
      'Failed to fetch performance alerts'
    );
  }

  /**
   * gRPC Method: GetPerformanceMetrics
   * Implements the GetPerformanceMetrics RPC from payment-engine.proto
   */
  @GrpcMethod('PaymentEngineService', 'GetPerformanceMetrics')
  async getPerformanceMetricsGrpc(data: any) {
    try {
      if (!data) {
        return {
          success: false,
          tsp_performance: [],
          error_message: 'No data received in gRPC call',
        };
      }

      const tspProvider = data.tsp_provider || data.tspProvider;
      const timeRangeStart = data.time_range_start || data.timeRangeStart;
      const timeRangeEnd = data.time_range_end || data.timeRangeEnd;
      const environment = data.environment;
      const requestId = data.request_id || data.requestId || `perf_grpc_${Date.now()}`;

      let timeRange: 'realtime' | '1h' | '24h' | '7d' = 'realtime';
      if (timeRangeStart && timeRangeEnd) {
        const start = new Date(timeRangeStart);
        const end = new Date(timeRangeEnd);
        const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        
        if (diffHours <= 0.1) {
          timeRange = 'realtime';
        } else if (diffHours <= 1) {
          timeRange = '1h';
        } else if (diffHours <= 24) {
          timeRange = '24h';
        } else {
          timeRange = '7d';
        }
      }

      if (tspProvider) {
        const performance = await this.performanceService.getTSPPerformance(tspProvider, timeRange);
        
        return {
          success: true,
          tsp_performance: [{
            provider_name: tspProvider,
            environment: environment || 'production',
            success_rate: performance.successRate,
            average_latency: Math.round(performance.averageLatency),
            total_transactions: performance.throughput || 0,
            measurement_window: timeRange,
            timestamp: performance.lastUpdated.toISOString(),
          }],
          system_performance: undefined,
          error_message: undefined,
        };
      }

      const commonTSPs = ['razorpay', 'paytara', 'stripe', 'kingdom_bank'];
      const tspPerformanceData = [];

      for (const tsp of commonTSPs) {
        try {
          const performance = await this.performanceService.getTSPPerformance(tsp, timeRange);
          tspPerformanceData.push({
            provider_name: tsp,
            environment: environment || 'production',
            success_rate: performance.successRate,
            average_latency: Math.round(performance.averageLatency),
            total_transactions: performance.throughput || 0,
            measurement_window: timeRange,
            timestamp: performance.lastUpdated.toISOString(),
          });
        } catch (error) {
          console.error(`Failed to get performance for ${tsp}:`, error);
        }
      }

      return {
        success: true,
        tsp_performance: tspPerformanceData,
        system_performance: undefined,
        error_message: undefined,
      };
    } catch (error: any) {
      return {
        success: false,
        tsp_performance: [],
        error_message: error?.message || 'Failed to get performance metrics',
      };
    }
  }

  /**
   * gRPC Method: GetTSPHealth
   * Implements the GetTSPHealth RPC from payment-engine.proto
   */
  @GrpcMethod('PaymentEngineService', 'GetTSPHealth')
  async getTSPHealthGrpc(data: any) {
    try {
      if (!data) {
        return {
          success: false,
          tsp_health: [],
          error_message: 'No data received in gRPC call',
        };
      }

      const providerName = data.provider_name || data.providerName;
      const environment = data.environment || 'production';
      const requestId = data.request_id || data.requestId || `tsp_health_grpc_${Date.now()}`;

      const healthData = await this.performanceService.getTSPHealth(providerName, environment);

      return {
        success: true,
        tsp_health: healthData,
        error_message: undefined,
      };
    } catch (error: any) {
      this.logger.error(`[gRPC] Error in getTSPHealthGrpc: ${error.message}`, error.stack);
      return {
        success: false,
        tsp_health: [],
        error_message: error?.message || 'Failed to get TSP health',
      };
    }
  }
}