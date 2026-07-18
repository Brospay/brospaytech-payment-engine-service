import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import * as crypto from 'crypto';

/**
 * Authenticated gRPC Service
 * Wrapper for gRPC clients that automatically adds authentication metadata
 */
@Injectable()
export class AuthenticatedGrpcService {
  private readonly sharedSecret: string;

  constructor(private configService: ConfigService) {
    this.sharedSecret = this.configService.get<string>(
      'INTERNAL_SERVICE_SECRET',
      'valorapays-internal-secret-2024'
    );
  }

  /**
   * Call gRPC method with automatic authentication
   */
  async callGrpcMethod<T>(
    client: any,
    methodName: string,
    data: any,
    targetService: string,
    requestContext?: {
      requestId?: string;
      userId?: string;
      userType?: string;
      sourceIp?: string;
    }
  ): Promise<T> {
    const metadata = this.generateGrpcAuthMetadata(targetService, requestContext);
    
    // Add metadata to gRPC call context
    const grpcContext = {
      metadata,
    };

    return client[methodName](data, grpcContext);
  }

  /**
   * Generate authentication metadata for gRPC calls
   */
  generateGrpcAuthMetadata(
    targetService: string,
    requestContext?: {
      requestId?: string;
      userId?: string;
      userType?: string;
      sourceIp?: string;
    }
  ): Record<string, string> {
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

  /**
   * Create authenticated gRPC client wrapper
   */
  wrapGrpcClient<T>(grpcClient: ClientGrpc, serviceName: string, targetService: string): T {
    const client = grpcClient.getService<T>(serviceName);
    
    // Create a proxy that automatically adds authentication to all calls
    return new Proxy(client as any, {
      get: (target, prop) => {
        const originalMethod = target[prop];
        if (typeof originalMethod === 'function') {
          return async (...args: any[]) => {
            // Add authentication metadata to the call
            const metadata = this.generateGrpcAuthMetadata(targetService);
            const lastArg = args[args.length - 1];
            
            // If last argument is already metadata, merge with it
            if (lastArg && typeof lastArg === 'object' && !Array.isArray(lastArg)) {
              Object.assign(lastArg, { metadata });
            } else {
              args.push({ metadata });
            }
            
            // Call the original method and convert Observable to Promise
            const observable = originalMethod.apply(target, args);
            return lastValueFrom(observable);
          };
        }
        return originalMethod;
      },
    });
  }
}
