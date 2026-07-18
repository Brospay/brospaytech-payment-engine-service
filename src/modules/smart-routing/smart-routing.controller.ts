import { Controller, Get, Post, Body, Headers, Param } from '@nestjs/common';
import { ApiTags, ApiSecurity, ApiParam } from '@nestjs/swagger';
import { SmartRoutingService } from './smart-routing.service';
import { RoutingFactorsService } from './routing-factors.service';
import { InternalApiEndpoint } from '@/common/decorators/api.decorators';
import { ResponseHelper } from '@/common/helpers/response.helper';
import { RoutingContext } from '@/types';
import {
  RoutingDecisionRequestDto,
  GetRoutingDecisionResponseDto,
  GetRoutingFactorsResponseDto,
  GetRoutingEngineHealthResponseDto
} from '@/dto/payment';

@Controller('smart-routing')
@ApiTags('smart-routing')
@ApiSecurity('API-Key')
export class SmartRoutingController {
  constructor(
    private readonly smartRoutingService: SmartRoutingService,
    private readonly routingFactorsService: RoutingFactorsService
  ) {}

  @Post('decision')
  @InternalApiEndpoint(
    'Get Routing Decision',
    'Determines the optimal TSP for payment processing based on multiple routing factors',
    GetRoutingDecisionResponseDto
  )
  async getRoutingDecision(
    @Body() context: RoutingDecisionRequestDto,
    @Headers('x-request-id') requestId: string
  ): Promise<GetRoutingDecisionResponseDto> {
    ResponseHelper.validateRequiredParams({ requestId });

    const routingContext: RoutingContext = {
      merchantId: context.merchantId,
      amount: context.amount,
      currency: context.currency,
      paymentMethod: context.paymentMethod,
      environment: context.environment
    };

    return ResponseHelper.executeServiceCall(
      () => this.smartRoutingService.getRoutingDecision(routingContext, requestId),
      requestId,
      'POST /smart-routing/decision',
      'Routing decision generated successfully',
      'ROUTING_DECISION_FAILED',
      'Failed to generate routing decision'
    ) as unknown as Promise<GetRoutingDecisionResponseDto>;
  }

  @Get('factors/:merchantId')
  @InternalApiEndpoint(
    'Get Routing Factors',
    'Retrieves detailed routing factors analysis for a merchant including available TSPs and their performance metrics',
    GetRoutingFactorsResponseDto
  )
  @ApiParam({
    name: 'merchantId',
    description: 'Merchant ID for routing analysis',
    example: '12345'
  })
  async getRoutingFactors(
    @Param('merchantId') merchantId: number,
    @Headers('x-request-id') requestId: string
  ): Promise<GetRoutingFactorsResponseDto> {
    ResponseHelper.validateRequiredParams({ merchantId, requestId });

    return ResponseHelper.executeServiceCall(
      async () => {
        // Mock context for factor analysis
        const context: RoutingContext = {
          merchantId: merchantId.toString(),
          amount: 1000,
          currency: 'INR',
          paymentMethod: 'upi',
          environment: 'production'
        };

        // Get available TSPs
        const tsps = await this.smartRoutingService['getAvailableTSPs'](context);
        
        // Calculate all factors
        const factors = await this.smartRoutingService['calculateRoutingFactors'](
          context, 
          tsps, 
          requestId
        );

        return {
          factors,
          availableTSPs: tsps.map(tsp => ({
            provider: tsp.providerName,
            isActive: tsp.isActive,
            environment: tsp.environment
          }))
        };
      },
      requestId,
      `GET /smart-routing/factors/${merchantId}`,
      'Routing factors retrieved successfully',
      'ROUTING_FACTORS_FAILED',
      'Failed to retrieve routing factors'
    );
  }

  @Get('health')
  @InternalApiEndpoint(
    'Get Routing Engine Health',
    'Returns the health status and capabilities of the smart routing engine',
    GetRoutingEngineHealthResponseDto
  )
  async getRoutingEngineHealth(
    @Headers('x-request-id') requestId: string
  ): Promise<GetRoutingEngineHealthResponseDto> {
    return ResponseHelper.executeServiceCall(
      () => Promise.resolve({
        status: 'healthy',
        engine: 'Smart Routing Engine v2.0',
        features: [
          '20+ routing factors',
          'Sub-32ms routing decisions',
          'Multi-layer caching',
          'Gaming industry optimization',
          'Real-time performance monitoring'
        ],
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      }),
      requestId,
      'GET /smart-routing/health',
      'Routing engine health retrieved successfully',
      'ROUTING_HEALTH_CHECK_FAILED',
      'Failed to retrieve routing engine health'
    );
  }
}
