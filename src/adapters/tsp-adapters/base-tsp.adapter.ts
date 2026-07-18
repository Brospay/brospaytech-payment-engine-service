import { Logger } from '@nestjs/common';
import { TSPRequest, TSPResponse } from '../parallel-tsp-processor';

export interface TSPConfig {
  apiKey: string;
  apiSecret: string;
  environment: 'production' | 'sandbox' | 'development';
  baseUrl: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
}

/**
 * Base TSP Adapter Class
 * Provides common functionality for all payment service providers
 */
export abstract class BaseTSPAdapter {
  protected readonly logger: Logger;
  protected readonly config: TSPConfig;
  protected readonly httpClient: any; // Will be injected

  constructor(
    protected readonly providerName: string,
    config: TSPConfig
  ) {
    this.logger = new Logger(`${providerName}Adapter`);
    this.config = config;
  }

  /**
   * Abstract methods that must be implemented by each TSP
   */
  abstract processPayment(request: TSPRequest): Promise<TSPResponse>;
  abstract checkPaymentStatus(transactionId: string): Promise<TSPResponse>;
  abstract cancelPayment(transactionId: string): Promise<TSPResponse>;
  abstract capturePayment(transactionId: string, amount?: number): Promise<TSPResponse>;
  abstract refundPayment(transactionId: string, amount?: number, reason?: string): Promise<TSPResponse>;

  /**
   * Common HTTP request wrapper with performance optimizations
   */
  protected async makeHttpRequest(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    data?: any,
    headers?: Record<string, string>
  ): Promise<any> {
    const startTime = performance.now();
    const url = `${this.config.baseUrl}${endpoint}`;
    
    const requestConfig = {
      method,
      url,
      data,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Valorapays-Payment-Engine/1.0',
        ...this.getAuthHeaders(),
        ...headers
      },
      timeout: this.config.timeout,
      // Performance optimizations
      maxRedirects: 3,
      validateStatus: (status: number) => status < 500, // Don't throw on 4xx
    };

    let lastError: any;
    
    // Retry logic with exponential backoff
    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        this.logger.debug(`[${this.providerName}] ${method} ${endpoint} (attempt ${attempt + 1})`);
        
        // TODO: Replace with actual HTTP client (axios/fetch)
        const response = await this.simulateHttpCall(requestConfig, attempt);
        
        const responseTime = performance.now() - startTime;
        this.logger.debug(`[${this.providerName}] Response in ${responseTime.toFixed(2)}ms`);
        
        return response;
        
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `[${this.providerName}] Request failed (attempt ${attempt + 1}/${this.config.retryAttempts + 1}):`,
          error.message
        );
        
        // Don't retry on final attempt or non-retryable errors
        if (attempt === this.config.retryAttempts || !this.isRetryableError(error)) {
          break;
        }
        
        // Exponential backoff with jitter
        const delay = this.config.retryDelay * Math.pow(2, attempt) + Math.random() * 1000;
        await this.sleep(delay);
      }
    }
    
    throw lastError;
  }

  /**
   * Get authentication headers specific to each TSP
   */
  protected abstract getAuthHeaders(): Record<string, string>;

  /**
   * Check if error is retryable
   */
  protected isRetryableError(error: any): boolean {
    // Network errors, timeouts, and 5xx errors are retryable
    if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED') return true;
    if (error.code === 'TIMEOUT') return true;
    if (error.response?.status >= 500) return true;
    if (error.response?.status === 429) return true; // Rate limited
    
    return false;
  }

  /**
   * Standardize TSP response format
   */
  protected formatResponse(
    success: boolean,
    status: TSPResponse['status'],
    responseTime: number,
    data?: any,
    error?: any
  ): TSPResponse {
    const response: TSPResponse = {
      success,
      status,
      responseTime,
    };

    if (success && data) {
      response.transactionId = data.transactionId;
      response.externalTransactionId = data.externalTransactionId;
      response.metadata = data.metadata;
    }

    if (!success && error) {
      response.error = {
        code: this.mapErrorCode(error),
        message: error.message || 'Unknown error',
        retryable: this.isRetryableError(error)
      };
    }

    return response;
  }

  /**
   * Map TSP-specific error codes to standardized codes
   */
  protected abstract mapErrorCode(error: any): string;

  /**
   * Validate payment request before processing
   */
  protected validateRequest(request: TSPRequest): void {
    if (!request.amount || request.amount <= 0) {
      throw new Error('Invalid amount');
    }
    
    if (!request.currency || request.currency.length !== 3) {
      throw new Error('Invalid currency code');
    }
    
    if (!request.merchantId) {
      throw new Error('Merchant ID is required');
    }
    
    if (!request.customerDetails?.email) {
      throw new Error('Customer email is required');
    }
  }

  /**
   * Generate unique idempotency key for TSP requests
   */
  protected generateIdempotencyKey(request: TSPRequest): string {
    const data = `${request.merchantId}-${request.amount}-${request.currency}-${Date.now()}`;
    return Buffer.from(data).toString('base64').replace(/[+/=]/g, '').substring(0, 32);
  }

  /**
   * Sleep utility for retry delays
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculate processing fee based on TSP rates
   */
  protected abstract calculateProcessingFee(amount: number, currency: string): {
    fixedFee: number;
    percentageFee: number;
    totalFee: number;
  };

  /**
   * Simulate HTTP call for testing/development
   * TODO: Replace with actual HTTP client implementation
   */
  private async simulateHttpCall(config: any, attempt: number): Promise<any> {
    // Simulate network delay
    const baseDelay = 200 + Math.random() * 300; // 200-500ms
    const networkJitter = Math.random() * 100; // 0-100ms additional jitter
    
    await this.sleep(baseDelay + networkJitter);
    
    // Simulate occasional failures for testing resilience
    const failureRate = attempt === 0 ? 0.05 : 0.02; // 5% failure on first attempt, 2% on retries
    
    if (Math.random() < failureRate) {
      const errorTypes = [
        { code: 'ECONNRESET', message: 'Connection reset by peer' },
        { code: 'TIMEOUT', message: 'Request timeout' },
        { response: { status: 503 }, message: 'Service temporarily unavailable' },
        { response: { status: 429 }, message: 'Too many requests' }
      ];
      
      const error = errorTypes[Math.floor(Math.random() * errorTypes.length)];
      throw error;
    }
    
    // Simulate successful response
    return {
      status: 200,
      data: {
        id: `sim_${Date.now()}`,
        status: 'succeeded',
        amount: config.data?.amount || 1000,
        currency: config.data?.currency || 'INR'
      }
    };
  }

  /**
   * Get adapter health status
   */
  getHealthStatus() {
    return {
      provider: this.providerName,
      environment: this.config.environment,
      baseUrl: this.config.baseUrl,
      timeout: this.config.timeout,
      healthy: true, // TODO: Implement actual health check
      lastHealthCheck: new Date().toISOString()
    };
  }
}




