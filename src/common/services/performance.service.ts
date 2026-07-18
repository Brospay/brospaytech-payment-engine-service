import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PerformanceService {
  private readonly logger = new Logger(PerformanceService.name);
  private readonly metricsBuffer = new Map<string, any[]>();
  private readonly maxBufferSize = 1000;

  constructor(private readonly configService: ConfigService) {
    // Initialize performance monitoring
    if (this.configService.get('PERFORMANCE_MONITORING') === 'true') {
      this.startPerformanceMonitoring();
    }
  }

  // Record performance metric
  recordMetric(name: string, value: number, tags?: Record<string, string>): void {
    const metric = {
      name,
      value,
      tags: tags || {},
      timestamp: Date.now(),
    };

    if (!this.metricsBuffer.has(name)) {
      this.metricsBuffer.set(name, []);
    }

    const buffer = this.metricsBuffer.get(name);
    buffer.push(metric);

    // Keep buffer size manageable
    if (buffer.length > this.maxBufferSize) {
      buffer.shift();
    }
  }

  // Get performance statistics
  getPerformanceStats(metricName: string, windowMs: number = 300000): any {
    const buffer = this.metricsBuffer.get(metricName);
    if (!buffer || buffer.length === 0) {
      return null;
    }

    const cutoff = Date.now() - windowMs;
    const recentMetrics = buffer.filter(m => m.timestamp > cutoff);

    if (recentMetrics.length === 0) {
      return null;
    }

    const values = recentMetrics.map(m => m.value);
    values.sort((a, b) => a - b);

    return {
      count: values.length,
      min: values[0],
      max: values[values.length - 1],
      mean: values.reduce((sum, v) => sum + v, 0) / values.length,
      median: values[Math.floor(values.length / 2)],
      p95: values[Math.floor(values.length * 0.95)],
      p99: values[Math.floor(values.length * 0.99)],
      windowMs,
      lastUpdated: new Date(),
    };
  }

  // Get system performance overview
  getSystemPerformance(): any {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      timestamp: new Date(),
      uptime: process.uptime(),
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024), // MB
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        external: Math.round(memUsage.external / 1024 / 1024), // MB
        arrayBuffers: Math.round(memUsage.arrayBuffers / 1024 / 1024), // MB
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
      eventLoop: {
        // Event loop lag monitoring
        lag: this.measureEventLoopLag(),
      },
      performance: {
        apiResponseTime: this.getPerformanceStats('api_response_time'),
        databaseQueryTime: this.getPerformanceStats('database_query_time'),
        tspResponseTime: this.getPerformanceStats('tsp_response_time'),
        cacheHitRate: this.getCacheHitRate(),
      },
    };
  }

  // Start background performance monitoring
  private startPerformanceMonitoring(): void {
    this.logger.log('Starting performance monitoring...');

    // Monitor system resources every 30 seconds
    setInterval(() => {
      this.collectSystemMetrics();
    }, 30000);

    // Monitor event loop lag every 10 seconds
    setInterval(() => {
      const lag = this.measureEventLoopLag();
      this.recordMetric('event_loop_lag', lag);
    }, 10000);

    // Cleanup old metrics every 5 minutes
    setInterval(() => {
      this.cleanupOldMetrics();
    }, 300000);
  }

  private collectSystemMetrics(): void {
    const memUsage = process.memoryUsage();
    
    this.recordMetric('memory_heap_used', memUsage.heapUsed / 1024 / 1024);
    this.recordMetric('memory_heap_total', memUsage.heapTotal / 1024 / 1024);
    this.recordMetric('memory_rss', memUsage.rss / 1024 / 1024);
    this.recordMetric('uptime', process.uptime());
  }

  private measureEventLoopLag(): number {
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to milliseconds
      this.recordMetric('event_loop_lag', lag);
    });
    return 0; // Actual measurement happens in setImmediate
  }

  private getCacheHitRate(): number {
    const cacheHits = this.getPerformanceStats('cache_hit');
    const cacheMisses = this.getPerformanceStats('cache_miss');

    if (!cacheHits || !cacheMisses) return 0;

    const totalOperations = cacheHits.count + cacheMisses.count;
    return totalOperations > 0 ? (cacheHits.count / totalOperations) * 100 : 0;
  }

  private cleanupOldMetrics(): void {
    const cutoff = Date.now() - 3600000; // Keep last 1 hour
    
    for (const [metricName, buffer] of this.metricsBuffer) {
      const filteredBuffer = buffer.filter(m => m.timestamp > cutoff);
      this.metricsBuffer.set(metricName, filteredBuffer);
    }
  }

  // Performance alerting
  checkPerformanceThresholds(): Array<{
    metric: string;
    value: number;
    threshold: number;
    severity: 'warning' | 'critical';
  }> {
    const alerts = [];

    // Check API response time
    const apiResponseStats = this.getPerformanceStats('api_response_time');
    if (apiResponseStats && apiResponseStats.p95 > 100) {
      alerts.push({
        metric: 'api_response_time',
        value: apiResponseStats.p95,
        threshold: 100,
        severity: apiResponseStats.p95 > 200 ? 'critical' : 'warning',
      });
    }

    // Check memory usage
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    if (heapUsedMB > 800) { // 800MB threshold
      alerts.push({
        metric: 'memory_usage',
        value: heapUsedMB,
        threshold: 800,
        severity: heapUsedMB > 1000 ? 'critical' : 'warning',
      });
    }

    return alerts;
  }
}
