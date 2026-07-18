import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Common utilities and services
import { EncryptionService } from './services/encryption.service';
import { CacheService } from './services/cache.service';
import { LoggerService } from './services/logger.service';
import { ValidationService } from './services/validation.service';
import { PerformanceService } from './services/performance.service';
import { MonitoringService } from './services/monitoring.service';

// Common guards, interceptors, and filters
import { PerformanceInterceptor } from './interceptors/performance.interceptor';
import { RequestLoggingInterceptor } from './interceptors/request-logging.interceptor';
import { InternalServiceGuard } from './guards/internal-service.guard';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    // Core services available globally
    EncryptionService,
    CacheService,
    LoggerService,
    ValidationService,
    PerformanceService,
    MonitoringService,
    
    // Interceptors for performance monitoring
    PerformanceInterceptor,
    RequestLoggingInterceptor,
    
    // Internal authentication guard
    InternalServiceGuard,
  ],
  exports: [
    EncryptionService,
    CacheService,
    LoggerService,
    ValidationService,
    PerformanceService,
    MonitoringService,
    PerformanceInterceptor,
    RequestLoggingInterceptor,
  ],
})
export class CommonModule {
  constructor() {
    console.log('Payment Engine Common Module Loaded');
  }
}
