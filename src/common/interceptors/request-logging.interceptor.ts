import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, headers, body } = request;
    const requestId = headers['x-request-id'] || `REQ_${Date.now()}`;
    const merchantId = headers['x-merchant-id'];
    const startTime = Date.now();

    // Log incoming request (sanitized)
    this.logger.log(
      `[${requestId}] Incoming ${method} ${url} - Merchant: ${merchantId || 'unknown'}`
    );

    // Log request body for debugging (exclude sensitive data)
    if (process.env.NODE_ENV === 'development' && body) {
      const sanitizedBody = this.sanitizeRequestBody(body);
      this.logger.debug(`[${requestId}] Request body:`, JSON.stringify(sanitizedBody, null, 2));
    }

    return next.handle().pipe(
      tap((data) => {
        const responseTime = Date.now() - startTime;
        const response = context.switchToHttp().getResponse();
        
        // this.logger.log(
        //   `[${requestId}] Request completed: ${method} ${url} - ${response.statusCode} - ${responseTime}ms`
        // );

        // Log response for debugging (exclude sensitive data)
        if (process.env.NODE_ENV === 'development' && data) {
          const sanitizedResponse = this.sanitizeResponseBody(data);
          this.logger.debug(`[${requestId}] Response:`, JSON.stringify(sanitizedResponse, null, 2));
        }
      }),
      catchError((error) => {
        const responseTime = Date.now() - startTime;
        
        this.logger.error(
          `[${requestId}] Request failed: ${method} ${url} - ${responseTime}ms`,
          error.stack
        );

        // Log error details for debugging
        this.logger.error(`[${requestId}] Error details:`, {
          message: error.message,
          stack: error.stack,
          requestBody: process.env.NODE_ENV === 'development' ? this.sanitizeRequestBody(body) : undefined,
        });

        return throwError(() => error);
      })
    );
  }

  private sanitizeRequestBody(body: any): any {
    if (!body || typeof body !== 'object') return body;

    const sensitiveFields = new Set([
      'cardNumber',
      'cvv',
      'expiryMonth',
      'expiryYear',
      'cardHolderName',
      'accountNumber',
      'upiId',
      'password',
      'apiKey',
      'secret',
      'token',
      'credentials',
      'pin',
      'otp',
    ]);

    const sanitized = this.redactSensitiveFields(this.deepClone(body), sensitiveFields);

    // Truncate long metadata
    if (sanitized.metadata && JSON.stringify(sanitized.metadata).length > 500) {
      sanitized.metadata = { ...sanitized.metadata, _truncated: true };
    }

    return sanitized;
  }

  private sanitizeResponseBody(body: any): any {
    if (!body || typeof body !== 'object') return body;

    const sanitized = this.deepClone(body);

    // Remove sensitive response data
    if (sanitized.data?.tspResponse) {
      sanitized.data.tspResponse = this.sanitizeTSPResponse(sanitized.data.tspResponse);
    }

    // Truncate large response objects
    const responseStr = JSON.stringify(sanitized);
    if (responseStr.length > 2000) {
      return {
        ...sanitized,
        _responseSize: responseStr.length,
        _truncated: true,
      };
    }

    return sanitized;
  }

  private sanitizeTSPResponse(tspResponse: any): any {
    if (!tspResponse || typeof tspResponse !== 'object') return tspResponse;

    const sanitized = this.deepClone(tspResponse);

    // Remove sensitive TSP response data
    const sensitiveFields = [
      'card_number',
      'account_number', 
      'customer_id',
      'token',
      'secret',
      'api_key',
    ];

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '***REDACTED***';
      }
    }

    return sanitized;
  }

  private deepClone<T>(value: T): T {
    if (Array.isArray(value)) {
      return value.map(item => this.deepClone(item)) as unknown as T;
    }
    if (value && typeof value === 'object') {
      const result: Record<string, any> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = this.deepClone(val);
      }
      return result as T;
    }
    return value;
  }

  private redactSensitiveFields(value: any, sensitiveFields: Set<string>): any {
    if (Array.isArray(value)) {
      return value.map(item => this.redactSensitiveFields(item, sensitiveFields));
    }
    if (value && typeof value === 'object') {
      return Object.entries(value).reduce<Record<string, any>>((acc, [key, val]) => {
        if (sensitiveFields.has(key)) {
          acc[key] = '***REDACTED***';
        } else {
          acc[key] = this.redactSensitiveFields(val, sensitiveFields);
        }
        return acc;
      }, {});
    }
    return value;
  }
}
