import { setDefaultResultOrder } from 'dns';
setDefaultResultOrder('ipv4first');
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { AppModule } from './app.module';
import { ValidationPipe, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet'; 
import { IoAdapter } from '@nestjs/platform-socket.io';

// Import guards, interceptors, and filters
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { PerformanceInterceptor } from './common/interceptors/performance.interceptor';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';
import { PerformanceConfig } from './config/performance.config';
import { FileLoggerService } from './common/logger/file-logger.service';

async function bootstrap() {
  const logger = new Logger('PaymentEngine');
  const fileLogger = new FileLoggerService('PaymentEngine');

  PerformanceConfig.optimizeNodeJS();
  PerformanceConfig.startPerformanceMonitoring();

  const app = await NestFactory.create(AppModule, {
    logger: fileLogger,
    bufferLogs: true,
  });
  const configService = app.get(ConfigService);
  
  // Enable Socket.IO adapter for WebSocket support
  app.useWebSocketAdapter(new IoAdapter(app));

  PerformanceConfig.configureExpress(app);

  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
    crossOriginEmbedderPolicy: false,
  }));

  
  app.useGlobalFilters(new GlobalExceptionFilter());

  const performanceInterceptor = app.get(PerformanceInterceptor);
  const requestLoggingInterceptor = app.get(RequestLoggingInterceptor);
  
  app.useGlobalInterceptors(performanceInterceptor);
  app.useGlobalInterceptors(requestLoggingInterceptor);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,           
      forbidNonWhitelisted: true,
      transform: true,          
      validateCustomDecorators: true,
      disableErrorMessages: process.env.NODE_ENV === 'production',
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: (errors) => {
        const formattedErrors = errors.map(error => ({
          field: error.property,
          message: Object.values(error.constraints || {})[0] || 'Validation failed',
          value: error.value,
        }));
        
        return new BadRequestException({
          message: 'Validation failed',
          error: 'VALIDATION_ERROR',
          details: formattedErrors,
        });
      },
    }),
  );

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean | string) => void) => {
      if (process.env.NODE_ENV !== 'production') {
        callback(null, origin || '*');
      } else {
        const allowedOrigins = ['https://dashboard.valorapays.com', 'https://admin.valorapays.com', 'https://api.valorapays.com', 'https://pay.valorapays.com'];
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, origin || '*');
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Content-Type', 
      'Authorization', 
      'X-Request-ID', 
      'X-Merchant-ID',
      'x-merchant-id',
      'X-API-Key',
      'x-api-key',
      'X-Timestamp',
      'x-timestamp',
      'X-Signature',
      'x-signature',
      'X-Gateway-Signature',
      'x-gateway-signature',
      'X-User-Agent',
      'X-Client',
      'x-client',
      'X-Client-Version',
      'x-client-version',
      'Accept',
      'Cache-Control',
      'Referer',
      'User-Agent',
      'sec-ch-ua',
      'sec-ch-ua-mobile',
      'sec-ch-ua-platform'
    ],
    exposedHeaders: ['X-Request-ID', 'X-Response-Time', 'X-Rate-Limit-Remaining'],
    maxAge: 86400,
  });

 
  
  app.setGlobalPrefix('payment/api/v1');

  // Set global timeout
  app.use((req, res, next) => {
    res.setTimeout(30000, () => {
      logger.error(`Request timeout: ${req.method} ${req.url}`);
      res.status(408).json({
        success: false,
        error: {
          code: 'REQUEST_TIMEOUT',
          message: 'Request timeout after 30 seconds',
          type: 'timeout'
        }
      });
    });
    next();
  });

  const httpPort = configService.get<number>('HTTP_PORT', 5003);
  const grpcPort = configService.get<number>('GRPC_PORT', 50003);

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Valorapays Payment Engine API')
      .setDescription('Enterprise-grade payment processing engine with smart routing, fraud detection, and multi-TSP support')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .addApiKey(
        {
          type: 'apiKey',
          name: 'X-API-Key',
          in: 'header',
          description: 'API Key for merchant authentication',
        },
        'API-Key',
      )
      .addServer('http://localhost:5003', 'Development server')
      .addServer('https://api.valorapays.com', 'Production server')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: 'none',
        filter: true,
        showRequestHeaders: true,
        tryItOutEnabled: true,
      },
      customSiteTitle: 'Valorapays Payment Engine API',
      customfavIcon: '/favicon.ico',
      customCss: `
        .swagger-ui .topbar { display: none }
        .swagger-ui .info .title { color: #2563eb; }
      `,
    });

    logger.log(`Swagger API Documentation available at http://localhost:${httpPort}/api/docs`);
  }

  // Start HTTP server
  await app.listen(httpPort);
  logger.log(`Payment Engine HTTP Server running on port ${httpPort}`);
  logger.log(`Environment: ${process.env.NODE_ENV}`);
  logger.log(`Database: ${configService.get('DATABASE_NAME')}`);
  

  const grpcApp = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.GRPC,
      options: {
        package: 'payment_engine',
        protoPath: join(process.cwd(), 'src/proto/payment-engine.proto'),
        url: `0.0.0.0:${grpcPort}`,
        maxReceiveMessageLength: 1024 * 1024 * 4, 
        maxSendMessageLength: 1024 * 1024 * 4,    // 4MB
        loader: {
          keepCase: true,
          longs: String,
          enums: String,
          defaults: true,
          arrays: true,
        },
        keepalive: {
          keepaliveTimeMs: 30000,              // 30 seconds
          keepaliveTimeoutMs: 5000,            // 5 seconds  
          keepalivePermitWithoutCalls: 1,      // Use number instead of boolean
          http2MaxPingsWithoutData: 0,
          http2MinTimeBetweenPingsMs: 10000,
          http2MinPingIntervalWithoutDataMs: 300000,
        },
        channelOptions: {
          // High-performance gRPC settings
          'grpc.so_reuseport': 1,
          'grpc.use_local_subchannel_pool': 1,
          'grpc.max_concurrent_streams': 1000,
          'grpc.initial_reconnect_backoff_ms': 1000,
          'grpc.max_reconnect_backoff_ms': 5000,
        },
      },
    },
  );

  await grpcApp.listen();
  logger.log(`Payment Engine gRPC Service running on port ${grpcPort}`);
  logger.log(`gRPC Package: payment_engine`);

  logger.log(`Performance monitoring: ${configService.get('PERFORMANCE_MONITORING', 'true')}`);
  logger.log(`Database query logging: ${configService.get('ENABLE_QUERY_LOGGING', 'false')}`);
  logger.log(`Connection pool size: ${configService.get('CONNECTION_POOL_SIZE', '100')}`);
  
  logger.log('Valorapays Payment Engine Service Ready - Enterprise Grade');
  
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Payment Engine Service shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Payment Engine Service shutting down gracefully...');
  process.exit(0);
});

bootstrap().catch(error => {
  console.error('Failed to start Payment Engine Service:', error);
  process.exit(1);
});