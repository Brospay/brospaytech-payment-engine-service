import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseResponse } from '@/dto/common/response.dto';

/**
 * TSP information for routing
 */
export class TSPInfoDto {
  @ApiProperty({
    example: 'razorpay',
    description: 'TSP provider name'
  })
  provider: string;

  @ApiProperty({
    example: true,
    description: 'Whether TSP is active'
  })
  isActive: boolean;

  @ApiProperty({
    example: 'production',
    description: 'TSP environment'
  })
  environment: string;

  @ApiPropertyOptional({
    example: 98.5,
    description: 'Success rate percentage'
  })
  successRate?: number;

  @ApiPropertyOptional({
    example: 850,
    description: 'Average latency in milliseconds'
  })
  averageLatency?: number;
}

/**
 * Routing factors data
 */
export class RoutingFactorsDto {
  @ApiProperty({
    example: 95.2,
    description: 'Performance score (0-100)'
  })
  performanceScore: number;

  @ApiProperty({
    example: 2.5,
    description: 'Cost factor'
  })
  costFactor: number;

  @ApiProperty({
    example: 98.5,
    description: 'Success rate percentage'
  })
  successRate: number;

  @ApiProperty({
    example: 750,
    description: 'Average latency in milliseconds'
  })
  latency: number;

  @ApiProperty({
    example: 'high',
    description: 'Availability status',
    enum: ['high', 'medium', 'low']
  })
  availability: string;

  @ApiPropertyOptional({
    example: 87.5,
    description: 'Load balancing score'
  })
  loadScore?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether maintenance is scheduled'
  })
  maintenanceScheduled?: boolean;
}

/**
 * Routing decision data
 */
export class RoutingDecisionDto {
  @ApiProperty({
    example: 'razorpay',
    description: 'Selected payment service provider'
  })
  selectedProvider: string;

  @ApiProperty({
    example: 'Best performance and cost optimization',
    description: 'Reason for selection'
  })
  reason: string;

  @ApiProperty({
    example: ['stripe', 'paytara'],
    description: 'Alternative providers',
    type: [String]
  })
  alternativeProviders: string[];

  @ApiProperty({
    example: 94.8,
    description: 'Overall routing score (0-100)'
  })
  routingScore: number;

  @ApiProperty({
    example: 97.2,
    description: 'Estimated success rate percentage'
  })
  estimatedSuccessRate: number;

  @ApiProperty({
    example: 850,
    description: 'Estimated processing time in milliseconds'
  })
  estimatedLatency: number;

  @ApiPropertyOptional({
    example: 2.75,
    description: 'Processing fee amount'
  })
  processingFee?: number;

  @ApiProperty({
    example: 12,
    description: 'Decision processing time in milliseconds'
  })
  decisionTimeMs: number;

  @ApiPropertyOptional({
    description: 'Routing factors used in decision'
  })
  factors?: RoutingFactorsDto;
}

/**
 * Routing factors with available TSPs
 */
export class RoutingFactorsWithTSPsDto {
  @ApiProperty({
    description: 'Routing factors analysis',
    type: RoutingFactorsDto
  })
  factors: RoutingFactorsDto;

  @ApiProperty({
    description: 'Available TSPs',
    type: [TSPInfoDto]
  })
  availableTSPs: TSPInfoDto[];
}

/**
 * Routing engine health status
 */
export class RoutingEngineHealthDto {
  @ApiProperty({
    example: 'healthy',
    description: 'Engine status',
    enum: ['healthy', 'degraded', 'unhealthy']
  })
  status: string;

  @ApiProperty({
    example: 'Smart Routing Engine v2.0',
    description: 'Engine version information'
  })
  engine: string;

  @ApiProperty({
    example: [
      '20+ routing factors',
      'Sub-32ms routing decisions',
      'Multi-layer caching'
    ],
    description: 'Engine features',
    type: [String]
  })
  features: string[];

  @ApiProperty({
    example: 86400.5,
    description: 'Engine uptime in seconds'
  })
  uptime: number;

  @ApiProperty({
    example: '2024-01-20T10:30:00.000Z',
    description: 'Health check timestamp'
  })
  timestamp: string;
}

/**
 * Response DTOs for each endpoint
 */
export class GetRoutingDecisionResponseDto extends BaseResponse<RoutingDecisionDto> {
  @ApiProperty({
    description: 'Routing decision details',
    type: RoutingDecisionDto
  })
  data: RoutingDecisionDto;
}

export class GetRoutingFactorsResponseDto extends BaseResponse<RoutingFactorsWithTSPsDto> {
  @ApiProperty({
    description: 'Routing factors and available TSPs',
    type: RoutingFactorsWithTSPsDto
  })
  data: RoutingFactorsWithTSPsDto;
}

export class GetRoutingEngineHealthResponseDto extends BaseResponse<RoutingEngineHealthDto> {
  @ApiProperty({
    description: 'Routing engine health status',
    type: RoutingEngineHealthDto
  })
  data: RoutingEngineHealthDto;
}




