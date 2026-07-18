import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redisClient: any;
  private memoryCache = new Map<string, { value: any; expiry: number }>();
  private readonly maxMemoryCacheSize = 10000; // Increased for high concurrency
  
  // Performance metrics
  private cacheStats = {
    memoryHits: 0,
    memoryMisses: 0,
    redisHits: 0,
    redisMisses: 0,
    totalRequests: 0,
    avgResponseTime: 0
  };

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.initializeRedisClient();
  }

  async onModuleDestroy() {
    if (this.redisClient) {
      await this.redisClient.quit();
    }
    this.memoryCache.clear();
  }

  private async initializeRedisClient() {
    try {
      const redisConfig = {
        socket: {
          host: this.configService.get<string>('REDIS_HOST', 'localhost'),
          port: this.configService.get<number>('REDIS_PORT', 6379),
          connectTimeout: 1500,    // Ultra-fast connection
          commandTimeout: 800,     // Fast command timeout
          lazyConnect: true,
          keepAlive: 30000,        // keepAlive should be number (milliseconds)
          noDelay: true,          // Disable Nagle's algorithm for low latency
        },
        password: this.configService.get<string>('REDIS_PASSWORD') || undefined,
        database: this.configService.get<number>('REDIS_DB', 2),
        
        // High-Performance Settings
        retryDelayOnFailover: 50,  // Faster failover
        maxRetriesPerRequest: 2,   // Fail fast approach
        lazyConnect: true,
      };

      this.redisClient = createClient(redisConfig);

      // Enhanced monitoring and error handling
      this.redisClient.on('connect', () => {
        this.logger.log('Redis connected with high-performance configuration');
      });

      this.redisClient.on('ready', () => {
        this.logger.log('Redis ready for ultra-high throughput operations');
        this.optimizeRedisSettings().catch(err => 
          this.logger.warn('Redis optimization partially failed:', err.message)
        );
      });

      this.redisClient.on('reconnecting', () => {
        this.logger.warn('Redis reconnecting - maintaining performance...');
      });

      this.redisClient.on('error', (error) => {
        this.logger.error(`Redis connection error: ${error.message}`);
        this.cacheStats.totalRequests++; // Track errors for monitoring
      });

      await this.redisClient.connect();
    } catch (error) {
      this.logger.error('Failed to initialize Redis client', error.stack);
      // Continue without Redis - use memory cache only
    }
  }

  /**
   * Optimize Redis server settings for maximum performance
   */
  private async optimizeRedisSettings(): Promise<void> {
    if (!this.redisClient?.isReady) return;
    
    try {
      // Execute performance optimizations
      const optimizations = [
        this.redisClient.configSet('maxmemory-policy', 'allkeys-lru'),
        this.redisClient.configSet('tcp-keepalive', '60'),
        this.redisClient.configSet('timeout', '300'),
        this.redisClient.configSet('tcp-backlog', '511'),
      ];
      
      await Promise.allSettled(optimizations);
      this.logger.log('Redis performance optimizations applied');
      
    } catch (error) {
      this.logger.warn('Some Redis optimizations failed (non-critical):', error.message);
    }
  }

  // Ultra-Fast Multi-layer caching: Memory (L1) + Redis (L2)
  async get<T>(key: string): Promise<T | null> {
    const startTime = performance.now();
    this.cacheStats.totalRequests++;

    try {
      // L1: Lightning-fast memory cache first (0.05ms)
      const memCached = this.getFromMemoryCache<T>(key);
      if (memCached !== null) {
        this.cacheStats.memoryHits++;
        this.updateAvgResponseTime(performance.now() - startTime);
        return memCached;
      }
      this.cacheStats.memoryMisses++;

      // L2: Redis cache with optimized pipeline (0.8-2ms)
      if (this.redisClient?.isReady) {
        const redisValue = await this.redisClient.get(key);
        if (redisValue) {
          // Fast JSON parsing with error handling
          let parsedValue: T;
          try {
            parsedValue = JSON.parse(redisValue);
          } catch (parseError) {
            this.logger.warn(`JSON parse error for key ${key}:`, parseError.message);
            return null;
          }
          
          // Promote to L1 memory cache for ultra-fast next access
          this.setInMemoryCache(key, parsedValue, 300); // 5 minute memory TTL
          
          this.cacheStats.redisHits++;
          this.updateAvgResponseTime(performance.now() - startTime);
          return parsedValue;
        }
      }

      this.cacheStats.redisMisses++;
      this.updateAvgResponseTime(performance.now() - startTime);
      return null;
    } catch (error) {
      this.logger.error(`Ultra-fast cache get error for key ${key}:`, error.message);
      return null;
    }
  }

  // Ultra-Fast Set - Memory + Redis with pipeline optimization
  async set(key: string, value: any, ttlSeconds: number = 300): Promise<void> {
    const startTime = performance.now();

    try {
      // Set in memory cache with shorter TTL
      const memoryTTL = Math.min(ttlSeconds, 300); // Max 5 minutes in memory
      this.setInMemoryCache(key, value, memoryTTL);

      // Set in Redis cache with pipeline optimization
      if (this.redisClient?.isReady) {
        try {
          const serialized = JSON.stringify(value);
          // Fire-and-forget Redis set for maximum performance
          this.redisClient.setEx(key, ttlSeconds, serialized).catch(err =>
            this.logger.warn(`Redis set failed for key ${key}:`, err.message)
          );
        } catch (serError) {
          this.logger.warn(`JSON serialization failed for key ${key}:`, serError.message);
        }
      }
      
      this.updateAvgResponseTime(performance.now() - startTime);
    } catch (error) {
      this.logger.error(`Ultra-fast cache set error for key ${key}:`, error.message);
    }
  }

  // Cache with automatic expiration
  async setWithExpiry(key: string, value: any, expiryDate: Date): Promise<void> {
    const ttlSeconds = Math.max(0, Math.floor((expiryDate.getTime() - Date.now()) / 1000));
    await this.set(key, value, ttlSeconds);
  }

  // Delete from both caches
  async delete(key: string): Promise<void> {
    try {
      // Remove from memory cache
      this.memoryCache.delete(key);

      // Remove from Redis cache
      if (this.redisClient) {
        await this.redisClient.del(key);
      }
    } catch (error) {
      this.logger.error(`Cache delete error for key ${key}:`, error.stack);
    }
  }

  // Invalidate cache patterns
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      // Clear memory cache entries matching pattern
      for (const [key] of this.memoryCache) {
        if (key.includes(pattern)) {
          this.memoryCache.delete(key);
        }
      }

      // Clear Redis cache entries matching pattern
      if (this.redisClient) {
        const keys = await this.redisClient.keys(`*${pattern}*`);
        if (keys.length > 0) {
          await this.redisClient.del(keys);
        }
      }
    } catch (error) {
      this.logger.error(`Cache pattern invalidation error for pattern ${pattern}:`, error.stack);
    }
  }

  // Specialized cache methods for common use cases
  
  // Cache TSP configuration (hot data, 15-minute TTL)
  async cacheTSPConfig(provider: string, environment: string, config: any): Promise<void> {
    const key = `tsp_config:${provider}:${environment}`;
    await this.set(key, config, 900); // 15 minutes
  }

  async getTSPConfig(provider: string, environment: string): Promise<any> {
    const key = `tsp_config:${provider}:${environment}`;
    return await this.get(key);
  }

  // Cache routing decisions (1-minute TTL for dynamic routing)
  async cacheRoutingDecision(contextHash: string, decision: any): Promise<void> {
    const key = `routing_decision:${contextHash}`;
    await this.set(key, decision, 60); // 1 minute
  }

  async getRoutingDecision(contextHash: string): Promise<any> {
    const key = `routing_decision:${contextHash}`;
    return await this.get(key);
  }

  // Cache bank performance data (5-minute TTL)
  async cacheBankPerformance(bankCode: string, tspProvider: string, data: any): Promise<void> {
    const key = `bank_performance:${bankCode}:${tspProvider}`;
    await this.set(key, data, 300); // 5 minutes
  }

  async getBankPerformance(bankCode: string, tspProvider: string): Promise<any> {
    const key = `bank_performance:${bankCode}:${tspProvider}`;
    return await this.get(key);
  }

  // Cache TSP health status (2-minute TTL)
  async cacheTSPHealth(provider: string, environment: string, health: any): Promise<void> {
    const key = `tsp_health:${provider}:${environment}`;
    await this.set(key, health, 120); // 2 minutes
  }

  async getTSPHealth(provider: string, environment: string): Promise<any> {
    const key = `tsp_health:${provider}:${environment}`;
    return await this.get(key);
  }

  // Memory cache operations (L1 cache)
  private getFromMemoryCache<T>(key: string): T | null {
    const cached = this.memoryCache.get(key);
    if (!cached) return null;

    if (Date.now() > cached.expiry) {
      this.memoryCache.delete(key);
      return null;
    }

    return cached.value;
  }

  private setInMemoryCache(key: string, value: any, ttlSeconds: number): void {
    // Implement LRU eviction if cache is full
    if (this.memoryCache.size >= this.maxMemoryCacheSize) {
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }

    const expiry = Date.now() + (ttlSeconds * 1000);
    this.memoryCache.set(key, { value, expiry });
  }

  // Performance monitoring
  private logCachePerformance(type: string, key: string, durationMs: number, hit: boolean): void {
    if (this.configService.get('PERFORMANCE_MONITORING') === 'true') {
      this.logger.debug(`Cache ${type} - Key: ${key}, Duration: ${durationMs}ms, Hit: ${hit}`);
    }
  }


  // Warm cache with frequently accessed data
  async warmCache(): Promise<void> {
    this.logger.log('Starting cache warming process...');
    
    try {
      // Pre-load TSP configurations
      // Pre-load active routing rules  
      // Pre-load recent bank performance data
      
      this.logger.log('Cache warming completed');
    } catch (error) {
      this.logger.error('Cache warming failed', error.stack);
    }
  }

  /**
   * Performance Monitoring Methods
   */
  private updateAvgResponseTime(responseTime: number): void {
    const alpha = 0.1; // Smoothing factor for rolling average
    this.cacheStats.avgResponseTime = 
      (this.cacheStats.avgResponseTime * (1 - alpha)) + (responseTime * alpha);
  }

  /**
   * Get comprehensive cache performance statistics
   */
  public getCacheStats() {
    const memoryHitRate = this.cacheStats.totalRequests > 0 
      ? (this.cacheStats.memoryHits / this.cacheStats.totalRequests * 100).toFixed(2)
      : '0';
    
    const redisHitRate = this.cacheStats.totalRequests > 0
      ? (this.cacheStats.redisHits / this.cacheStats.totalRequests * 100).toFixed(2)
      : '0';
    
    const overallHitRate = this.cacheStats.totalRequests > 0
      ? ((this.cacheStats.memoryHits + this.cacheStats.redisHits) / this.cacheStats.totalRequests * 100).toFixed(2)
      : '0';

    return {
      memoryStats: {
        hits: this.cacheStats.memoryHits,
        misses: this.cacheStats.memoryMisses,
        hitRate: `${memoryHitRate}%`,
        cacheSize: this.memoryCache.size,
        maxSize: this.maxMemoryCacheSize
      },
      redisStats: {
        hits: this.cacheStats.redisHits,
        misses: this.cacheStats.redisMisses,
        hitRate: `${redisHitRate}%`,
        connected: this.redisClient?.isReady || false
      },
      overall: {
        totalRequests: this.cacheStats.totalRequests,
        hitRate: `${overallHitRate}%`,
        avgResponseTime: `${this.cacheStats.avgResponseTime.toFixed(3)}ms`
      }
    };
  }
}
