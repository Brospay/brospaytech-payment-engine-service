import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CacheService } from '@/common/services/cache.service';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cacheService: CacheService,
  ) {}

  async getHealthStatus() {
    const startTime = Date.now();
    
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'valorapays-engine',
      version: '1.0.0',
      environment: process.env.NODE_ENV,
      uptime: process.uptime(),
      responseTime: 0,
    };

    health.responseTime = Date.now() - startTime;
    return health;
  }

  async getDetailedHealthStatus() {
    const startTime = Date.now();
    
    const [databaseHealth, redisHealth, memoryUsage] = await Promise.allSettled([
      this.checkDatabaseHealth(),
      this.checkRedisHealth(),
      this.getMemoryUsage(),
    ]);

    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'valorapays-engine',
      version: '1.0.0',
      environment: process.env.NODE_ENV,
      uptime: process.uptime(),
      checks: {
        database: databaseHealth.status === 'fulfilled' ? databaseHealth.value : { status: 'error', error: databaseHealth.reason },
        redis: redisHealth.status === 'fulfilled' ? redisHealth.value : { status: 'error', error: redisHealth.reason },
        memory: memoryUsage.status === 'fulfilled' ? memoryUsage.value : { status: 'error', error: memoryUsage.reason },
      },
      performance: {
        responseTime: Date.now() - startTime,
        connectionPool: await this.getConnectionPoolStats(),
      },
    };

    // Determine overall health status
    const hasErrors = Object.values(health.checks).some(check => check.status === 'error');
    health.status = hasErrors ? 'degraded' : 'ok';

    return health;
  }

  async getReadinessStatus() {
    try {
      const databaseReady = await this.checkDatabaseHealth();
      const redisReady = await this.checkRedisHealth();

      const isReady = databaseReady.status === 'ok' && redisReady.status === 'ok';

      return {
        status: isReady ? 'ready' : 'not-ready',
        timestamp: new Date().toISOString(),
        checks: {
          database: databaseReady,
          redis: redisReady,
        },
      };
    } catch (error) {
      this.logger.error('Readiness check failed', error.stack);
      return {
        status: 'not-ready',
        timestamp: new Date().toISOString(),
        error: error.message,
      };
    }
  }

  async getLivenessStatus() {
    try {
      const memoryUsage = process.memoryUsage();
      const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
      const maxMemoryMB = 1024; // 1GB threshold

      const isLive = heapUsedMB < maxMemoryMB;

      return {
        status: isLive ? 'alive' : 'unhealthy',
        timestamp: new Date().toISOString(),
        memory: {
          heapUsedMB: Math.round(heapUsedMB),
          heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          maxMemoryMB,
        },
        uptime: process.uptime(),
      };
    } catch (error) {
      this.logger.error('Liveness check failed', error.stack);
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
      };
    }
  }

  private async checkDatabaseHealth() {
    try {
      const startTime = Date.now();
      
      // Simple query to check database connectivity
      await this.dataSource.query('SELECT 1');
      
      const responseTime = Date.now() - startTime;

      return {
        status: 'ok',
        responseTime,
        connection: 'active',
        database: this.configService.get('DATABASE_NAME'),
      };
    } catch (error) {
      this.logger.error('Database health check failed', error.stack);
      return {
        status: 'error',
        error: error.message,
        database: this.configService.get('DATABASE_NAME'),
      };
    }
  }

  private async checkRedisHealth() {
    try {
      const startTime = Date.now();
      
      // Check Redis connectivity
      const cacheStats = await this.cacheService.getCacheStats();
      
      const responseTime = Date.now() - startTime;

      return {
        status: cacheStats.redisStats.connected ? 'ok' : 'degraded',
        responseTime,
        connection: cacheStats.redisStats.connected ? 'active' : 'disconnected',
        cacheStats,
      };
    } catch (error) {
      this.logger.error('Redis health check failed', error.stack);
      return {
        status: 'error',
        error: error.message,
      };
    }
  }

  private getMemoryUsage() {
    const memoryUsage = process.memoryUsage();
    
    return {
      status: 'ok',
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
      external: Math.round(memoryUsage.external / 1024 / 1024), // MB
      rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
      arrayBuffers: Math.round(memoryUsage.arrayBuffers / 1024 / 1024), // MB
    };
  }

  private async getConnectionPoolStats() {
    try {
      if (!this.dataSource?.isInitialized) {
        return { status: 'not-initialized' };
      }

      // Get connection pool information
      const driver = this.dataSource.driver as any;
      const poolStats = driver.master?.pool || {};

      return {
        totalConnections: poolStats.totalCount || 0,
        idleConnections: poolStats.idleCount || 0,
        waitingClients: poolStats.waitingCount || 0,
        maxConnections: this.configService.get('CONNECTION_POOL_SIZE', 100),
      };
    } catch (error) {
      this.logger.warn('Failed to get connection pool stats', error.stack);
      return { status: 'unknown', error: error.message };
    }
  }
}
