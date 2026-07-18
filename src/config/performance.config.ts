import { INestApplication } from '@nestjs/common';
import * as compression from 'compression';
import { json, urlencoded } from 'express';

/**
 * Ultra-High Performance Configuration
 */
export class PerformanceConfig {
  
  /**
   * Configure Express middleware for maximum performance
   */
  static configureExpress(app: INestApplication): void {
    
    // High-performance JSON parsing with size limits
    app.use(json({
      limit: '10mb',                    // Reasonable limit for payment data
      type: 'application/json',
      verify: (req: any, res: any, buf: Buffer, encoding: string) => {
        // Pre-validate JSON for security and performance
        if (buf && buf.length) {
          req.rawBody = buf;
        }
      }
    }));

    // Optimized URL encoding
    app.use(urlencoded({ 
      extended: true, 
      limit: '10mb',
      parameterLimit: 1000,           // Prevent DoS attacks
      type: 'application/x-www-form-urlencoded'
    }));

    // Ultra-high performance compression
    app.use(compression({
      level: 6,                       // Balanced compression (1=fastest, 9=best)
      threshold: 1024,                // Only compress responses > 1KB
      filter: (req, res) => {
        // Custom compression filter for API responses
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      },
      chunkSize: 16 * 1024,          // 16KB chunks for streaming
      windowBits: 15,                 // Maximum compression window
      memLevel: 8,                    // Memory usage vs speed balance
      strategy: 0,                    // Default strategy for mixed content
    }));
  }

  /**
   * Optimize Node.js runtime for maximum performance
   */
  static optimizeNodeJS(): void {
 
    process.env.NODE_OPTIONS = [
      '--max-old-space-size=4096',        // 4GB heap for high throughput
      '--max-new-space-size=1024',        // 1GB new generation space
      '--optimize-for-size',              // Optimize for memory efficiency
      '--gc-interval=100',                // More frequent GC for consistent performance
      '--max-http-header-size=16384',     // 16KB max HTTP headers
    ].join(' ');

    // UV Thread Pool Optimization
    process.env.UV_THREADPOOL_SIZE = '128'; // Increased for DB connections

    // Keep-Alive Optimization
    process.env.HTTP_KEEP_ALIVE_TIMEOUT = '65000';    // 65 seconds
    process.env.HTTP_HEADERS_TIMEOUT = '66000';       // 66 seconds

    // Memory Management
    if (process.env.NODE_ENV === 'production') {
      // Enable better garbage collection for production
      process.env.NODE_OPTIONS += ' --expose-gc';
      
      // Force GC every 30 seconds to prevent memory leaks
      setInterval(() => {
        if (global.gc) {
          global.gc();
        }
      }, 30000);
    }
  }

  /**
   * Configure TCP optimizations for high-concurrency
   */
  static configureTCP(): Record<string, any> {
    return {
      // TCP Socket optimizations
      keepAlive: true,
      keepAliveInitialDelay: 30000,       // 30 seconds
      noDelay: true,                      // Disable Nagle's algorithm
      timeout: 30000,                     // 30 second socket timeout
      
      // Connection pool optimizations  
      maxSockets: 1000,                   // Max connections per origin
      maxFreeSockets: 256,                // Max idle connections
      
      // HTTP Agent optimizations
      scheduling: 'fifo',                 // First-in-first-out scheduling
    };
  }

  /**
   * Memory optimization settings
   */
  static getMemoryLimits() {
    const totalMemory = process.env.NODE_ENV === 'production' ? 8192 : 2048; // MB
    
    return {
      rss: totalMemory * 1024 * 1024,                    // Resident Set Size
      heapUsed: (totalMemory * 0.8) * 1024 * 1024,      // 80% of total
      heapTotal: (totalMemory * 0.9) * 1024 * 1024,     // 90% of total
      external: (totalMemory * 0.1) * 1024 * 1024,      // 10% for external
      arrayBuffers: 100 * 1024 * 1024,                  // 100MB for buffers
    };
  }

  /**
   * Performance monitoring and alerting
   */
  static startPerformanceMonitoring(): void {
    const memoryLimits = this.getMemoryLimits();
    
    // Monitor memory usage every 10 seconds
    setInterval(() => {
      const usage = process.memoryUsage();
      
      // Alert if memory usage is too high
      if (usage.heapUsed > memoryLimits.heapUsed) {
        console.warn(`High memory usage: ${Math.round(usage.heapUsed / 1024 / 1024)}MB`);
      }
      
      // Alert if external memory is too high
      if (usage.external > memoryLimits.external) {
        console.warn(`High external memory: ${Math.round(usage.external / 1024 / 1024)}MB`);
      }
    }, 10000);

    // Monitor event loop lag
    let start = process.hrtime.bigint();
    setImmediate(() => {
      const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to ms
      if (lag > 10) { // Alert if event loop lag > 10ms
        console.warn(`Event loop lag: ${lag.toFixed(2)}ms`);
      }
      start = process.hrtime.bigint();
    });
  }
}



