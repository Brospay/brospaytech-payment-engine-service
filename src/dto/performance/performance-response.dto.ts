import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseResponse } from '@/dto/common/response.dto';

/**
 * TSP Performance metrics
 */
export class TSPPerformanceDto {
  @ApiProperty({
    example: 'razorpay',
    description: 'TSP provider name'
  })
  provider: string;

  @ApiProperty({
    example: 98.5,
    description: 'Success rate percentage'
  })
  successRate: number;

  @ApiProperty({
    example: 750,
    description: 'Average latency in milliseconds'
  })
  averageLatency: number;

  @ApiProperty({
    example: 12500,
    description: 'Total transactions processed'
  })
  totalTransactions: number;

  @ApiProperty({
    example: 12312,
    description: 'Successful transactions'
  })
  successfulTransactions: number;

  @ApiProperty({
    example: 188,
    description: 'Failed transactions'
  })
  failedTransactions: number;

  @ApiProperty({
    example: 99.2,
    description: 'System uptime percentage'
  })
  uptime: number;

  @ApiProperty({
    example: '2024-01-20T10:00:00.000Z',
    description: 'Metrics start time'
  })
  periodStart: string;

  @ApiProperty({
    example: '2024-01-20T11:00:00.000Z',
    description: 'Metrics end time'
  })
  periodEnd: string;

  @ApiPropertyOptional({
    example: {
      minLatency: 250,
      maxLatency: 1500,
      p95Latency: 950,
      p99Latency: 1200
    },
    description: 'Latency distribution details'
  })
  latencyBreakdown?: {
    minLatency: number;
    maxLatency: number;
    p95Latency: number;
    p99Latency: number;
  };

  @ApiPropertyOptional({
    example: {
      networkErrors: 45,
      timeouts: 23,
      authenticationErrors: 12,
      systemErrors: 108
    },
    description: 'Error breakdown by type'
  })
  errorBreakdown?: Record<string, number>;
}

/**
 * Bank performance data
 */
export class BankPerformanceDto {
  @ApiPropertyOptional({
    example: 'HDFC',
    description: 'Bank code (if specific bank requested)'
  })
  bankCode?: string;

  @ApiProperty({
    example: [
      {
        bankCode: 'HDFC',
        bankName: 'HDFC Bank',
        successRate: 96.8,
        averageLatency: 1200,
        totalTransactions: 8500,
        downtimeMinutes: 15
      },
      {
        bankCode: 'SBI',
        bankName: 'State Bank of India',
        successRate: 94.2,
        averageLatency: 1800,
        totalTransactions: 12000,
        downtimeMinutes: 45
      }
    ],
    description: 'Bank performance metrics'
  })
  banks: Array<{
    bankCode: string;
    bankName: string;
    successRate: number;
    averageLatency: number;
    totalTransactions: number;
    downtimeMinutes: number;
  }>;

  @ApiProperty({
    example: '24h',
    description: 'Time range for metrics'
  })
  timeRange: string;

  @ApiProperty({
    example: '2024-01-20T10:30:00.000Z',
    description: 'Last updated timestamp'
  })
  lastUpdated: string;
}

/**
 * Performance summary data
 */
export class PerformanceSummaryDto {
  @ApiProperty({
    example: 97.3,
    description: 'Overall system success rate percentage'
  })
  overallSuccessRate: number;

  @ApiProperty({
    example: 825,
    description: 'System average latency in milliseconds'
  })
  averageLatency: number;

  @ApiProperty({
    example: 145000,
    description: 'Total transactions in time period'
  })
  totalTransactions: number;

  @ApiProperty({
    example: [
      { provider: 'razorpay', successRate: 98.5, volume: 65000 },
      { provider: 'stripe', successRate: 97.8, volume: 45000 },
      { provider: 'paytara', successRate: 95.2, volume: 35000 }
    ],
    description: 'Performance by TSP provider'
  })
  providerBreakdown: Array<{
    provider: string;
    successRate: number;
    volume: number;
  }>;

  @ApiProperty({
    example: [
      { method: 'upi', successRate: 98.2, volume: 85000 },
      { method: 'credit_card', successRate: 96.5, volume: 35000 },
      { method: 'net_banking', successRate: 94.8, volume: 25000 }
    ],
    description: 'Performance by payment method'
  })
  paymentMethodBreakdown: Array<{
    method: string;
    successRate: number;
    volume: number;
  }>;

