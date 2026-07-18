import { Logger } from '@nestjs/common';

/**
 * Ultra-High Performance Circuit Breaker
 * Implements Netflix Hystrix-style circuit breaking for TSP calls
 */
export class CircuitBreaker {
  private readonly logger = new Logger(CircuitBreaker.name);
  
  // Circuit states
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  // Failure tracking
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  
  // Performance metrics
  private totalRequests = 0;
  private totalFailures = 0;
  private avgResponseTime = 0;
  
  // Circuit configuration
  private readonly config: {
    failureThreshold: number;      // Open circuit after N failures
    recoveryTimeout: number;       // Wait time before trying HALF_OPEN
    successThreshold: number;      // Successes needed to close circuit
    timeout: number;               // Request timeout in ms
    volumeThreshold: number;       // Minimum requests before circuit can open
  };

  constructor(
    private readonly name: string,
    config?: Partial<CircuitBreaker['config']>
  ) {
    this.config = {
      failureThreshold: 5,         // Open after 5 failures
      recoveryTimeout: 30000,      // 30 seconds
      successThreshold: 3,         // 3 successes to close
      timeout: 15000,              // 15 second timeout
      volumeThreshold: 10,         // Need 10 requests minimum
      ...config
    };
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
    const startTime = performance.now();
    this.totalRequests++;

    try {
      // Check if circuit is open
      if (this.state === 'OPEN') {
        if (this.shouldAttemptReset()) {
          this.state = 'HALF_OPEN';
          this.logger.debug(`Circuit breaker [${this.name}] attempting recovery (HALF_OPEN)`);
        } else {
          // Circuit is open, use fallback or throw error
          if (fallback) {
            return await fallback();
          }
          throw new Error(`Circuit breaker [${this.name}] is OPEN`);
        }
      }

      // Execute the function with timeout
      const result = await this.withTimeout(fn());
      
      // Success - update metrics
      this.onSuccess(performance.now() - startTime);
      return result;

    } catch (error) {
      // Failure - update metrics and check if circuit should open
      this.onFailure(performance.now() - startTime);
      
      if (fallback && this.state === 'OPEN') {
        try {
          return await fallback();
        } catch (fallbackError) {
          this.logger.error(`Fallback failed for [${this.name}]:`, fallbackError.message);
          throw error; // Throw original error
        }
      }
      
      throw error;
    }
  }

  /**
   * Add timeout wrapper around function execution
   */
  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Circuit breaker [${this.name}] timeout after ${this.config.timeout}ms`));
      }, this.config.timeout);

      promise
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timeoutId));
    });
  }

  /**
   * Handle successful execution
   */
  private onSuccess(responseTime: number): void {
    this.successCount++;
    this.updateAvgResponseTime(responseTime);
    
    if (this.state === 'HALF_OPEN') {
      if (this.successCount >= this.config.successThreshold) {
        this.state = 'CLOSED';
        this.reset();
        this.logger.log(`Circuit breaker [${this.name}] closed after successful recovery`);
      }
    } else if (this.state === 'CLOSED') {
      // Reset failure count on success
      this.failureCount = 0;
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(responseTime: number): void {
    this.failureCount++;
    this.totalFailures++;
    this.lastFailureTime = Date.now();
    this.updateAvgResponseTime(responseTime);
    
    // Check if we should open the circuit
    if (this.state === 'CLOSED' && this.shouldOpenCircuit()) {
      this.state = 'OPEN';
      this.logger.warn(
        `Circuit breaker [${this.name}] opened - ${this.failureCount} failures (${this.getFailureRate()}% failure rate)`
      );
    } else if (this.state === 'HALF_OPEN') {
      // Failed during recovery attempt, go back to OPEN
      this.state = 'OPEN';
      this.logger.warn(`Circuit breaker [${this.name}] recovery failed, back to OPEN`);
    }
  }

  /**
   * Check if circuit should be opened
   */
  private shouldOpenCircuit(): boolean {
    return (
      this.totalRequests >= this.config.volumeThreshold &&
      this.failureCount >= this.config.failureThreshold &&
      this.getFailureRate() > 50 // 50% failure rate threshold
    );
  }

  /**
   * Check if circuit should attempt reset from OPEN to HALF_OPEN
   */
  private shouldAttemptReset(): boolean {
    return Date.now() - this.lastFailureTime >= this.config.recoveryTimeout;
  }

  /**
   * Reset circuit breaker metrics
   */
  private reset(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }

  /**
   * Update rolling average response time
   */
  private updateAvgResponseTime(responseTime: number): void {
    const alpha = 0.1; // Smoothing factor
    this.avgResponseTime = (this.avgResponseTime * (1 - alpha)) + (responseTime * alpha);
  }

  /**
   * Get current failure rate percentage
   */
  private getFailureRate(): number {
    return this.totalRequests > 0 ? (this.totalFailures / this.totalRequests) * 100 : 0;
  }

  /**
   * Get current circuit breaker status and metrics
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      metrics: {
        totalRequests: this.totalRequests,
        totalFailures: this.totalFailures,
        failureRate: `${this.getFailureRate().toFixed(2)}%`,
        avgResponseTime: `${this.avgResponseTime.toFixed(2)}ms`,
        currentFailures: this.failureCount,
        currentSuccesses: this.successCount
      },
      config: this.config,
      nextRetryIn: this.state === 'OPEN' 
        ? Math.max(0, this.config.recoveryTimeout - (Date.now() - this.lastFailureTime))
        : 0
    };
  }

  /**
   * Force circuit to specific state (for testing/admin purposes)
   */
  forceState(state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'): void {
    this.logger.warn(`Circuit breaker [${this.name}] force set to ${state}`);
    this.state = state;
    
    if (state === 'CLOSED') {
      this.reset();
    }
  }

  /**
   * Check if circuit is healthy
   */
  isHealthy(): boolean {
    return this.state === 'CLOSED' && this.getFailureRate() < 10; // Less than 10% failure rate
  }
}


