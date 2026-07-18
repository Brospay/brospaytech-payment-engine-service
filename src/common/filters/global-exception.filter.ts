import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { BaseResponse } from '@/dto/common/response.dto';

/**
 * Global Exception Filter
 * Handles all unhandled exceptions and formats them consistently
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string;
    let errorCode: string;
    let errorType: string;
    let details: any = null;

    // Handle different exception types
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as any;
        message = resp.message || exception.message;
        errorCode = resp.error || exception.name;
        details = resp.details || null;
      } else {
        message = exception.message;
        errorCode = exception.name;
      }
      
      errorType = this.getErrorType(status);
    } else if (exception instanceof Error) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = process.env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : exception.message;
      errorCode = 'INTERNAL_SERVER_ERROR';
      errorType = 'server_error';
      
      // Log the actual error for debugging
      this.logger.error('Unhandled error:', exception.stack);
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Unknown error occurred';
      errorCode = 'UNKNOWN_ERROR';
      errorType = 'server_error';
      
      this.logger.error('Unknown exception type:', exception);
    }

    // Generate request ID for tracking
    const requestId = request.headers['x-request-id'] as string || `err_${Date.now()}`;

    // Build error object conditionally
    const errorObject: any = {
      code: errorCode,
      message,
      type: errorType,
    };

    // Add details if present
    if (details) {
      errorObject.details = details;
    }

    // Add stack trace ONLY in development mode
    if (process.env.NODE_ENV === 'development' && exception instanceof Error) {
      errorObject.stack = exception.stack;
    }

    // Create standardized error response
    const errorResponse: BaseResponse<null> = {
      success: false,
      data: null,
      message,
      error: errorObject,
      meta: {
        request_id: requestId,
        timestamp: new Date().toISOString(),
        processing_time_ms: 0,
        api_version: 'v1',
        endpoint: `${request.method} ${request.url}`,
        user_type: request.headers['x-user-type'] as string || 'unknown',
      },
    };

    // Log error with context
    this.logger.error(
      `[${requestId}] ${request.method} ${request.url} - ${status} - ${message}`,
      exception instanceof Error ? exception.stack : exception
    );

    // Send response
    response.status(status).json(errorResponse);
  }

  private getErrorType(status: number): string {
    if (status >= 400 && status < 500) {
      switch (status) {
        case 400: return 'validation_error';
        case 401: return 'authentication_error';
        case 403: return 'authorization_error';
        case 404: return 'not_found';
        case 409: return 'conflict';
        case 422: return 'validation_error';
        case 429: return 'rate_limit_exceeded';
        default: return 'client_error';
      }
    } else if (status >= 500) {
      return 'server_error';
    }
    return 'unknown_error';
  }
}




