import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSourceOptions } from 'typeorm';
import * as path from 'path';

// Import all entities
import { PaymentIntent } from '@/entities/payment-intent.entity';
import { PaymentTransaction } from '@/entities/payment-transaction.entity';
import { Payout } from '@/entities/payout.entity';
import { BatchPayout } from '@/entities/batch-payout.entity';
import { Refund } from '@/entities/refund.entity';
import { TSPConfiguration } from '@/entities/tsp-configuration.entity';
import { TSPPerformanceMetrics } from '@/entities/tsp-performance-metrics.entity';
import { TSPRoutingRule } from '@/entities/tsp-routing-rule.entity';
import { TSPRoutingOverride } from '@/entities/tsp-routing-override.entity';
import { BankPerformanceMetrics } from '@/entities/bank-performance-metrics.entity';

export const getDatabaseConfig = (): TypeOrmModuleOptions => {
  const env = process.env.NODE_ENV || 'development';

  const baseConfig: TypeOrmModuleOptions = {
    type: 'postgres',
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    username: process.env.DATABASE_USERNAME || 'valorapays_dev',
    password: process.env.DATABASE_PASSWORD || 'valorapays_dev_password',
    database: process.env.DATABASE_NAME || 'valorapays_payment_dev',
    entities: [
      PaymentIntent,
      PaymentTransaction,
      Payout,
      BatchPayout,
      Refund,
      TSPConfiguration,
      TSPPerformanceMetrics,
      TSPRoutingRule,
      TSPRoutingOverride,
      BankPerformanceMetrics,
    ],
    migrations: ['dist/migrations/*.js'],
    migrationsRun: env === 'production',
    synchronize: env === 'development', // Disabled - use migrations instead
    logging: shouldEnableLogging(env),
    ssl: env === 'production' ? { rejectUnauthorized: false } : false,

    // High-Performance Database Configuration
    extra: {
      // Connection Pool Optimization (Ultra High Concurrency)
      max: parseInt(process.env.CONNECTION_POOL_SIZE || '200'), // Increased for high load
      min: Math.max(parseInt(process.env.CONNECTION_POOL_SIZE || '200') / 10, 20), // Min 20 connections

      // Aggressive Connection Management for High Throughput
      acquireTimeoutMillis: 2000, // Faster timeout for high-frequency requests
      idleTimeoutMillis: 30000,   // 30 seconds - more aggressive cleanup
      reapIntervalMillis: 500,    // Check every 0.5 seconds
      createTimeoutMillis: 1500,  // Faster connection creation
      destroyTimeoutMillis: 2000, // Faster cleanup
      createRetryIntervalMillis: 50, // Faster retry

      // Ultra-Fast Query Performance
      statement_timeout: 15000,   // 15 seconds - faster timeout
      query_timeout: 15000,       // 15 seconds
      idle_in_transaction_session_timeout: 5000, // 5 seconds - prevent lock contention

      // Application Identification
      application_name: 'valorapays-engine',

      // Maximum Performance PostgreSQL Settings
      max_parallel_workers_per_gather: 8, // Increased for complex queries
      max_parallel_workers: 16,
      effective_cache_size: '2GB',     // Increased cache
      shared_buffers: '512MB',         // Increased shared buffers
      work_mem: '8MB',                 // Increased work memory
      maintenance_work_mem: '256MB',   // Better maintenance performance
      random_page_cost: 1.1,           // SSD optimization
      effective_io_concurrency: 200,   // SSD concurrent I/O

      // TCP/IP Optimization
      tcp_keepalives_idle: 30,
      tcp_keepalives_interval: 10,
      tcp_keepalives_count: 3,

      // Connection Security
      sslmode: env === 'production' ? 'require' : 'disable',
    },

    // Query Result Caching (5-minute TTL)
    cache: env !== 'development' ? {
      duration: parseInt(process.env.CACHE_TTL_SECONDS || '300') * 1000,
      type: 'redis',
      options: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB || '2'),
      },
    } : false,
  };

  // Environment-specific configurations handled in baseConfig above

  return baseConfig;
};

function shouldEnableLogging(env: string): boolean | Array<'query' | 'error' | 'schema' | 'warn' | 'info' | 'log'> {
  if (env === 'development' && process.env.ENABLE_QUERY_LOGGING === 'true') {
    return ['query', 'error', 'schema', 'warn'];
  }
  if (env === 'sandbox') {
    return ['error', 'warn', 'schema'];
  }
  if (env === 'production') {
    return ['error'];
  }
  return false;
}
