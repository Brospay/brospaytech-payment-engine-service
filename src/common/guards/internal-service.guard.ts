import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Internal Service Authentication Guard
 * Validates requests from API Gateway to Payment Engine Service
 */
@Injectable()
export class InternalServiceGuard implements CanActivate {
  private readonly logger = new Logger(InternalServiceGuard.name);
  private readonly sharedSecret: string;

  constructor(private configService: ConfigService) {
    this.sharedSecret = this.configService.get<string>(
      'INTERNAL_SERVICE_SECRET',
      'valorapays_internal_service_secret_development'
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    
    try {
      return this.validateInternalRequest(request);
    } catch (error) {
      this.logger.error('Internal service authentication failed:', error);
      throw new UnauthorizedException('Invalid internal service request');
    }
  }

  private validateInternalRequest(request: any): boolean {
    // DEBUG: Log all received headers
    console.log('[Payment Engine] ALL X-HEADERS RECEIVED:');
    Object.keys(request.headers).forEach(key => {
      if (key.startsWith('x-')) {
        console.log(`  ${key}: "${request.headers[key]}"`);
      }
    });

    // Extract gateway authentication headers
    const gatewaySignature = request.headers['x-gateway-signature'];
    const requestId = request.headers['x-request-id'];
    const timestamp = request.headers['x-timestamp'];
    const authenticatedUser = request.headers['x-authenticated-user'];
    const userType = request.headers['x-user-type'];
    const sourceIp = request.headers['x-source-ip'];
    const serviceName = request.headers['x-service-name'];

    // Validate required headers
    if (!gatewaySignature) {
      this.logger.warn('Missing gateway signature in internal request');
      throw new UnauthorizedException('Missing gateway signature');
    }

    if (!requestId || !timestamp) {
      this.logger.warn('Missing required headers in internal request');
      throw new UnauthorizedException('Missing required authentication headers');
    }

    // Validate timestamp (prevent replay attacks - 5 minute window)
    const requestTime = new Date(timestamp).getTime();
    const currentTime = Date.now();
    const timeDiff = Math.abs(currentTime - requestTime);
    const maxAge = 5 * 60 * 1000; // 5 minutes

    if (timeDiff > maxAge) {
      this.logger.warn(`Request timestamp too old: ${timeDiff}ms vs ${maxAge}ms limit`);
      throw new UnauthorizedException('Request timestamp expired');
    }

    // Generate expected signature
    const payload = [
      authenticatedUser || 'anonymous',
      userType || 'unknown',
      requestId || '',
      timestamp,
      sourceIp || '',
      serviceName || '',
    ].join('|');

    // DEBUG: Log payload for signature debugging
    console.log(`[Payment Engine] Expected payload: "${payload}"`);
    console.log(`[Payment Engine] Individual values: authenticatedUser="${authenticatedUser}", userType="${userType}", requestId="${requestId}", timestamp="${timestamp}", sourceIp="${sourceIp}", serviceName="${serviceName}"`);

    const expectedSignature = crypto
      .createHmac('sha256', this.sharedSecret)
      .update(payload)
      .digest('hex');
      
    console.log(`[Payment Engine] Expected signature: ${expectedSignature}`);
    console.log(`[Payment Engine] Received signature: ${gatewaySignature}`);

    // Compare signatures securely
    const isValidSignature = crypto.timingSafeEqual(
      Buffer.from(gatewaySignature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );

    if (!isValidSignature) {
      this.logger.error(`Invalid gateway signature. Expected: ${expectedSignature}, Got: ${gatewaySignature}`);
      throw new UnauthorizedException('Invalid gateway signature');
    }

    // Attach internal context to request
    request.internalAuth = {
      requestId,
      authenticatedUser,
      userType,
      sourceIp,
      serviceName,
      timestamp,
      isValidated: true,
    };

    this.logger.debug(`Internal request validated: ${serviceName} from gateway`);
    return true;
  }

  /**
   * Helper method to check if request is from API Gateway
   */
  static isInternalRequest(request: any): boolean {
    return !!(request.headers['x-gateway-signature'] && request.headers['x-service-name']);
  }

  /**
   * Helper method to get authenticated user from internal context
   */
  static getInternalUser(request: any): {
    userId: string;
    userType: string;
    merchantId?: string;
  } | null {
    if (!request.internalAuth?.isValidated) {
      return null;
    }

    return {
      userId: request.internalAuth.authenticatedUser,
      userType: request.internalAuth.userType,
      merchantId: request.headers['x-merchant-id'],
    };
  }
}
