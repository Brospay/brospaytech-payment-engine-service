import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseResponse } from '@/dto/common/response.dto';

/**
 * Basic health status
 */
export class HealthStatusDto {
  @ApiProperty({
    example: 'healthy',
    description: 'Overall health status',
    enum: ['healthy', 'degraded', 'unhealthy']
  })
  status: 'healthy' | 'degraded' | 'unhealthy';

  @ApiProperty({
    example: '2024-01-20T10:30:00.000Z',
    description: 'Health check timestamp'
  })
  timestamp: string;

  @ApiProperty({
    example: 86400.5,
    description: 'Service uptime in seconds'
  })
  uptime: number;

  @ApiProperty({
    example: '1.0.0',
    description: 'Service version'
  })
  version: string;

  @ApiPropertyOptional({
    example: 'All systems operational',
    description: 'Status message'
  })
  message?: string;
}

/**
 * Detailed health status with component breakdown
 */
export class DetailedHealthStatusDto extends HealthStatusDto {
  @ApiProperty({
    example: {
      database: { status: 'healthy', responseTime: 25 },
      redis: { status: 'healthy', responseTime: 12 },
      merchantService: { status: 'healthy', responseTime: 45 },
      walletService: { status: 'healthy', responseTime: 38 }
    },
    description: 'Health status of individual components'
  })
  components: Record<string, {
    status: 'healthy' | 'degraded' | 'unhealthy';
    responseTime?: number;
    message?: string;
  }>;

  @ApiPropertyOptional({
    example: {
      memoryUsage: { used: 512, total: 1024, unit: 'MB' },
      cpuUsage: 25.5,
      diskUsage: { used: 45.2, total: 100, unit: 'GB' }
    },
    description: 'System resource usage'
  })
  resources?: {
    memoryUsage: { used: number; total: number; unit: string };
    cpuUsage: number;
    diskUsage: { used: number; total: number; unit: string };
  };

  @ApiPropertyOptional({
    example: {
      totalRequests: 125000,
      successfulRequests: 122750,
      failedRequests: 2250,
      averageResponseTime: 850
    },
    description: 'Service performance metrics'
  })
  metrics?: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
  };
}

/**
 * Readiness check status
 */
export class ReadinessStatusDto {
  @ApiProperty({
    example: true,
    description: 'Whether service is ready to serve requests'
  })
  ready: boolean;

  @ApiProperty({
    example: '2024-01-20T10:30:00.000Z',
    description: 'Readiness check timestamp'
  })
  timestamp: string;

  @ApiProperty({
    example: {
      database: true,
      redis: true,
      externalAPIs: true
    },
    description: 'Readiness status of dependencies'
  })
  dependencies: Record<string, boolean>;

  @ApiPropertyOptional({
    example: 'Service is ready to accept traffic',
    description: 'Readiness message'
  })
  message?: string;
}

/**
 * Liveness check status
 */
export class LivenessStatusDto {
  @ApiProperty({
    example: true,
    description: 'Whether service is alive and responding'
  })
  alive: boolean;

  @ApiProperty({
    example: '2024-01-20T10:30:00.000Z',
    description: 'Liveness check timestamp'
  })
  timestamp: string;

  @ApiProperty({
    example: 86400.5,
    description: 'Process uptime in seconds'
  })
  uptime: number;

  @ApiPropertyOptional({
    example: 'Service is alive and processing requests',
    description: 'Liveness message'
  })
  message?: string;
}

/**
 * Response DTOs for health endpoints
 */
export class GetHealthStatusResponseDto extends BaseResponse<HealthStatusDto> {
  @ApiProperty({
    description: 'Basic health status',
    type: HealthStatusDto
  })
  data: HealthStatusDto;
}

export class GetDetailedHealthStatusResponseDto extends BaseResponse<DetailedHealthStatusDto> {
  @ApiProperty({
    description: 'Detailed health status with components',
    type: DetailedHealthStatusDto
  })
  data: DetailedHealthStatusDto;
}

export class GetReadinessStatusResponseDto extends BaseResponse<ReadinessStatusDto> {
  @ApiProperty({
    description: 'Service readiness status',
    type: ReadinessStatusDto
  })
  data: ReadinessStatusDto;
}

export class GetLivenessStatusResponseDto extends BaseResponse<LivenessStatusDto> {
  @ApiProperty({
    description: 'Service liveness status',
    type: LivenessStatusDto
  })
  data: LivenessStatusDto;
}




