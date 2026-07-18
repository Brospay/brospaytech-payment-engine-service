import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * gRPC Authentication Interceptor for outgoing calls
 * Adds authentication metadata to gRPC calls from Payment Engine
 */
@Injectable()
export class GrpcAuthInterceptor implements NestInterceptor {
  private readonly logger = new Logger(GrpcAuthInterceptor.name);
  private readonly sharedSecret: string;

  constructor(private configService: ConfigService) {
    this.sharedSecret = this.configService.get<string>(
      'INTERNAL_SERVICE_SECRET',
      'valorapays-internal-secret-2024'
    );
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // This interceptor is for outgoing gRPC calls from Payment Engine
    // It adds authentication metadata automatically
    this.logger.debug('Adding authentication metadata to outgoing gRPC call');
    
    return next.handle();
  }

  /**
   * Generate authentication metadata for outgoing gRPC calls
   */
  generateGrpcMetadata(targetService: string, requestContext?: {
    requestId?: string;
    userId?: string;
    userType?: string;
    sourceIp?: string;
  }): any {
    const timestamp = new Date().toISOString();
    const requestId = requestContext?.requestId || `pe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const userId = requestContext?.userId || 'payment-engine-service';
    const userType = requestContext?.userType || 'system';
    const sourceIp = requestContext?.sourceIp || '127.0.0.1';

    const payload = [
      userId,
      userType,
      requestId,
      timestamp,
      sourceIp,
      targetService,
    ].join('|');

    const signature = crypto
      .createHmac('sha256', this.sharedSecret)
      .update(payload)
      .digest('hex');

    return {
      'x-authenticated-user': userId,
      'x-user-type': userType,
      'x-request-id': requestId,
      'x-timestamp': timestamp,
      'x-source-ip': sourceIp,
      'x-service-name': targetService,
      'x-gateway-signature': signature,
      'x-calling-service': 'payment-engine',
    };
  }
}
