import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { PublicApiEndpoint } from '@/common/decorators/api.decorators';
import { Public } from '@/common/guards/combined-auth.guard';
import {
  GetHealthStatusResponseDto,
  GetDetailedHealthStatusResponseDto,
  GetReadinessStatusResponseDto,
  GetLivenessStatusResponseDto
} from '@/dto/health/health-response.dto';

@Controller('health')
@ApiTags('health')
@Public() // Mark entire controller as public
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @PublicApiEndpoint(
    'Basic Health Check',
    'Returns basic health status of the payment engine service',
    GetHealthStatusResponseDto
  )
  async checkHealth(): Promise<GetHealthStatusResponseDto> {
    const healthData = await this.healthService.getHealthStatus();
    return {
      success: true,
      data: healthData as any,
      message: 'Health status retrieved successfully',
      error: null,
      meta: {
        request_id: `health_${Date.now()}`,
        timestamp: new Date().toISOString(),
        processing_time_ms: 1,
        api_version: 'v1',
        endpoint: 'GET /health',
        user_type: 'public',
      },
    };
  }

  @Get('detailed')
  @PublicApiEndpoint(
    'Detailed Health Check',
    'Returns detailed health status including component breakdown and system metrics',
    GetDetailedHealthStatusResponseDto
  )
  async checkDetailedHealth(): Promise<GetDetailedHealthStatusResponseDto> {
    const detailedHealthData = await this.healthService.getDetailedHealthStatus();
    return {
      success: true,
      data: detailedHealthData as any,
      message: 'Detailed health status retrieved successfully',
      error: null,
      meta: {
        request_id: `health_detailed_${Date.now()}`,
        timestamp: new Date().toISOString(),
        processing_time_ms: 2,
        api_version: 'v1',
        endpoint: 'GET /health/detailed',
        user_type: 'public',
      },
    };
  }

  @Get('readiness')
  @PublicApiEndpoint(
    'Readiness Check',
    'Returns whether the service is ready to accept traffic and process requests',
    GetReadinessStatusResponseDto
  )
  async checkReadiness(): Promise<GetReadinessStatusResponseDto> {
    const readinessData = await this.healthService.getReadinessStatus();
    return {
      success: true,
      data: readinessData as any,
      message: 'Readiness status retrieved successfully',
      error: null,
      meta: {
        request_id: `readiness_${Date.now()}`,
        timestamp: new Date().toISOString(),
        processing_time_ms: 1,
        api_version: 'v1',
        endpoint: 'GET /health/readiness',
        user_type: 'public',
      },
    };
  }

  @Get('liveness')
  @PublicApiEndpoint(
    'Liveness Check',
    'Returns whether the service is alive and responding to requests',
    GetLivenessStatusResponseDto
  )
  async checkLiveness(): Promise<GetLivenessStatusResponseDto> {
    const livenessData = await this.healthService.getLivenessStatus();
    return {
      success: true,
      data: livenessData as any,
      message: 'Liveness status retrieved successfully',
      error: null,
      meta: {
        request_id: `liveness_${Date.now()}`,
        timestamp: new Date().toISOString(),
        processing_time_ms: 1,
        api_version: 'v1',
        endpoint: 'GET /health/liveness',
        user_type: 'public',
      },
    };
  }
}
