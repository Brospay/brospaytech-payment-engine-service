import { BadRequestException } from '@nestjs/common';
import { BaseResponse } from '@/dto/common/response.dto';

/**
 * Helper class for common controller operations
 */
export class ResponseHelper {
  /**
   * Validate required headers for merchant API endpoints
   */
  static validateMerchantHeaders(merchantId: string, requestId: string): void {
    if (!merchantId) {
      throw new BadRequestException('x-merchant-id header is required');
    }
    if (!requestId) {
      throw new BadRequestException('x-request-id header is required');
    }
  }

  /**
   * Validate required parameters
   */
  static validateRequiredParams(params: Record<string, any>): void {
    for (const [key, value] of Object.entries(params)) {
      if (!value) {
        throw new BadRequestException(`${key} parameter is required`);
      }
    }
  }

  /**
   * Create success response following API Gateway pattern
   */
  static createSuccessResponse<T>(
    data: T,
    message: string,
    requestId: string,
    endpoint: string,
    startTime: number
  ): BaseResponse<T> {
    return {
      success: true,
      data,
      message,
      error: null,
      meta: {
        request_id: requestId,
        timestamp: new Date().toISOString(),
        processing_time_ms: Date.now() - startTime,
        api_version: 'v1',
        endpoint,
        user_type: 'merchant',
      },
    };
  }

  /**
   * Create error response following API Gateway pattern
   */
  static createErrorResponse(
    errorCode: string,
    errorMessage: string,
    errorType: string,
    requestId: string,
    endpoint: string,
    details?: any
  ): BaseResponse<null> {
    return {
      success: false,
      data: null,
      message: errorMessage,
      error: {
        code: errorCode,
        message: errorMessage,
        type: errorType,
        details,
      },
      meta: {
        request_id: requestId,
        timestamp: new Date().toISOString(),
        processing_time_ms: 0,
        api_version: 'v1',
        endpoint,
        user_type: 'merchant',
      },
    };
  }

  /**
   * Execute service call with automatic error handling and response formatting
   */
  static async executeServiceCall<T>(
    serviceCall: () => Promise<T>,
    requestId: string,
    endpoint: string,
    successMessage: string,
    errorCode: string,
    errorMessage: string = 'Operation failed'
  ): Promise<BaseResponse<T>> {
    const startTime = Date.now();
    
    try {
      const result = await serviceCall();
      return this.createSuccessResponse(result, successMessage, requestId, endpoint, startTime);
    } catch (error) {
      return this.createErrorResponse(
        errorCode,
        errorMessage,
        'service_error',
        requestId,
        endpoint,
        error.message
      );
    }
  }
}




