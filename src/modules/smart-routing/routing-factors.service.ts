import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TSPPerformanceMetrics } from '@/entities/tsp-performance-metrics.entity';
import { TSPConfiguration } from '@/entities/tsp-configuration.entity';
import { BankPerformanceMetrics } from '@/entities/bank-performance-metrics.entity';
import { CacheService } from '@/common/services/cache.service';
import { TSPProvider } from '@/enums/tsp-provider.enum';
import { 
  RoutingContext, 
  RoutingFactors, 
  TSPPerformance,
  RoutingFactorsData,
  RoutingAnalysisResult 
} from '@/types';
import {
  isCryptoCurrency,
  isFiatCurrency,
} from '@/config/tsp-assets-reference';

/**
 * Routing Factors Analysis Service
 * Calculates 20+ routing factors for TSP selection
 */
@Injectable()
export class RoutingFactorsService {
  private readonly logger = new Logger(RoutingFactorsService.name);

  constructor(
    @InjectRepository(TSPPerformanceMetrics)
    private readonly performanceRepository: Repository<TSPPerformanceMetrics>,
    
    @InjectRepository(BankPerformanceMetrics)
    private readonly bankMetricsRepository: Repository<BankPerformanceMetrics>,
    
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Calculate Historical Performance (25% weight)
   */
  async calculateHistoricalPerformance(
    context: RoutingContext,
    tsps: TSPConfiguration[],
    requestId: string
  ): Promise<any> {
    const cacheKey = `historical_perf_${context.merchantId}_${context.paymentMethod}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) return cached;

    const results = {};
    
    for (const tsp of tsps) {
      // Query last 30 days performance
      const metrics = await this.performanceRepository
        .createQueryBuilder('metrics')
        .where('metrics.providerName = :provider', { provider: tsp.providerName })
        .andWhere('metrics.createdAt >= :thirtyDaysAgo', { 
          thirtyDaysAgo: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) 
        })
        .getMany();

      if (metrics.length > 0) {
        const successfulTxns = metrics.filter(m => (m as any).isSuccess);
        results[tsp.providerName] = {
          successRate: (successfulTxns.length / metrics.length) * 100,
          averageLatency: metrics.reduce((sum, m) => sum + (m as any).responseTime, 0) / metrics.length,
          totalTransactions: metrics.length,
          score: this.calculatePerformanceScore(successfulTxns.length / metrics.length)
        };
      } else {
        // Default for new TSPs
        results[tsp.providerName] = {
          successRate: 85.0,
          averageLatency: 2000,
          totalTransactions: 0,
          score: 85
        };
      }
    }

    await this.cacheService.set(cacheKey, results, 300); // 5min cache
    return results;
  }

  /**
   * Calculate Availability Analysis (20% weight)
   */
  async calculateAvailabilityAnalysis(tsps: TSPConfiguration[], requestId: string): Promise<any> {
    const results = {};

    for (const tsp of tsps) {
      const healthKey = `tsp_health_${tsp.providerName}`;
      let healthStatus = await this.cacheService.get(healthKey);
      
      if (!healthStatus) {
        healthStatus = await this.performHealthCheck(tsp.providerName);
        await this.cacheService.set(healthKey, healthStatus, 30); // 30s cache
      }

      const errorRate = await this.calculateRecentErrorRate(tsp.providerName);
      
      results[tsp.providerName] = {
        isHealthy: (healthStatus as any).isHealthy,
        errorRate: errorRate,
        circuitBreakerState: tsp.isActive ? 'closed' : 'open',
        score: this.calculateAvailabilityScore((healthStatus as any).isHealthy, errorRate)
      };
    }

    return results;
  }

  /**
   * Calculate Cost Analysis (15% weight)
   */
  async calculateCostAnalysis(
    context: RoutingContext, 
    tsps: TSPConfiguration[], 
    requestId: string
  ): Promise<any> {
    const results = {};

    for (const tsp of tsps) {
      const processingFee = (context.amount * (tsp.processingFeePercentage || 2.0) / 100) + 
                           (tsp.processingFeeFixed || 0);
      
      results[tsp.providerName] = {
        processingFee: processingFee,
        feePercentage: tsp.processingFeePercentage || 2.0,
        fixedFee: tsp.processingFeeFixed || 0,
        score: this.calculateCostScore(processingFee, context.amount)
      };
    }

    return results;
  }

  /**
   * Calculate Latency Analysis (15% weight)
   */
  async calculateLatencyAnalysis(
    context: RoutingContext,
    tsps: TSPConfiguration[],
    requestId: string
  ): Promise<any> {
    const results = {};

    for (const tsp of tsps) {
      const latencyKey = `tsp_latency_${tsp.providerName}`;
      let currentLatency = await this.cacheService.get(latencyKey);
      
      if (!currentLatency) {
        currentLatency = await this.measureTSPLatency(tsp.providerName);
        await this.cacheService.set(latencyKey, currentLatency, 300); // 5min cache
      }

      results[tsp.providerName] = {
        currentLatency: currentLatency,
        p99Latency: await this.getP99Latency(tsp.providerName),
        score: this.calculateLatencyScore(currentLatency as number)
      };
    }

    return results;
  }

  /**
   * 🏦 Calculate Bank Compatibility (10% weight)
   */
  async calculateBankCompatibility(
    context: RoutingContext,
    tsps: TSPConfiguration[],
    requestId: string
  ): Promise<any> {
    const bankCode = this.extractBankCode(context);
    if (!bankCode) {
      return this.getNeutralBankScore(tsps);
    }

    const results = {};

    for (const tsp of tsps) {
      const bankMetrics = await this.bankMetricsRepository
        .createQueryBuilder('metrics')
        .where('metrics.tspProvider = :provider', { provider: tsp.providerName })
        .andWhere('metrics.bankCode = :bankCode', { bankCode })
        .andWhere('metrics.createdAt >= :sevenDaysAgo', { 
          sevenDaysAgo: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) 
        })
        .getMany();

      if (bankMetrics.length > 0) {
        const successRate = bankMetrics.filter(m => (m as any).isSuccess).length / bankMetrics.length;
        results[tsp.providerName] = {
          bankCode: bankCode,
          successRate: successRate * 100,
          transactionCount: bankMetrics.length,
          score: this.calculateBankScore(successRate)
        };
      } else {
        results[tsp.providerName] = {
          bankCode: bankCode,
          successRate: 90,
          transactionCount: 0,
          score: 90
        };
      }
    }

    return results;
  }

  /**
   * Calculate Geographic Factors (5% weight)
   */
  async calculateGeographicFactors(
    context: RoutingContext,
    tsps: TSPConfiguration[],
    requestId: string
  ): Promise<any> {
    const customerCountry = context.customerLocation || 'IN';
    const results = {};

    for (const tsp of tsps) {
      let regionalPerf = await this.getRegionalPerformance(tsp.providerName, customerCountry);
      
      if (tsp.providerName.toLowerCase() === 'sulifu_pay' || tsp.providerName === TSPProvider.SULIFU_PAY) {
        const sulifuStrongCountries = ['BR', 'IN', 'CN', 'HK', 'SG', 'ID', 'TH', 'PH', 'MY', 'KR', 'JP', 'TW'];
        if (sulifuStrongCountries.includes(customerCountry)) {
          regionalPerf = Math.max(regionalPerf, 95);
        }
      }

      results[tsp.providerName] = {
        country: customerCountry,
        regionalPerformance: regionalPerf,
        timezoneScore: this.calculateTimezoneScore(customerCountry),
        score: (regionalPerf + this.calculateTimezoneScore(customerCountry)) / 2
      };
    }

    return results;
  }

  /**
   * Calculate Time-based Factors (5% weight)
   */
  async calculateTimeBasedFactors(
    context: RoutingContext,
    tsps: TSPConfiguration[],
    requestId: string
  ): Promise<any> {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();
    const results = {};

    for (const tsp of tsps) {
      const hourlyPerf = await this.getHourlyPerformance(tsp.providerName, hour);
      const isPeak = this.isPeakHour(hour);
      
      results[tsp.providerName] = {
        currentHour: hour,
        dayOfWeek: dayOfWeek,
        isPeakHour: isPeak,
        hourlyPerformance: hourlyPerf,
        score: isPeak ? hourlyPerf * 0.9 : hourlyPerf 
      };
    }

    return results;
  }

  /**
   * Calculate Custom Gaming Factors (5% weight)
   */
  async calculateCustomFactors(
    context: RoutingContext,
    tsps: TSPConfiguration[],
    requestId: string
  ): Promise<any> {
    const results = {};

    for (const tsp of tsps) {
      const gamingScore = this.calculateGamingOptimization(tsp.providerName, context);
      const industryScore = this.getIndustrySpecificScore(tsp.providerName, context.merchantIndustry);
      
      results[tsp.providerName] = {
        gamingOptimization: gamingScore,
        industryScore: industryScore,
        merchantTier: context.merchantTier || 'standard',
        score: (gamingScore + industryScore) / 2
      };
    }

    return results;
  }

  // Helper scoring methods
  private calculatePerformanceScore(successRate: number): number {
    return Math.min(100, successRate * 100 + 10); // Bonus for high success rates
  }

  private calculateAvailabilityScore(isHealthy: boolean, errorRate: number): number {
    const baseScore = isHealthy ? 100 : 50;
    const errorPenalty = errorRate * 10; // -10 points per 1% error rate
    return Math.max(0, baseScore - errorPenalty);
  }

  private calculateCostScore(fee: number, amount: number): number {
    const feePercentage = (fee / amount) * 100;
    // Score inversely related to fee percentage
    return Math.max(0, 100 - (feePercentage * 20)); // -20 points per 1%
  }

  private calculateLatencyScore(latency: number): number {
    // 0ms = 100 points, 5000ms = 0 points
    return Math.max(0, 100 - (latency / 50));
  }

  private calculateBankScore(successRate: number): number {
    return successRate * 100;
  }

  private calculateTimezoneScore(country: string): number {
    // Simple timezone optimization
    const now = new Date();
    const hour = now.getHours();
    
    if (country === 'IN') {
      // India business hours (9 AM - 9 PM IST) get higher scores
      return (hour >= 9 && hour <= 21) ? 95 : 85;
    }
    
    return 90; // Default for other countries
  }

  private calculateGamingOptimization(provider: string, context: RoutingContext): number {
    const gamingOptimizedTSPs = ['razorpay', 'stripe', 'sulifu_pay'];
    const baseScore = gamingOptimizedTSPs.includes(provider) ? 95 : 80;
    
    const amountBonus = context.amount <= 1000 ? 5 : 0;
    
    return Math.min(100, baseScore + amountBonus);
  }

  private getIndustrySpecificScore(provider: string, industry?: string): number {
    if (industry === 'gaming') {
      const gamingFriendly = ['razorpay', 'stripe', 'paytara', 'sulifu_pay'];
      return gamingFriendly.includes(provider) ? 90 : 75;
    }
    return 85;
  }

  private isPeakHour(hour: number): boolean {
    // Peak gaming hours: 6 PM - 11 PM
    return hour >= 18 && hour <= 23;
  }

  private extractBankCode(context: RoutingContext): string | null {
    return context.bankCode || null;
  }

  private getNeutralBankScore(tsps: TSPConfiguration[]): any {
    const results = {};
    for (const tsp of tsps) {
      results[tsp.providerName] = { score: 100 }; // Neutral score when no bank specific routing
    }
    return results;
  }

  // Mock implementations for external calls
  private async performHealthCheck(provider: string): Promise<any> {
    // Mock health check - replace with actual implementation
    return { isHealthy: Math.random() > 0.1, responseTime: 150 + Math.random() * 100 };
  }

  private async calculateRecentErrorRate(provider: string): Promise<number> {
    // Mock error rate - replace with actual calculation
    return Math.random() * 3; // 0-3% error rate
  }

  private async measureTSPLatency(provider: string): Promise<number> {
    // Mock latency measurement - replace with actual ping
    return 180 + Math.random() * 200; // 180-380ms
  }

  private async getP99Latency(provider: string): Promise<number> {
    // Mock P99 latency - replace with actual metrics
    return 2500 + Math.random() * 1000; // 2.5-3.5s
  }

  private async getRegionalPerformance(provider: string, country: string): Promise<number> {
    // Mock regional performance - replace with actual data
    return country === 'IN' ? 90 + Math.random() * 10 : 80 + Math.random() * 10;
  }

  private async getHourlyPerformance(provider: string, hour: number): Promise<number> {
    // Mock hourly performance - replace with actual data
    const isPeak = hour >= 10 && hour <= 22;
    return isPeak ? 85 + Math.random() * 10 : 90 + Math.random() * 10;
  }

  /**
   * Calculate TSP Country/Payment Method Support Score from DB Config
   * Uses database TSP configuration for accurate routing
   */
  async calculateTSPSupport(
    context: RoutingContext,
    tsps: TSPConfiguration[],
    requestId: string
  ): Promise<any> {
    const results: Record<string, { score: number; reason: string }> = {};
    const country = context.customerIntelligence?.geolocation?.country || 
                    context.customerLocation || 
                    'USA';

    for (const tsp of tsps) {
      const provider = tsp.providerName;
      
      // Check currency support from database config
      const supportsCurrency = !tsp.supportedCurrencies || 
                               tsp.supportedCurrencies.length === 0 ||
                               tsp.supportedCurrencies.includes(context.currency);
      
      if (!supportsCurrency) {
        results[provider] = {
          score: 30,
          reason: `Currency ${context.currency} not supported`,
        };
        continue;
      }

      // Check country support from database config
      const supportsCountry = !tsp.supportedCountries || 
                              tsp.supportedCountries.length === 0 ||
                              tsp.supportedCountries.includes(country) ||
                              tsp.supportedCountries.includes('*');
      
      if (!supportsCountry) {
        results[provider] = {
          score: 40,
          reason: `Country ${country} not supported`,
        };
        continue;
      }

      // Check payment method support from database config
      const supportsPaymentMethod = !context.paymentMethod ||
                                     !tsp.supportedPaymentMethods ||
                                     tsp.supportedPaymentMethods.length === 0 ||
                                     tsp.supportedPaymentMethods.includes(context.paymentMethod);

      if (!supportsPaymentMethod) {
        results[provider] = {
          score: 50,
          reason: `Payment method ${context.paymentMethod} not supported`,
        };
        continue;
      }

      // Crypto specialization bonus
      if (provider.toLowerCase() === 'kingdom_bank' && isCryptoCurrency(context.currency)) {
        results[provider] = {
          score: 100,
          reason: 'Crypto payment specialist',
        };
        continue;
      }

      // All checks passed - high score
      results[provider] = {
        score: 95,
        reason: 'Fully supports currency, country, and payment method',
      };
    }

    this.logger.debug(`[${requestId}] TSP support scores calculated from database config`);
    return results;
  }

  /**
   * Enhanced Currency Support Check including Kingdom Bank
   */
  async calculateCurrencySupportEnhanced(
    context: RoutingContext,
    tsps: TSPConfiguration[],
    requestId: string
  ): Promise<any> {
    const results: Record<string, { score: number; reason: string }> = {};
    const currency = context.currency;

    for (const tsp of tsps) {
      const provider = tsp.providerName;

      // Kingdom Bank currency support
      if (provider.toLowerCase() === 'kingdom_bank') {
        if (isCryptoCurrency(currency)) {
          results[provider] = {
            score: 100,
            reason: `Crypto currency ${currency} fully supported`,
          };
        } else if (isFiatCurrency(currency)) {
          results[provider] = {
            score: 95,
            reason: `Fiat currency ${currency} supported`,
          };
        } else {
          results[provider] = {
            score: 50,
            reason: `Currency ${currency} may require conversion`,
          };
        }
        continue;
      }

      // Paytara: INR specialist
      if (provider.toLowerCase() === 'paytara' || provider === TSPProvider.PAYTARA) {
        results[provider] = {
          score: currency === 'INR' ? 100 : 40,
          reason: currency === 'INR' ? 'INR specialist' : 'Primarily INR focused',
        };
        continue;
      }

      // Razorpay: INR only
      if (provider.toLowerCase() === 'razorpay' || provider === TSPProvider.RAZORPAY) {
        results[provider] = {
          score: currency === 'INR' ? 95 : 30,
          reason: currency === 'INR' ? 'INR supported' : 'INR only',
        };
        continue;
      }

      // Stripe: International currencies
      if (provider.toLowerCase() === 'stripe' || provider === TSPProvider.STRIPE) {
        results[provider] = {
          score: 90,
          reason: 'International currency support',
        };
        continue;
      }

      if (provider.toLowerCase() === 'sulifu_pay' || provider === TSPProvider.SULIFU_PAY) {
        const supportedCurrencies = ['USD', 'EUR', 'GBP', 'INR', 'BRL', 'MXN', 'JPY', 'CNY', 'SGD', 'AED', 'HKD', 'KRW', 'IDR', 'THB', 'VND', 'PHP'];
        const isSupported = supportedCurrencies.includes(currency);
        results[provider] = {
          score: isSupported ? 92 : 45,
          reason: isSupported ? `${currency} supported - Multi-region gateway` : `${currency} not confirmed`,
        };
        continue;
      }

      // Default
      results[provider] = {
        score: 70,
        reason: 'Standard currency support',
        };
    }

    this.logger.debug(`[${requestId}] Enhanced currency support scores calculated`);
    return results;
  }
}
