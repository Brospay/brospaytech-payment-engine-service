import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InternalServiceGuard } from './internal-service.guard';

/**
 * Internal Service Authentication Guard
 * Validates requests from API Gateway 
 */
@Injectable()
export class CombinedAuthGuard implements CanActivate {
  private readonly logger = new Logger(CombinedAuthGuard.name);

  constructor(
    private readonly internalServiceGuard: InternalServiceGuard,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if this is a gRPC request - skip authentication for internal gRPC calls
    if (context.getType() === 'rpc') {
      this.logger.debug('gRPC request detected - skipping authentication (internal service call)');
      return true;
    }

    const request = context.switchToHttp().getRequest();
    
    // Check if this endpoint should skip authentication (e.g., health checks)
    const isPublic = this.reflector.get<boolean>('isPublic', context.getHandler()) ||
                     this.reflector.get<boolean>('isPublic', context.getClass());

    if (isPublic) {
      this.logger.debug(`Public endpoint accessed: ${request.method} ${request.url}`);
      return true;
    }

    // Apply internal service authentication (API Gateway already handled rate limiting)
    const authPassed = this.internalServiceGuard.canActivate(context);
    if (!authPassed) {
      return false;
    }

    this.logger.debug(`Internal request authenticated from API Gateway: ${request.method} ${request.url}`);
    return true;
  }
}

/**
 * Decorator to mark endpoints as public (skip authentication)
 */
import { SetMetadata } from '@nestjs/common';
export const Public = () => SetMetadata('isPublic', true);