  @ApiPropertyOptional({
    example: {
      peakHour: '14:00-15:00',
      peakVolume: 12500,
      lowHour: '03:00-04:00',
      lowVolume: 450
    },
    description: 'Peak and low traffic hours'
  })
  trafficPatterns?: {
    peakHour: string;
    peakVolume: number;
    lowHour: string;
    lowVolume: number;
  };
}

/**
 * TSP comparison data
 */
export class TSPComparisonDto {
  @ApiProperty({
    example: [
      {
        provider: 'razorpay',
        successRate: 98.5,
        averageLatency: 750,
        totalTransactions: 65000,
        uptime: 99.8
      },
      {
        provider: 'stripe',
        successRate: 97.8,
        averageLatency: 820,
        totalTransactions: 45000,
        uptime: 99.5
      }
    ],
    description: 'TSP performance comparisons'
  })
  comparisons: TSPPerformanceDto[];

  @ApiProperty({
    example: 'razorpay',
    description: 'Best performing TSP'
  })
  bestPerformer: string;

  @ApiProperty({
    example: 97.8,
    description: 'Average success rate across all TSPs'
  })
  averageSuccessRate: number;

  @ApiProperty({
    example: 785,
    description: 'Average latency across all TSPs'
  })
  averageLatency: number;

  @ApiProperty({
    example: '1h',
    description: 'Comparison time range'
  })
  timeRange: string;
}

/**
 * Performance alert data
 */
export class PerformanceAlertDto {
  @ApiProperty({
    example: 'alert_1',
    description: 'Unique alert identifier'
  })
  id: string;

  @ApiProperty({
    example: 'latency',
    description: 'Type of alert',
    enum: ['latency', 'success_rate', 'uptime', 'volume']
  })
  type: string;

  @ApiProperty({
    example: 'warning',
    description: 'Alert severity',
    enum: ['info', 'warning', 'critical']
  })
  severity: string;

  @ApiProperty({
    example: 'stripe',
    description: 'Affected provider'
  })
  provider: string;

  @ApiProperty({
    example: 'Average latency increased by 15% in last hour',
    description: 'Alert description'
  })
  message: string;

  @ApiProperty({
    example: 1000,
    description: 'Alert threshold value'
  })
  threshold: number;

  @ApiProperty({
    example: 1150,
    description: 'Current value that triggered alert'
  })
  current: number;

  @ApiProperty({
    example: '2024-01-20T10:15:00.000Z',
    description: 'Alert timestamp'
  })
  timestamp: string;
}

/**
 * Performance alerts collection
 */
export class PerformanceAlertsDto {
  @ApiProperty({
    description: 'Active alerts',
    type: [PerformanceAlertDto]
  })
  alerts: PerformanceAlertDto[];

  @ApiProperty({
    example: 5,
    description: 'Total number of alerts'
  })
  totalAlerts: number;

  @ApiProperty({
    example: 2,
    description: 'Number of critical alerts'
  })
  criticalAlerts: number;

  @ApiProperty({
    example: 3,
    description: 'Number of warning alerts'
  })
  warningAlerts: number;
}

/**
 * Response DTOs for each endpoint
 */
export class GetTSPPerformanceResponseDto extends BaseResponse<TSPPerformanceDto> {
  @ApiProperty({
    description: 'TSP performance metrics',
    type: TSPPerformanceDto
  })
  data: TSPPerformanceDto;
}

export class GetBankPerformanceResponseDto extends BaseResponse<BankPerformanceDto> {
  @ApiProperty({
    description: 'Bank performance data',
    type: BankPerformanceDto
  })
  data: BankPerformanceDto;
}

export class GetPerformanceSummaryResponseDto extends BaseResponse<PerformanceSummaryDto> {
  @ApiProperty({
    description: 'Performance summary data',
    type: PerformanceSummaryDto
  })
  data: PerformanceSummaryDto;
}

export class GetTSPComparisonResponseDto extends BaseResponse<TSPComparisonDto> {
  @ApiProperty({
    description: 'TSP comparison data',
    type: TSPComparisonDto
  })
  data: TSPComparisonDto;
}

export class GetPerformanceAlertsResponseDto extends BaseResponse<PerformanceAlertsDto> {
  @ApiProperty({
    description: 'Performance alerts data',
    type: PerformanceAlertsDto
  })
  data: PerformanceAlertsDto;
}




