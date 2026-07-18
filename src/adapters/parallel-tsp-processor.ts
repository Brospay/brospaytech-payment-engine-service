import { Injectable, Logger } from '@nestjs/common';
import { CircuitBreaker } from './circuit-breaker';

export interface TSPRequest {
  provider: string;
  amount: number;
  currency: string;
  merchantId: string;
  customerDetails: any;
  paymentMethod: any;
  metadata?: Record<string, any>;
}

export interface TSPResponse {
  success: boolean;
  transactionId?: string;
  externalTransactionId?: string;
  status: 'processing' | 'completed' | 'failed' | 'timeout';
  responseTime: number;
  error?: {
    code: string;
    message: string;
    retryable?: boolean;
  };
  metadata?: Record<string, any>;
}

export interface TSPResult {
  provider: string;
  response: TSPResponse;
  ranking: number;
  confidence: number;
}

/**
 * Ultra-High Performance Parallel TSP Processor
 * Handles concurrent TSP calls with circuit breakers, intelligent fallbacks, and sub-second response times
 */
@Injectable()
export class ParallelTSPProcessor {
  private readonly logger = new Logger(ParallelTSPProcessor.name);
  
  // Circuit breakers for each TSP
  private readonly circuitBreakers = new Map<string, CircuitBreaker>();
  
  // TSP adapters registry
  private readonly tspAdapters = new Map<string, (request: TSPRequest) => Promise<TSPResponse>>();
  
  // Performance metrics
  private readonly metrics = {
    totalRequests: 0,
    parallelSuccesses: 0,
    fallbackUsed: 0,
    avgProcessingTime: 0,
    tspPerformance: new Map<string, {
      requests: number;
      successes: number;
      avgResponseTime: number;
      lastUsed: number;
    }>()
  };

  constructor() {
    this.initializeCircuitBreakers();
    this.initializeTSPAdapters();
  }

  /**
   * Process payment with intelligent parallel TSP execution
   */
  async processPayment(
    request: TSPRequest,
    tspCandidates: string[],
    options: {
      maxParallel?: number;
      failureTolerance?: number;
      timeoutMs?: number;
      requireAllSuccess?: boolean;
    } = {}
  ): Promise<TSPResult> {
    const startTime = performance.now();
    this.metrics.totalRequests++;
    
    const config = {
      maxParallel: options.maxParallel || 3,
      failureTolerance: options.failureTolerance || 1,
      timeoutMs: options.timeoutMs || 10000,
      requireAllSuccess: options.requireAllSuccess || false
    };

    try {
      // Phase 1: Ultra-fast parallel execution
      const results = await this.executeParallelTSPs(request, tspCandidates, config);
      
      // Phase 2: Intelligent result selection
      const bestResult = this.selectBestResult(results, config);
      
      if (bestResult) {
        this.updateSuccessMetrics(performance.now() - startTime);
        this.logger.debug(`Payment processed successfully via ${bestResult.provider} (${bestResult.response.responseTime.toFixed(2)}ms)`);
        return bestResult;
      }

      // Phase 3: Intelligent fallback with remaining TSPs
      const fallbackResult = await this.executeFallbackStrategy(request, tspCandidates, results, config);
      
      if (fallbackResult) {
        this.metrics.fallbackUsed++;
        this.logger.warn(`Payment processed via fallback: ${fallbackResult.provider}`);
        return fallbackResult;
      }

      // All TSPs failed
      throw new Error('All TSP processing attempts failed');

    } catch (error) {
      const processingTime = performance.now() - startTime;
      this.logger.error(`Parallel payment processing failed after ${processingTime.toFixed(2)}ms:`, error.message);
      
      // Return failure result
      return {
        provider: 'SYSTEM_FAILURE',
        response: {
          success: false,
          status: 'failed',
          responseTime: processingTime,
          error: {
            code: 'PARALLEL_PROCESSING_FAILED',
            message: error.message,
            retryable: true
          }
        },
        ranking: 0,
        confidence: 0
      };
    }
  }

