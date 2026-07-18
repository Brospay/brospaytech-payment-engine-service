import { Transform } from 'class-transformer';
import { IsString, IsNumber, IsBoolean, IsOptional, IsIn } from 'class-validator';

export class EnvironmentVariables {
  @IsIn(['development', 'production', 'sandbox'])
  NODE_ENV: 'development' | 'production' | 'sandbox';

  // Database Configuration
  @IsString()
  DATABASE_HOST: string;

  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  DATABASE_PORT: number;

  @IsString()
  DATABASE_USERNAME: string;

  @IsString()
  DATABASE_PASSWORD: string;

  @IsString()
  DATABASE_NAME: string;

  // Redis Configuration
  @IsString()
  REDIS_HOST: string;

  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  REDIS_PORT: number;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD: string;

  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  REDIS_DB: number;

  // Server Configuration
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  HTTP_PORT: number;

  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  GRPC_PORT: number;

  // Security Configuration
  @IsString()
  JWT_SECRET: string;

  @IsString()
  JWT_REFRESH_SECRET: string;

  @IsString()
  API_KEY_ENCRYPTION_SECRET: string;

  @IsString()
  TSP_CREDENTIAL_ENCRYPTION_SECRET: string;

  @IsString()
  HMAC_SECRET: string;

  @IsString()
  INTERNAL_SERVICE_SECRET: string;

  // Kafka Configuration
  @IsString()
  @IsOptional()
  KAFKA_BROKERS?: string;

  @IsString()
  @IsOptional()
  KAFKA_CLIENT_ID?: string;

  @IsString()
  @IsOptional()
  KAFKA_ENABLED?: string;

  // TSP Configuration
  @IsString()
  PAYTARA_BASE_URL: string;

  @IsString()
  PAYTARA_MERCHANT_ID: string;

  @IsString()
  PAYTARA_SECRET_KEY: string;

  @IsString()
  RAZORPAY_BASE_URL: string;

  @IsString()
  RAZORPAY_KEY_ID: string;

  @IsString()
  RAZORPAY_KEY_SECRET: string;

  @IsString()
  STRIPE_BASE_URL: string;

  @IsString()
  STRIPE_PUBLISHABLE_KEY: string;

  @IsString()
  STRIPE_SECRET_KEY: string;

  // Service Communication
  @IsString()
  MERCHANT_SERVICE_GRPC_URL: string;

  @IsString()
  API_GATEWAY_GRPC_URL: string;

  @IsString()
  COMMUNICATION_SERVICE_GRPC_URL: string;

  // Analytics Configuration
  @IsString()
  CLICKHOUSE_HOST: string;

  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  CLICKHOUSE_PORT: number;

  @IsString()
  CLICKHOUSE_DATABASE: string;

  @IsString()
  CLICKHOUSE_USERNAME: string;

  @IsString()
  @IsOptional()
  CLICKHOUSE_PASSWORD: string;

  // Monitoring Configuration
  @IsIn(['error', 'warn', 'info', 'debug'])
  LOG_LEVEL: 'error' | 'warn' | 'info' | 'debug';

  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  ENABLE_QUERY_LOGGING: boolean;

  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  PERFORMANCE_MONITORING: boolean;

  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  ENABLE_TSP_HEALTH_CHECKS: boolean;

  @IsString()
  PAYMENT_PAGE_BASE_URL: string;

  // Webhook Configuration
  @IsString()
  WEBHOOK_BASE_URL: string;

  // Performance Configuration
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  MAX_CONCURRENT_TRANSACTIONS: number;

  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  CACHE_TTL_SECONDS: number;

  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  CONNECTION_POOL_SIZE: number;

  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  TSP_REQUEST_TIMEOUT_MS: number;

  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  SMART_ROUTING_CACHE_TTL: number;
}

export function validate(config: Record<string, unknown>) {
  return config;
}
