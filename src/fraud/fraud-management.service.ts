import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

import { PaymentTransaction } from '@/entities/payment-transaction.entity';
import { LoggerService } from '@/common/services/logger.service';
import { CacheService } from '@/common/services/cache.service';
import { AuthenticatedGrpcService } from '@/grpc/authenticated-grpc.service';
import { CustomerResolutionService } from '@/modules/customer-resolution/customer-resolution.service';
import { 
  MerchantServiceGrpc, 
  FraudAnalysisResult, 
  CustomerProfile, 
  FraudCheckRequest, 
  FraudCheckResponse,
  VelocityCheck,
  FraudRule 
} from '@/types';
import {
  UpdateCustomerRiskScoreRequestDto,
  UpdateCustomerRiskScoreResponseDto,
  GetMerchantFraudSettingsRequestDto,
  GetMerchantFraudSettingsResponseDto
} from '@/dto/merchant-service';

/**
 * Fraud Management Service
 * Analyzes payment risks and manages fraud prevention
 */
@Injectable()
export class FraudManagementService implements OnModuleInit {
  private merchantService: MerchantServiceGrpc;
  private readonly sharedSecret: string;

  constructor(
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepo: Repository<PaymentTransaction>,
    
    @Inject('MERCHANT_SERVICE')
    private readonly merchantGrpcClient: ClientGrpc,
    private readonly logger: LoggerService,
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
    private readonly authenticatedGrpc: AuthenticatedGrpcService,
    private readonly customerResolutionService: CustomerResolutionService,
  ) {
    this.sharedSecret = this.configService.get<string>(
      'INTERNAL_SERVICE_SECRET',
      'valorapays-internal-secret-2024'
    );
  }

  onModuleInit() {
    // Use authenticated wrapper for all merchant service calls
    this.merchantService = this.authenticatedGrpc.wrapGrpcClient<MerchantServiceGrpc>(
      this.merchantGrpcClient, 
      'MerchantService',
      'merchant-service'
    );
  }

  /**
   * Analyze payment for fraud risk
   */
  async analyzeFraudRisk(
    merchantId: number,
    customerId: string,
    amount: number,
    currency: string,
    paymentDetails: any,
    deviceInfo?: any
  ): Promise<FraudAnalysisResult> {
    try {
      this.logger.log(`Analyzing fraud risk for customer: ${customerId}, amount: ${amount}`);

      const startTime = Date.now();
      
      // Get customer profile from merchant service
      const customerProfile = await this.getCustomerProfile(merchantId.toString(), customerId);
      
      // Get merchant fraud settings
      const fraudSettings = await this.getMerchantFraudSettings(merchantId);
      
      // Perform fraud analysis
      const analysis = await this.performFraudAnalysis(
        customerProfile,
        fraudSettings,
        amount,
        currency,
        paymentDetails,
        deviceInfo
      );
      
      // Update customer risk score and invalidate cache
      await this.updateCustomerRiskScore(
        merchantId,
        customerId,
        analysis.riskScore,
        analysis.fraudFlags
      );
      
      // Invalidate cached customer profile to force refresh with updated risk data
      const cacheKey = `customer_profile:${merchantId}:${customerId}`;
      await this.cacheService.delete(cacheKey);
      
      const responseTime = Date.now() - startTime;
      this.logger.log(`Fraud analysis completed: ${customerId} -> ${analysis.riskLevel} (${responseTime}ms)`);
      
      return analysis;
      
    } catch (error) {
      this.logger.error(`Fraud analysis failed for customer: ${customerId}`, error);
      
      // Return conservative analysis on error
      return {
        riskScore: 75,
        riskLevel: 'high',
        fraudFlags: ['analysis_error'],
        recommendation: 'review',
        reasons: ['Fraud analysis system error'],
      };
    }
  }

  /**
   * Get customer profile using customer-resolution service (architectural fix)
   */
  private async getCustomerProfile(merchantId: string, customerId: string): Promise<CustomerProfile> {
    const cacheKey = `customer_profile:${merchantId}:${customerId}`;
    
    // Try cache first
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached as CustomerProfile;
    }
    
