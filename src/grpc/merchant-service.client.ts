import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientOptions, Transport, ClientGrpc } from '@nestjs/microservices';
import { join } from 'path';
import * as crypto from 'crypto';

/**
 * Merchant Service gRPC Client Configuration with Authentication
 */
@Injectable()
export class MerchantServiceClient {
  private readonly sharedSecret: string;

  constructor(private configService: ConfigService) {
    this.sharedSecret = this.configService.get<string>(
      'INTERNAL_SERVICE_SECRET',
      'valorapays-internal-secret-2024'
    );
  }

  getClientOptions(): ClientOptions {
    return {
      transport: Transport.GRPC,
      options: {
        package: 'merchant',
        protoPath: join(__dirname, '../../src/proto/merchant.proto'),
        url: this.configService.get<string>('MERCHANT_SERVICE_GRPC_URL', 'localhost:50002'),
        maxReceiveMessageLength: 4 * 1024 * 1024, // 4MB
        maxSendMessageLength: 4 * 1024 * 1024, // 4MB
        keepalive: {
          keepaliveTimeMs: 30 * 1000,
          keepaliveTimeoutMs: 5 * 1000,
          keepalivePermitWithoutCalls: 1,
          http2MaxPingsWithoutData: 0,
          http2MinTimeBetweenPingsMs: 10 * 1000,
          http2MinPingIntervalWithoutDataMs: 300 * 1000,
        },
        loader: {
          keepCase: true,
          longs: String,
          enums: String,
          defaults: true,
          arrays: true,
        },
        channelOptions: {
          'grpc.keepalive_time_ms': 30 * 1000,
          'grpc.keepalive_timeout_ms': 5 * 1000,
          'grpc.keepalive_permit_without_calls': 1,
          'grpc.http2.max_pings_without_data': 0,
          'grpc.http2.min_time_between_pings_ms': 10 * 1000,
          'grpc.http2.min_ping_interval_without_data_ms': 300 * 1000,
        },
      },
    };
  }

  /**
   * Generate authentication metadata for gRPC calls
   */
  generateGrpcAuthMetadata(requestContext?: {
    requestId?: string;
    userId?: string;
    userType?: string;
    sourceIp?: string;
  }): any {
    const timestamp = new Date().toISOString();
    const requestId = requestContext?.requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const userId = requestContext?.userId || 'payment-engine-service';
    const userType = requestContext?.userType || 'system';
    const sourceIp = requestContext?.sourceIp || '127.0.0.1';

    const payload = [
      userId,
      userType,
      requestId,
      timestamp,
      sourceIp,
      'merchant-service',
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
      'x-service-name': 'merchant-service',
      'x-gateway-signature': signature,
      'x-calling-service': 'payment-engine',
    };
  }
}
