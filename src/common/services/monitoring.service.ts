import { Injectable } from '@nestjs/common';
import { CacheService } from './cache.service';

/**
 * Multi-Layer Caching Service
 * Enterprise-grade caching with L1 (memory) + L2 (Redis) + L3 (database)
 */
@Injectable()
export class MonitoringService {
  // L1 Cache - In-memory (ultra-fast)
  private readonly memoryCache = new Map<string, {
    data: any;
    timestamp: number;
    ttl: number;
  }>();
  
  // Cache statistics
  private stats = {
    hits: { l1: 0, l2: 0, l3: 0 },
    misses: { l1: 0, l2: 0, l3: 0 },
    sets: { l1: 0, l2: 0, l3: 0 },
  };

  constructor(
    private readonly cacheService: CacheService,
  ) {
    // Cleanup expired memory cache every 5 minutes
    setInterval(() => this.cleanupMemoryCache(), 5 * 60 * 1000);
  }

  /**
   * Ultra-Fast Multi-Layer Get
   * L1 (memory) -> L2 (Redis) -> L3 (database) -> null
   */
  async getMultiLayer(key: string, dbFallback?: () => Promise<any>): Promise<any> {
    // L1 Memory Cache (0.1ms response)
    const memoryHit = this.getFromMemory(key);
    if (memoryHit !== null) {
      this.stats.hits.l1++;
      return memoryHit;
    }
    this.stats.misses.l1++;

    // L2 Redis Cache (1-5ms response)
    const redisHit = await this.cacheService.get(key);
    if (redisHit !== null) {
      this.stats.hits.l2++;
      
      // Promote to L1 for next access
      this.setInMemory(key, redisHit, 300); // 5min TTL in memory
      
      return redisHit;
    }
    this.stats.misses.l2++;

    // L3 Database Fallback (if provided)
    if (dbFallback) {
      const dbData = await dbFallback();
      if (dbData !== null) {
        this.stats.hits.l3++;
        
        // Populate all cache layers
        await this.setMultiLayer(key, dbData, 900); // 15min TTL
        
        return dbData;
      }
      this.stats.misses.l3++;
    }

    return null;
  }

  /**
   * Set Data Across All Cache Layers
   */
  async setMultiLayer(key: string, data: any, ttl: number = 300): Promise<void> {
    // L1 Memory (immediate availability)
    this.setInMemory(key, data, Math.min(ttl, 600)); // Max 10min in memory
    this.stats.sets.l1++;

    // L2 Redis (persistent, shared across instances)
    await this.cacheService.set(key, data, ttl);
    this.stats.sets.l2++;

    // L3 is handled by caller if needed
  }

  /**
   * Get Cache Statistics
   */
  getCacheStats(): {
    performance: {
      l1HitRate: number;
      l2HitRate: number;
      l3HitRate: number;
      overallHitRate: number;
    };
    operations: typeof this.stats;
    memoryUsage: {
      entries: number;
      estimatedSizeKB: number;
    };
  } {
    const totalRequests = Object.values(this.stats.hits).reduce((a, b) => a + b, 0) + 
                         Object.values(this.stats.misses).reduce((a, b) => a + b, 0);

    return {
      performance: {
        l1HitRate: totalRequests > 0 ? (this.stats.hits.l1 / totalRequests) * 100 : 0,
        l2HitRate: totalRequests > 0 ? (this.stats.hits.l2 / totalRequests) * 100 : 0,
        l3HitRate: totalRequests > 0 ? (this.stats.hits.l3 / totalRequests) * 100 : 0,
        overallHitRate: totalRequests > 0 ? (Object.values(this.stats.hits).reduce((a, b) => a + b, 0) / totalRequests) * 100 : 0,
      },
      operations: this.stats,
      memoryUsage: {
        entries: this.memoryCache.size,
        estimatedSizeKB: Math.round((JSON.stringify([...this.memoryCache.values()]).length / 1024)),
      },
    };
  }

  /**
   * Pre-warm Cache with Critical Data
   */
  async preWarmCache(criticalData: Array<{ key: string; fetcher: () => Promise<any>; ttl?: number }>): Promise<void> {
    const promises = criticalData.map(async ({ key, fetcher, ttl = 600 }) => {
      try {
        const data = await fetcher();
        await this.setMultiLayer(key, data, ttl);
      } catch (error) {
        console.error(`Failed to pre-warm cache for key: ${key}`, error);
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Clear All Cache Layers
   */
  async clearAll(): Promise<void> {
    this.memoryCache.clear();
    // Note: Redis clear would need specific implementation based on key patterns
    
    // Reset stats
    this.stats = {
      hits: { l1: 0, l2: 0, l3: 0 },
      misses: { l1: 0, l2: 0, l3: 0 },
      sets: { l1: 0, l2: 0, l3: 0 },
    };
  }

  // ===============================
  // PRIVATE HELPER METHODS
  // ===============================

  private getFromMemory(key: string): any {
    const entry = this.memoryCache.get(key);
    
    if (!entry) {
      return null;
    }
    
    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl * 1000) {
      this.memoryCache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  private setInMemory(key: string, data: any, ttl: number): void {
    // Prevent memory bloat - max 1000 entries
    if (this.memoryCache.size >= 1000) {
      const oldestKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(oldestKey);
    }
    
    this.memoryCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  private cleanupMemoryCache(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.memoryCache.entries()) {
      if (now - entry.timestamp > entry.ttl * 1000) {
        this.memoryCache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`Cleaned up ${cleaned} expired cache entries`);
    }
  }
}
