import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { LoggerService } from '../services/logger.service';

@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
  constructor(private readonly loggerService: LoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const startTime = Date.now();
    const request = context.switchToHttp().getRequest();
    const { method, url, headers } = request;
    const requestId = headers['x-request-id'] || `REQ_${Date.now()}`;

    return next.handle().pipe(
      tap(() => {
        const responseTime = Date.now() - startTime;
        const response = context.switchToHttp().getResponse();
        
        // Log request performance
        // this.loggerService.logRequest(
        //   method,
        //   url,
        //   response.statusCode,
        //   responseTime,
        //   requestId,
        //   headers['user-agent'],
        //   request.ip
        // );

        // Log performance metrics for monitoring
        // this.loggerService.logPerformanceMetric(
        //   'api_response_time',
        //   responseTime,
        //   50, // 50ms threshold
        //   `${method} ${url}`,
        //   requestId
        // );

        // Alert on slow responses
        if (responseTime > 100) {
          this.loggerService.warn(
            `Slow API response: ${method} ${url} took ${responseTime}ms`,
            'PerformanceInterceptor'
          );
        }
      })
    );
  }
}
