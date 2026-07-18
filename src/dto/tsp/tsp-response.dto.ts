import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseResponse } from '@/dto/common/response.dto';

/**
 * TSP configuration data
 */
export class TSPConfigurationDto {
  @ApiProperty({
    example: 'tsp_config_123',
    description: 'Unique TSP configuration ID'
  })
  configurationId: string;

  @ApiProperty({
    example: 'stripe',
    description: 'TSP provider name'
  })
  providerName: string;

  @ApiProperty({
    example: 'production',
    description: 'Environment',
    enum: ['sandbox', 'production']
  })
  environment: string;

  @ApiProperty({
    example: true,
    description: 'Whether the TSP is active'
  })
  isActive: boolean;

  @ApiPropertyOptional({
    example: 'https://api.stripe.com',
    description: 'TSP API base URL'
  })
  baseUrl?: string;

  @ApiProperty({
    example: ['upi', 'credit_card', 'debit_card'],
    description: 'Supported payment methods',
    type: [String]
  })
  supportedPaymentMethods: string[];

  @ApiPropertyOptional({
    example: {
      transactionFee: 2.9,
      fixedFee: 0.30,
      currency: 'INR'
    },
    description: 'Fee structure'
  })
  feeStructure?: Record<string, any>;

  @ApiPropertyOptional({
    example: {
      timeout: 30000,
      retryAttempts: 3,
      backoffStrategy: 'exponential'
    },
    description: 'API configuration'
  })
  apiConfig?: Record<string, any>;

  @ApiProperty({
    example: '2024-01-20T10:30:00.000Z',
    description: 'Configuration created timestamp'
  })
  createdAt: string;

  @ApiProperty({
    example: '2024-01-20T15:45:00.000Z',
    description: 'Configuration last updated timestamp'
  })
  updatedAt: string;

  @ApiPropertyOptional({
    example: { region: 'india', priority: 1 },
    description: 'Additional metadata'
  })
  metadata?: Record<string, any>;

  @ApiPropertyOptional({
    example: {
      status: 'healthy',
      lastCheck: '2024-01-20T15:50:00.000Z',
      responseTime: 250
    },
    description: 'Health status information'
  })
  healthStatus?: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    lastCheck: string;
    responseTime: number;
  };
}

/**
 * Response for getting all TSP configurations
 */
export class GetTSPConfigurationsResponseDto extends BaseResponse<TSPConfigurationDto[]> {
  @ApiProperty({
    description: 'List of TSP configurations',
    type: [TSPConfigurationDto]
  })
  data: TSPConfigurationDto[];
}

/**
 * Response for creating TSP configuration
 */
export class CreateTSPConfigurationResponseDto extends BaseResponse<TSPConfigurationDto> {
  @ApiProperty({
    description: 'Created TSP configuration',
    type: TSPConfigurationDto
  })
  data: TSPConfigurationDto;
}

/**
 * Response for getting single TSP configuration
 */
export class GetTSPConfigurationResponseDto extends BaseResponse<TSPConfigurationDto> {
  @ApiProperty({
    description: 'TSP configuration details',
    type: TSPConfigurationDto
  })
  data: TSPConfigurationDto;
}