    try {
      // Use customer-resolution service (proper architecture)
      const customerResult = await this.customerResolutionService.resolveCustomer(
        merchantId,
        customerId,
        undefined, // No inline customer details
        `fraud_${Date.now()}`,
        false // Don't create if not exists
      );

      if (!customerResult.success || !customerResult.customer) {
        throw new Error(`Customer not found: ${customerId}`);
      }

      // Get transaction history (fraud service responsibility)
      const transactionHistory = await this.getCustomerTransactionHistory(customerId);
      
      const profile: CustomerProfile = {
        // Base customer info
        customerId,
        merchantId,
        email: customerResult.customer.email,
        phone: customerResult.customer.phone,
        name: customerResult.customer.name,
        createdAt: customerResult.customer.createdAt,
        lastTransactionAt: customerResult.customer.lastTransactionAt,
        isNewCustomer: customerResult.customer.isNewCustomer,
        
        // Transaction history
        previousTransactions: transactionHistory.total,
        successfulTransactions: transactionHistory.successful,
        failedTransactions: transactionHistory.failed,
        totalTransactionAmount: transactionHistory.totalAmount,
        totalTransactionCount: transactionHistory.total,
        averageAmount: transactionHistory.averageAmount,
        
        // Use complete risk profile from customer-resolution
        riskProfile: customerResult.customer.riskProfile || {
          riskLevel: 'low',
          riskScore: 50,
          isBlacklisted: false,
          lastRiskCheck: new Date(),
          riskFactors: []
        },
        
        // Backward compatibility fields
        totalAmount: transactionHistory.totalAmount,
        fraudFlags: customerResult.customer.riskProfile?.riskFactors || [],
        
        // Device/location info (not available from customer-resolution)
        deviceFingerprint: undefined,
        ipAddress: undefined,
        location: undefined,
      };
      
      // Cache for 10 minutes
      await this.cacheService.set(cacheKey, profile, 600);
      
      return profile;
      
    } catch (error) {
      this.logger.error(`Failed to get customer profile: ${customerId}`, error);
      
      // Return minimal profile based on transaction history only
      const transactionHistory = await this.getCustomerTransactionHistory(customerId);
      
      return {
        // Base customer info (minimal)
        customerId,
        merchantId,
        email: undefined,
        phone: undefined,
        name: undefined,
        createdAt: new Date(), // Default to now
        lastTransactionAt: transactionHistory.lastTransactionDate,
        isNewCustomer: transactionHistory.total === 0,
        
        // Transaction history
        previousTransactions: transactionHistory.total,
        successfulTransactions: transactionHistory.successful,
        failedTransactions: transactionHistory.failed,
        totalTransactionAmount: transactionHistory.totalAmount,
        totalTransactionCount: transactionHistory.total,
        averageAmount: transactionHistory.averageAmount,
        
        // Default risk profile
        riskProfile: {
          riskLevel: 'medium' as const, // Conservative default when customer not found
          riskScore: 50,
          isBlacklisted: false,
          lastRiskCheck: new Date(),
          riskFactors: ['customer_resolution_failed']
        },
        
        // Backward compatibility fields
        totalAmount: transactionHistory.totalAmount,
        fraudFlags: ['customer_resolution_failed'],
        
        // Device/location info
        deviceFingerprint: undefined,
        ipAddress: undefined,
        location: undefined,
      };
    }
  }

  /**
   * Get merchant fraud settings using proper DTOs
   */
  private async getMerchantFraudSettings(merchantId: number): Promise<GetMerchantFraudSettingsResponseDto> {
    const cacheKey = `fraud_settings:${merchantId}`;
    
    // Try cache first
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached as GetMerchantFraudSettingsResponseDto;
    }
    
    try {
      const request: GetMerchantFraudSettingsRequestDto = {
        merchant_id: merchantId.toString()
      };

      // Use proper DTO with type safety
      const settings = await this.authenticatedGrpc.callGrpcMethod<GetMerchantFraudSettingsResponseDto>(
        this.merchantService,
        'getMerchantFraudSettings',
        request,
        'MerchantService',
        {
          requestId: `fraud_settings_${Date.now()}`,
          sourceIp: '127.0.0.1',
        }
      );
      
      // Cache for 1 hour
      await this.cacheService.set(cacheKey, settings, 3600);
      
      return settings;
      
    } catch (error) {
      this.logger.error(`Failed to get fraud settings for merchant: ${merchantId}`, error);
      
      // Return default settings matching proto structure
      return {
        merchant_id: merchantId.toString(),
        max_amount_per_transaction: 10000000, // 1 lakh INR in paisa
        max_amount_per_day: 50000000, // 5 lakh INR in paisa
        max_transactions_per_hour: 10,
        enable_velocity_checks: true,
        enable_device_fingerprinting: true,
        risk_thresholds: {
          low: 25,
          medium: 50,
          high: 75,
        },
      };
    }
  }

  /**
   * Perform comprehensive fraud analysis
   */
  private async performFraudAnalysis(
    customer: CustomerProfile,
    settings: GetMerchantFraudSettingsResponseDto,
    amount: number,
    currency: string,
    paymentDetails: any,
    deviceInfo?: any
  ): Promise<FraudAnalysisResult> {
    const fraudFlags: string[] = [];
    const reasons: string[] = [];
    let riskScore = customer.riskProfile?.riskScore || 50;

    // Amount-based checks (convert paisa to INR for logging)
    if (amount > settings.max_amount_per_transaction) {
      fraudFlags.push('amount_exceeds_limit');
      reasons.push(`Amount exceeds merchant limit of ${settings.max_amount_per_transaction / 100} INR`);
      riskScore += 20;
    }

    if (customer.averageAmount > 0 && amount > customer.averageAmount * 5) {
      fraudFlags.push('amount_significantly_higher');
      reasons.push('Amount is significantly higher than customer average');
      riskScore += 15;
    }

    // Velocity checks
    if (settings.enable_velocity_checks) {
      const recentTransactions = await this.getRecentTransactionCount(customer.customerId, 1);    
      if (recentTransactions > settings.max_transactions_per_hour) {
        fraudFlags.push('velocity_exceeded');
        reasons.push(`Too many transactions in short period: ${recentTransactions}`);
        riskScore += 25;
      }
    }

    // First-time customer
    if (customer.previousTransactions === 0) {
      fraudFlags.push('first_time_customer');
      reasons.push('First transaction for this customer');
      riskScore += 10;
    }

    // High failure rate
    const failureRate = customer.previousTransactions > 0 
      ? (customer.failedTransactions / customer.previousTransactions) * 100 
      : 0;
    
    if (failureRate > 50) {
      fraudFlags.push('high_failure_rate');
      reasons.push(`Customer has high failure rate: ${failureRate.toFixed(1)}%`);
      riskScore += 20;
    }

    // Device fingerprint checks
    if (settings.enable_device_fingerprinting && deviceInfo) {
      const deviceRisk = await this.analyzeDeviceRisk(deviceInfo);
      if (deviceRisk.isRisky) {
        fraudFlags.push('risky_device');
        reasons.push(deviceRisk.reason);
        riskScore += deviceRisk.riskIncrease;
      }
    }

    // Payment method risk
    const paymentMethodRisk = this.analyzePaymentMethodRisk(paymentDetails);
    if (paymentMethodRisk.isRisky) {
      fraudFlags.push('risky_payment_method');
      reasons.push(paymentMethodRisk.reason);
      riskScore += paymentMethodRisk.riskIncrease;
    }

    // Time-based analysis
    const timeRisk = this.analyzeTransactionTime();
    if (timeRisk.isRisky) {
      fraudFlags.push('unusual_time');
      reasons.push(timeRisk.reason);
      riskScore += timeRisk.riskIncrease;
    }

    // Cap risk score at 100
    riskScore = Math.min(riskScore, 100);

    // Determine risk level and recommendation
    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    let recommendation: 'approve' | 'review' | 'decline';

    if (riskScore <= settings.risk_thresholds.low) {
      riskLevel = 'low';
      recommendation = 'approve';
    } else if (riskScore <= settings.risk_thresholds.medium) {
      riskLevel = 'medium';
      recommendation = 'approve';
    } else if (riskScore <= settings.risk_thresholds.high) {
      riskLevel = 'high';
      recommendation = 'review';
    } else {
      riskLevel = 'critical';
      recommendation = 'decline';
    }

    return {
      riskScore,
      riskLevel,
      fraudFlags,
      recommendation,
      reasons,
    };
  }

  /**
   * Update customer risk score using proper DTOs
   */
  private async updateCustomerRiskScore(
    merchantId: number,
    customerId: string,
    riskScore: number,
    fraudFlags: string[]
  ): Promise<void> {
    try {
      const request: UpdateCustomerRiskScoreRequestDto = {
        customer_id: customerId,
        merchant_id: merchantId.toString(),
        risk_score: riskScore,
        fraud_flags: fraudFlags,
      };

      // Use proper DTO with type safety
      const response = await this.authenticatedGrpc.callGrpcMethod<UpdateCustomerRiskScoreResponseDto>(
        this.merchantService,
        'updateCustomerRiskScore',
        request,
        'MerchantService',
        {
          requestId: `risk_update_${Date.now()}`,
          sourceIp: '127.0.0.1',
        }
      );
      
      if (response.success) {
        this.logger.log(`Updated risk score for customer ${customerId}: ${riskScore}`);
      } else {
        this.logger.warn(`Risk score update failed for customer ${customerId}: ${response.message}`);
      }
      
    } catch (error) {
      this.logger.error(`Failed to update customer risk score: ${customerId}`, error);
    }
  }

  /**
   * Get customer transaction history from local database
   */
  private async getCustomerTransactionHistory(customerId: string): Promise<{
    total: number;
    successful: number;
    failed: number;
    totalAmount: number;
    averageAmount: number;
    lastTransactionDate?: Date;
  }> {
    try {
      // Query builder for complex customer filtering
      const queryBuilder = this.transactionRepo.createQueryBuilder('transaction')
        .where('transaction.customerDetails::jsonb @> :customerFilter', {
          customerFilter: JSON.stringify({ customerId })
        })
        .orderBy('transaction.createdAt', 'DESC')
        .take(100); // Last 100 transactions

      const transactions = await queryBuilder.getMany();

      const successful = transactions.filter(t => 
        t.status === 'success'
      ).length;
      
      const failed = transactions.filter(t => 
        t.status === 'failed' || t.status === 'cancelled'
      ).length;
      
      const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
      const averageAmount = transactions.length > 0 ? totalAmount / transactions.length : 0;

      this.logger.debug(`Customer ${customerId} history: ${transactions.length} transactions, ${successful} successful, ${failed} failed`);

      return {
        total: transactions.length,
        successful,
        failed,
        totalAmount,
        averageAmount,
        lastTransactionDate: transactions[0]?.createdAt,
      };

    } catch (error) {
      this.logger.error(`Failed to get transaction history: ${customerId}`, error);
      return {
        total: 0,
        successful: 0,
        failed: 0,
        totalAmount: 0,
        averageAmount: 0,
      };
    }
  }

  /**
   * Get recent transaction count for velocity checking
   */
  private async getRecentTransactionCount(customerId: string, hours: number): Promise<number> {
    try {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);
      
      // Use query builder for proper filtering
      const count = await this.transactionRepo.createQueryBuilder('transaction')
        .where('transaction.customerDetails::jsonb @> :customerFilter', {
          customerFilter: JSON.stringify({ customerId })
        })
        .andWhere('transaction.createdAt >= :since', { since })
        .getCount();

      this.logger.debug(`Customer ${customerId} recent transactions (${hours}h): ${count}`);
      return count;

    } catch (error) {
      this.logger.error(`Failed to get recent transaction count: ${customerId}`, error);
      return 0;
    }
  }

  /**
   * Analyze device risk factors
   */
  private async analyzeDeviceRisk(deviceInfo: any): Promise<{
    isRisky: boolean;
    reason: string;
    riskIncrease: number;
  }> {
    // Check for suspicious device characteristics
    if (deviceInfo.isEmulator || deviceInfo.isRooted) {
      return {
        isRisky: true,
        reason: 'Device appears to be emulated or rooted',
        riskIncrease: 30,
      };
    }

    if (deviceInfo.vpnDetected) {
      return {
        isRisky: true,
        reason: 'VPN or proxy detected',
        riskIncrease: 15,
      };
    }

    if (deviceInfo.isIncognito) {
      return {
        isRisky: true,
        reason: 'Incognito/private browsing detected',
        riskIncrease: 10,
      };
    }

    return {
      isRisky: false,
      reason: '',
      riskIncrease: 0,
    };
  }

  /**
   * Analyze payment method risk
   */
  private analyzePaymentMethodRisk(paymentDetails: any): {
    isRisky: boolean;
    reason: string;
    riskIncrease: number;
  } {
    // Check for risky payment methods
    if (paymentDetails.type === 'crypto') {
      return {
        isRisky: true,
        reason: 'Cryptocurrency payments have higher fraud risk',
        riskIncrease: 20,
      };
    }

    if (paymentDetails.type === 'prepaid_card') {
      return {
        isRisky: true,
        reason: 'Prepaid cards have higher fraud risk',
        riskIncrease: 15,
      };
    }

    return {
      isRisky: false,
      reason: '',
      riskIncrease: 0,
    };
  }

  /**
   * Analyze transaction timing for unusual patterns
   */
  private analyzeTransactionTime(): {
    isRisky: boolean;
    reason: string;
    riskIncrease: number;
  } {
    const hour = new Date().getHours();
    
    // Transactions between 2 AM and 6 AM are more suspicious
    if (hour >= 2 && hour <= 6) {
      return {
        isRisky: true,
        reason: 'Transaction during unusual hours (2-6 AM)',
        riskIncrease: 10,
      };
    }

    return {
      isRisky: false,
      reason: '',
      riskIncrease: 0,
    };
  }

  /**
   * Advanced fraud detection methods
   */

  /**
   * Analyze IP-based risk factors
   */
  async analyzeIPRisk(ipAddress: string, customerLocation?: string): Promise<{
    isRisky: boolean;
    reason: string;
    riskIncrease: number;
  }> {
    try {
      // Cache key for IP analysis
      const cacheKey = `ip_analysis:${ipAddress}`;
      const cached = await this.cacheService.get(cacheKey);
      
      if (cached) {
        return cached as any;
      }

      // Check IP reputation and geolocation
      const ipAnalysis = await this.performIPAnalysis(ipAddress);
      
      let risk = {
        isRisky: false,
        reason: '',
        riskIncrease: 0,
      };

      // High-risk IP detected
      if (ipAnalysis.isMalicious) {
        risk = {
          isRisky: true,
          reason: 'IP address flagged as malicious',
          riskIncrease: 50,
        };
      }
      // Proxy/VPN detected
      else if (ipAnalysis.isProxy || ipAnalysis.isVPN) {
        risk = {
          isRisky: true,
          reason: 'Proxy or VPN detected',
          riskIncrease: 25,
        };
      }
      // Geographic mismatch
      else if (customerLocation && ipAnalysis.country !== customerLocation) {
        risk = {
          isRisky: true,
          reason: `Geographic mismatch: IP from ${ipAnalysis.country}, customer from ${customerLocation}`,
          riskIncrease: 15,
        };
      }
      // High-risk country
      else if (ipAnalysis.isHighRiskCountry) {
        risk = {
          isRisky: true,
          reason: `Transaction from high-risk country: ${ipAnalysis.country}`,
          riskIncrease: 20,
        };
      }

      // Cache for 1 hour
      await this.cacheService.set(cacheKey, risk, 3600);
      
      return risk;

    } catch (error) {
      this.logger.error(`IP risk analysis failed for ${ipAddress}:`, error);
      return {
        isRisky: false,
        reason: '',
        riskIncrease: 0,
      };
    }
  }

  /**
   * Check customer against fraud blacklists
   */
  async checkFraudBlacklist(customerDetails: any): Promise<{
    isBlacklisted: boolean;
    reason: string;
    riskIncrease: number;
  }> {
    try {
      const checks = [];

      // Email blacklist check
      if (customerDetails.email) {
        const emailCheck = await this.checkEmailBlacklist(customerDetails.email);
        if (emailCheck.isBlacklisted) {
          return {
            isBlacklisted: true,
            reason: 'Customer email is blacklisted',
            riskIncrease: 100, // Instant decline
          };
        }
      }

      // Phone blacklist check
      if (customerDetails.phone) {
        const phoneCheck = await this.checkPhoneBlacklist(customerDetails.phone);
        if (phoneCheck.isBlacklisted) {
          return {
            isBlacklisted: true,
            reason: 'Customer phone is blacklisted',
            riskIncrease: 100, // Instant decline
          };
        }
      }

      // Device fingerprint check
      if (customerDetails.deviceFingerprint) {
        const deviceCheck = await this.checkDeviceBlacklist(customerDetails.deviceFingerprint);
        if (deviceCheck.isBlacklisted) {
          return {
            isBlacklisted: true,
            reason: 'Device is blacklisted',
            riskIncrease: 100, // Instant decline
          };
        }
      }

      return {
        isBlacklisted: false,
        reason: '',
        riskIncrease: 0,
      };

    } catch (error) {
      this.logger.error('Blacklist check failed:', error);
      return {
        isBlacklisted: false,
        reason: '',
        riskIncrease: 0,
      };
    }
  }

  /**
   * Analyze spending patterns for anomalies
   */
  async analyzeSpendingPattern(
    customer: CustomerProfile,
    amount: number,
    timeOfDay: number
  ): Promise<{
    isAnomalous: boolean;
    reason: string;
    riskIncrease: number;
  }> {
    try {
      // Weekend vs weekday pattern
      const dayOfWeek = new Date().getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      
      // Night time transactions (10 PM - 6 AM)
      const isNightTime = timeOfDay >= 22 || timeOfDay <= 6;
      
      // Check for unusual amount patterns
      if (customer.averageAmount > 0) {
        const amountRatio = amount / customer.averageAmount;
        
        // Amount is more than 10x normal
        if (amountRatio > 10) {
          return {
            isAnomalous: true,
            reason: `Amount is ${amountRatio.toFixed(1)}x higher than average`,
            riskIncrease: 30,
          };
        }
        
        // Amount is unusually small (possible testing)
        if (amountRatio < 0.1 && amount < 10) {
          return {
            isAnomalous: true,
            reason: 'Unusually small amount - possible card testing',
            riskIncrease: 15,
          };
        }
      }

      // Weekend + night time combination
      if (isWeekend && isNightTime) {
        return {
          isAnomalous: true,
          reason: 'Transaction during weekend night hours',
          riskIncrease: 12,
        };
      }

      return {
        isAnomalous: false,
        reason: '',
        riskIncrease: 0,
      };

    } catch (error) {
      this.logger.error('Spending pattern analysis failed:', error);
      return {
        isAnomalous: false,
        reason: '',
        riskIncrease: 0,
      };
    }
  }

  // Helper methods for advanced fraud detection

  private async performIPAnalysis(ipAddress: string): Promise<{
    isMalicious: boolean;
    isProxy: boolean;
    isVPN: boolean;
    country: string;
    isHighRiskCountry: boolean;
  }> {
    // Mock implementation - replace with actual IP analysis service
    const highRiskCountries = ['CN', 'RU', 'NG', 'PK', 'BD'];
    const mockCountry = 'IN'; // Default to India
    
    return {
      isMalicious: Math.random() < 0.01, // 1% chance
      isProxy: Math.random() < 0.05, // 5% chance  
      isVPN: Math.random() < 0.10, // 10% chance
      country: mockCountry,
      isHighRiskCountry: highRiskCountries.includes(mockCountry),
    };
  }

  private async checkEmailBlacklist(email: string): Promise<{ isBlacklisted: boolean }> {
    const cacheKey = `blacklist_email:${email}`;
    const cached = await this.cacheService.get(cacheKey);
    
    if (cached !== null) {
      return { isBlacklisted: cached as boolean };
    }

    // Check against known fraud email patterns
    const fraudPatterns = [
      /temp.*mail/i,
      /10.*min.*mail/i,
      /guerrilla.*mail/i,
      /mailinator/i,
    ];

    const isBlacklisted = fraudPatterns.some(pattern => pattern.test(email));
    
    // Cache for 24 hours
    await this.cacheService.set(cacheKey, isBlacklisted, 86400);
    
    return { isBlacklisted };
  }

  private async checkPhoneBlacklist(phone: string): Promise<{ isBlacklisted: boolean }> {
    // Implement phone blacklist checking
    // For now, return false
    return { isBlacklisted: false };
  }

  private async checkDeviceBlacklist(deviceFingerprint: string): Promise<{ isBlacklisted: boolean }> {
    const cacheKey = `blacklist_device:${deviceFingerprint}`;
    const cached = await this.cacheService.get(cacheKey);
    
    if (cached !== null) {
      return { isBlacklisted: cached as boolean };
    }

    // Check device fingerprint against known fraud devices
    // This would typically involve checking against a fraud database
    const isBlacklisted = false; // Implement actual logic
    
    // Cache for 24 hours
    await this.cacheService.set(cacheKey, isBlacklisted, 86400);
    
    return { isBlacklisted };
  }

  /**
   * Enhanced fraud analysis with all detection methods
   */
  async performEnhancedFraudAnalysis(
    merchantId: number,
    customerId: string,
    amount: number,
    currency: string,
    paymentDetails: any,
    deviceInfo?: any,
    customerDetails?: any,
    ipAddress?: string
  ): Promise<FraudAnalysisResult> {
    try {
      this.logger.log(`Enhanced fraud analysis for customer: ${customerId}, amount: ${amount}`);

      const startTime = Date.now();
      
      // Get customer profile and fraud settings
      const [customerProfile, fraudSettings] = await Promise.all([
        this.getCustomerProfile(merchantId.toString(), customerId),
        this.getMerchantFraudSettings(merchantId),
      ]);
      
      // Perform basic fraud analysis
      const basicAnalysis = await this.performFraudAnalysis(
        customerProfile,
        fraudSettings,
        amount,
        currency,
        paymentDetails,
        deviceInfo
      );

      let riskScore = basicAnalysis.riskScore;
      const fraudFlags = [...basicAnalysis.fraudFlags];
      const reasons = [...basicAnalysis.reasons];

      // Advanced fraud checks
      const advancedChecks = await Promise.all([
        this.checkFraudBlacklist(customerDetails),
        this.analyzeSpendingPattern(customerProfile, amount, new Date().getHours()),
        ipAddress ? this.analyzeIPRisk(ipAddress, customerDetails?.country) : Promise.resolve({ isRisky: false, reason: '', riskIncrease: 0 }),
      ]);

      // Process blacklist results
      const [blacklistCheck, spendingCheck, ipRiskCheck] = advancedChecks;
      
      if (blacklistCheck.isBlacklisted) {
        riskScore = 100; // Instant decline
        fraudFlags.push('blacklisted');
        reasons.push(blacklistCheck.reason);
      }

      if (spendingCheck.isAnomalous) {
        riskScore += spendingCheck.riskIncrease;
        fraudFlags.push('anomalous_spending');
        reasons.push(spendingCheck.reason);
      }

      if (ipRiskCheck.isRisky) {
        riskScore += ipRiskCheck.riskIncrease;
        fraudFlags.push('risky_ip');
        reasons.push(ipRiskCheck.reason);
      }

      // Cap risk score at 100
      riskScore = Math.min(riskScore, 100);

      // Determine final recommendation
      let riskLevel: 'low' | 'medium' | 'high' | 'critical';
      let recommendation: 'approve' | 'review' | 'decline';

      if (blacklistCheck.isBlacklisted || riskScore >= 90) {
        riskLevel = 'critical';
        recommendation = 'decline';
      } else if (riskScore >= fraudSettings.risk_thresholds.high) {
        riskLevel = 'high';
        recommendation = 'review';
      } else if (riskScore >= fraudSettings.risk_thresholds.medium) {
        riskLevel = 'medium';
        recommendation = 'approve';
      } else {
        riskLevel = 'low';
        recommendation = 'approve';
      }
      
      const responseTime = Date.now() - startTime;
      this.logger.log(`Enhanced fraud analysis completed: ${customerId} -> ${riskLevel} (${responseTime}ms)`);
      
      // Update customer risk score in both systems
      await this.updateCustomerRiskScore(merchantId, customerId, riskScore, fraudFlags);
      
      // Update the cached customer profile with new risk data
      const cacheKey = `customer_profile:${merchantId}:${customerId}`;
      await this.cacheService.delete(cacheKey); // Invalidate cache to force refresh
      
      return {
        riskScore,
        riskLevel,
        fraudFlags,
        recommendation,
        reasons,
      };

    } catch (error) {
      this.logger.error(`Enhanced fraud analysis failed for customer: ${customerId}`, error);
      
      return {
        riskScore: 75,
        riskLevel: 'high',
        fraudFlags: ['analysis_error'],
        recommendation: 'review',
        reasons: ['Enhanced fraud analysis system error'],
      };
    }
  }

  /**
   * Generate authentication metadata for gRPC calls to Merchant Service
   */
  private generateGrpcAuthMetadata(): any {
    const timestamp = new Date().toISOString();
    const requestId = `fraud_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const userId = 'payment-engine-fraud-service';
    const userType = 'system';
    const sourceIp = '127.0.0.1';

    const payload = [
      userId,
      userType,
      requestId,
      timestamp,
      sourceIp,
      'merchant-service',
    ].join('|');

    const signature = crypto
      .createHmac('sha256', this.sharedSecret)
      .update(payload)
      .digest('hex');

    return {
      'x-authenticated-user': userId,
      'x-user-type': userType,
      'x-request-id': requestId,
      'x-timestamp': timestamp,
      'x-source-ip': sourceIp,
      'x-service-name': 'merchant-service',
      'x-gateway-signature': signature,
      'x-calling-service': 'payment-engine',
    };
  }
}
