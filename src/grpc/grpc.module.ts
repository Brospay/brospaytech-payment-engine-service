import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { existsSync } from 'fs';

import { MerchantServiceClient } from './merchant-service.client';
import { WalletServiceClient } from './wallet-service.client';
import { CommunicationServiceClient } from './communication-service.client';
import { AuthenticatedGrpcService } from './authenticated-grpc.service';

/**
 * gRPC Module
 * Provides all gRPC clients and services
 */
const grpcClientsModule = ClientsModule.registerAsync([
  {
    name: 'MERCHANT_SERVICE',
    imports: [ConfigModule],
    useFactory: (configService: ConfigService) => {
      // Use __dirname relative path like admin service (works in both src and dist)
      const protoPath = join(__dirname, '../proto/merchant.proto');
      
      
      return {
        transport: Transport.GRPC,
        options: {
          package: 'merchant',
          protoPath,
          url: configService.get<string>('MERCHANT_SERVICE_GRPC_URL', 'localhost:50002'),
          timeout: 30000, // 30 second timeout (same as admin service)
          maxReceiveMessageLength: 4 * 1024 * 1024, // 4MB
          maxSendMessageLength: 4 * 1024 * 1024, // 4MB
          loader: {
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            arrays: true,
          },
          // Simple keepalive configuration (same as admin service)
          keepalive: {
            keepaliveTimeMs: 30000,
            keepaliveTimeoutMs: 5000,
            keepalivePermitWithoutCalls: 1,
          },
        },
      };
    },
    inject: [ConfigService],
  },
  {
    name: 'WALLET_SERVICE',
    imports: [ConfigModule],
    useFactory: (configService: ConfigService) => ({
      transport: Transport.GRPC,
      options: {
        package: 'wallet',
        protoPath: join(__dirname, '../proto/wallet-service.proto'),
        url: configService.get<string>('WALLET_SERVICE_GRPC_URL', 'localhost:50004'),
        timeout: 30000, // 30 second timeout
        maxReceiveMessageLength: 4 * 1024 * 1024, // 4MB
        maxSendMessageLength: 4 * 1024 * 1024, // 4MB
        loader: {
          keepCase: true,
          longs: String,
          enums: String,
          defaults: true,
          arrays: true,
        },
        keepalive: {
          keepaliveTimeMs: 30000,
          keepaliveTimeoutMs: 5000,
          keepalivePermitWithoutCalls: 1,
        },
      },
    }),
    inject: [ConfigService],
  },
  {
    name: 'COMMUNICATION_SERVICE',
    imports: [ConfigModule],
    useFactory: (configService: ConfigService) => ({
      transport: Transport.GRPC,
      options: {
        package: 'communication',
        protoPath: join(__dirname, '../proto/communication-service.proto'),
        url: configService.get<string>('COMMUNICATION_SERVICE_GRPC_URL', 'localhost:50006'),
        timeout: 30000, // 30 second timeout
        maxReceiveMessageLength: 4 * 1024 * 1024, // 4MB
        maxSendMessageLength: 4 * 1024 * 1024, // 4MB
        loader: {
          keepCase: true,
          longs: String,
          enums: String,
          defaults: true,
          arrays: true,
        },
        keepalive: {
          keepaliveTimeMs: 30000,
          keepaliveTimeoutMs: 5000,
          keepalivePermitWithoutCalls: 1,
        },
      },
    }),
    inject: [ConfigService],
  },
]);

@Module({
  imports: [grpcClientsModule],
  providers: [
    MerchantServiceClient,
    WalletServiceClient,
    CommunicationServiceClient,
    AuthenticatedGrpcService,
  ],
  exports: [
    grpcClientsModule,
    MerchantServiceClient,
    WalletServiceClient,
    CommunicationServiceClient,
    AuthenticatedGrpcService,
  ],
})
export class GrpcModule {}