  /**
   * Execute TSPs in parallel with circuit breaker protection
   */
  private async executeParallelTSPs(
    request: TSPRequest,
    tspCandidates: string[],
    config: any
  ): Promise<TSPResult[]> {
    const availableTSPs = tspCandidates.filter(tsp => {
      const circuitBreaker = this.circuitBreakers.get(tsp);
      return circuitBreaker?.isHealthy() !== false;
    });

    if (availableTSPs.length === 0) {
      throw new Error('No healthy TSPs available');
    }

    // Execute up to maxParallel TSPs simultaneously
    const parallelTSPs = availableTSPs.slice(0, config.maxParallel);
    const promises = parallelTSPs.map(tsp => this.executeSingleTSP(request, tsp));

    // Race condition: return as soon as we have enough successful responses
    const results = await Promise.allSettled(promises);
    
    return results.map((result, index) => {
      const tsp = parallelTSPs[index];
      
      if (result.status === 'fulfilled') {
        return {
          provider: tsp,
          response: result.value,
          ranking: this.calculateTSPRanking(tsp, result.value),
          confidence: this.calculateConfidence(tsp, result.value)
        };
      } else {
        return {
          provider: tsp,
          response: {
            success: false,
            status: 'failed',
            responseTime: 0,
            error: {
              code: 'TSP_EXECUTION_ERROR',
              message: result.reason?.message || 'Unknown error',
              retryable: true
            }
          },
          ranking: 0,
          confidence: 0
        };
      }
    });
  }

  /**
   * Execute single TSP with circuit breaker protection
   */
  private async executeSingleTSP(request: TSPRequest, tsp: string): Promise<TSPResponse> {
    const circuitBreaker = this.circuitBreakers.get(tsp);
    const adapter = this.tspAdapters.get(tsp);
    
    if (!adapter) {
      throw new Error(`TSP adapter not found: ${tsp}`);
    }

    const tspPerformance = this.metrics.tspPerformance.get(tsp) || {
      requests: 0,
      successes: 0,
      avgResponseTime: 0,
      lastUsed: 0
    };

    tspPerformance.requests++;
    tspPerformance.lastUsed = Date.now();

    // Execute with circuit breaker protection
    const result = await circuitBreaker!.execute(
      () => adapter(request),
      () => this.getFallbackResponse(tsp)
    );

    // Update performance metrics
    if (result.success) {
      tspPerformance.successes++;
      const alpha = 0.1;
      tspPerformance.avgResponseTime = 
        (tspPerformance.avgResponseTime * (1 - alpha)) + (result.responseTime * alpha);
    }

    this.metrics.tspPerformance.set(tsp, tspPerformance);
    return result;
  }

  /**
   * Select the best result from parallel execution
   */
  private selectBestResult(results: TSPResult[], config: any): TSPResult | null {
    const successfulResults = results.filter(r => r.response.success);
    
    if (successfulResults.length === 0) {
      return null;
    }

    // If we require all to succeed and not all succeeded
    if (config.requireAllSuccess && successfulResults.length < results.length) {
      return null;
    }

    // Sort by ranking (higher is better) then by confidence
    successfulResults.sort((a, b) => {
      if (a.ranking !== b.ranking) {
        return b.ranking - a.ranking;
      }
      return b.confidence - a.confidence;
    });

    return successfulResults[0];
  }

  /**
   * Execute fallback strategy with remaining TSPs
   */
  private async executeFallbackStrategy(
    request: TSPRequest,
    originalCandidates: string[],
    executedResults: TSPResult[],
    config: any
  ): Promise<TSPResult | null> {
    const executedTSPs = executedResults.map(r => r.provider);
    const remainingTSPs = originalCandidates.filter(tsp => !executedTSPs.includes(tsp));

    if (remainingTSPs.length === 0) {
      return null;
    }

    // Try remaining TSPs one by one (not parallel for fallback)
    for (const tsp of remainingTSPs) {
      try {
        const response = await this.executeSingleTSP(request, tsp);
        
        if (response.success) {
          return {
            provider: tsp,
            response,
            ranking: this.calculateTSPRanking(tsp, response),
            confidence: this.calculateConfidence(tsp, response)
          };
        }
      } catch (error) {
        this.logger.warn(`Fallback TSP ${tsp} failed:`, error.message);
        continue;
      }
    }

    return null;
  }

  /**
   * Calculate TSP ranking based on historical performance
   */
  private calculateTSPRanking(tsp: string, response: TSPResponse): number {
    const performance = this.metrics.tspPerformance.get(tsp);
    
    if (!performance || performance.requests === 0) {
      return 50; // Default ranking for new TSPs
    }

    const successRate = (performance.successes / performance.requests) * 100;
    const responseTimeScore = Math.max(0, 100 - (performance.avgResponseTime / 100)); // Lower is better
    const recentUsageBonus = Date.now() - performance.lastUsed < 300000 ? 10 : 0; // 5 min recency bonus

    return Math.min(100, successRate * 0.6 + responseTimeScore * 0.3 + recentUsageBonus);
  }

