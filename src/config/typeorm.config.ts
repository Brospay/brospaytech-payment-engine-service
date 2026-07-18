import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';

const envFile = `.env.${process.env.NODE_ENV || 'development'}`;
config({ path: path.resolve(process.cwd(), envFile) });


// Import all entities
import { PaymentIntent } from '../entities/payment-intent.entity';
import { PaymentTransaction } from '../entities/payment-transaction.entity';
import { Payout } from '../entities/payout.entity';
import { BatchPayout } from '../entities/batch-payout.entity';
import { Refund } from '../entities/refund.entity';
import { TSPConfiguration } from '../entities/tsp-configuration.entity';
import { TSPPerformanceMetrics } from '../entities/tsp-performance-metrics.entity';
import { TSPRoutingRule } from '../entities/tsp-routing-rule.entity';
import { TSPRoutingOverride } from '../entities/tsp-routing-override.entity';
import { BankPerformanceMetrics } from '../entities/bank-performance-metrics.entity';

/**
 * TypeORM CLI DataSource Configuration
 * Used for migration generation and database operations
 */
const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  username: process.env.DATABASE_USERNAME || 'valorapays_dev',
  password: process.env.DATABASE_PASSWORD || 'valorapays_dev_password',
  database: process.env.DATABASE_NAME || 'valorapays_payment_dev',

  // Entity registration
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

  // Migration configuration
  migrations: ['src/migrations/*.ts'],
  migrationsTableName: 'typeorm_migrations',

  // Development settings
  synchronize: false, // Disabled - use migrations instead
  logging: process.env.ENABLE_QUERY_LOGGING === 'true' ? ['query', 'error'] : ['error'],

  // Connection pool settings for CLI operations
  extra: {
    max: 10, // Smaller pool for CLI operations
    min: 1,
    acquireTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  },
});

// Export as default for CLI compatibility
export default AppDataSource;