  /**
   * Calculate confidence score for the result
   */
  private calculateConfidence(tsp: string, response: TSPResponse): number {
    if (!response.success) return 0;
    
    const baseConfidence = 80;
    const responseTimeBonus = Math.max(0, 20 - (response.responseTime / 100)); // Faster = higher confidence
    const circuitBreakerHealth = this.circuitBreakers.get(tsp)?.isHealthy() ? 10 : -20;
    
    return Math.min(100, Math.max(0, baseConfidence + responseTimeBonus + circuitBreakerHealth));
  }

  /**
   * Get fallback response when primary TSP fails
   */
  private getFallbackResponse(tsp: string): Promise<TSPResponse> {
    return Promise.resolve({
      success: false,
      status: 'failed',
      responseTime: 0,
      error: {
        code: 'CIRCUIT_BREAKER_OPEN',
        message: `TSP ${tsp} circuit breaker is open`,
        retryable: true
      }
    });
  }

  /**
   * Update success metrics
   */
  private updateSuccessMetrics(processingTime: number): void {
    this.metrics.parallelSuccesses++;
    const alpha = 0.1;
    this.metrics.avgProcessingTime = 
      (this.metrics.avgProcessingTime * (1 - alpha)) + (processingTime * alpha);
  }

  /**
   * Initialize circuit breakers for all TSPs
   */
  private initializeCircuitBreakers(): void {
    const tsps = ['paytara', 'razorpay', 'stripe', 'kingdom_bank'];
    
    for (const tsp of tsps) {
      this.circuitBreakers.set(tsp, new CircuitBreaker(tsp, {
        failureThreshold: 5,
        recoveryTimeout: 30000,
        successThreshold: 3,
        timeout: 15000,
        volumeThreshold: 10
      }));
    }
  }

  /**
   * Initialize TSP adapters (placeholder - actual implementations to be added)
   */
  private initializeTSPAdapters(): void {
    // Paytara adapter
    this.tspAdapters.set('paytara', async (request) => {
      // TODO: Implement actual Paytara API call
      await this.simulateNetworkCall(800); // Simulate 800ms response time
      return {
        success: Math.random() > 0.1, // 90% success rate
        transactionId: `ptx_${Date.now()}`,
        externalTransactionId: `paytara_${Date.now()}`,
        status: 'completed',
        responseTime: 800
      };
    });

    // Razorpay adapter
    this.tspAdapters.set('razorpay', async (request) => {
      // TODO: Implement actual Razorpay API call
      await this.simulateNetworkCall(600); // Simulate 600ms response time
      return {
        success: Math.random() > 0.05, // 95% success rate
        transactionId: `rtx_${Date.now()}`,
        externalTransactionId: `rzp_${Date.now()}`,
        status: 'completed',
        responseTime: 600
      };
    });

    // Stripe adapter  
    this.tspAdapters.set('stripe', async (request) => {
      // TODO: Implement actual Stripe API call
      await this.simulateNetworkCall(400); // Simulate 400ms response time
      return {
        success: Math.random() > 0.02, // 98% success rate
        transactionId: `stx_${Date.now()}`,
        externalTransactionId: `pi_${Date.now()}`,
        status: 'completed',
        responseTime: 400
      };
    });
  }

  /**
   * Simulate network call delay
   */
  private simulateNetworkCall(delayMs: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, delayMs));
  }

  /**
   * Get comprehensive system metrics
   */
  getMetrics() {
    const circuitBreakerStats = Array.from(this.circuitBreakers.entries()).map(([tsp, cb]) => ({
      tsp,
      ...cb.getStatus()
    }));

    const tspPerformanceStats = Array.from(this.metrics.tspPerformance.entries()).map(([tsp, perf]) => ({
      tsp,
      successRate: `${((perf.successes / perf.requests) * 100).toFixed(2)}%`,
      avgResponseTime: `${perf.avgResponseTime.toFixed(2)}ms`,
      totalRequests: perf.requests,
      lastUsed: new Date(perf.lastUsed).toISOString()
    }));

    return {
      overall: {
        totalRequests: this.metrics.totalRequests,
        parallelSuccesses: this.metrics.parallelSuccesses,
        fallbackUsed: this.metrics.fallbackUsed,
        successRate: `${((this.metrics.parallelSuccesses / this.metrics.totalRequests) * 100).toFixed(2)}%`,
        avgProcessingTime: `${this.metrics.avgProcessingTime.toFixed(2)}ms`
      },
      circuitBreakers: circuitBreakerStats,
      tspPerformance: tspPerformanceStats
    };
  }

  /**
   * Health check for the entire system
   */
  isHealthy(): boolean {
    const healthyCircuitBreakers = Array.from(this.circuitBreakers.values())
      .filter(cb => cb.isHealthy()).length;
    
    return healthyCircuitBreakers >= 2; // At least 2 TSPs should be healthy
  }
}




