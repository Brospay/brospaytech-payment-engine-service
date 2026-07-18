import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom, timeout, retry, catchError, throwError } from 'rxjs';
import { LoggerService } from '@/common/services/logger.service';
import { 
  MerchantServiceGrpc, 
  CustomerResolutionResult 
} from '@/types';
import {
  GetCustomerDetailsRequestDto,
  GetCustomerDetailsResponseDto,
  CreateCustomerRequestDto,
  ListCustomersRequestDto,
  ListCustomersResponseDto
} from '@/dto/merchant-service';

/**
 * Customer Resolution Service
 * Resolves customer information from Merchant Service for payment processing
 */
@Injectable()
export class CustomerResolutionService implements OnModuleInit {
  private merchantService: MerchantServiceGrpc;

  constructor(
    @Inject('MERCHANT_SERVICE')
    private readonly merchantGrpcClient: ClientGrpc,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit() {
    try {
      this.logger.log('Initializing CustomerResolutionService...');
      this.logger.debug('merchantGrpcClient:', typeof this.merchantGrpcClient);
      this.logger.debug('merchantGrpcClient keys:', Object.keys(this.merchantGrpcClient || {}).join(', '));
      
      if (!this.merchantGrpcClient) {
        this.logger.error('CRITICAL: merchantGrpcClient is null/undefined!');
        return;
      }
      
      this.merchantService = this.merchantGrpcClient.getService('MerchantService');
      
      this.logger.debug('merchantService after getService:', typeof this.merchantService);
      this.logger.debug('merchantService is null?', this.merchantService === null ? 'yes' : 'no');
      this.logger.debug('merchantService is undefined?', this.merchantService === undefined ? 'yes' : 'no');
      
      if (this.merchantService) {
        this.logger.debug('merchantService methods:', Object.keys(this.merchantService || {}).join(', '));
        
        // Test gRPC connection immediately - COMMENTED OUT
        // this.logger.log('Testing gRPC connection...');
        // setTimeout(() => this.testGrpcConnection(), 2000);
      } else {
        this.logger.error('CRITICAL: Failed to get MerchantService from gRPC client!');
      }
      
      this.logger.log('CustomerResolutionService initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize CustomerResolutionService:', error.message);
      this.logger.error('Initialization error stack:', error.stack);
    }
  }

  private async testGrpcConnection() {
    try {
      this.logger.log('🔧 Testing gRPC connection to MerchantService...');
      
      const testRequest = {
        merchant_id: 0,
        merchant_id_string: 'mer_db25ab2b28e6ebda'
      };
      
      this.logger.debug('Test request:', JSON.stringify(testRequest));
      
      const startTime = Date.now();
      
      const result = await lastValueFrom(
        this.merchantService.GetMerchant(testRequest).pipe(
          timeout(30000),
          retry({ count: 3, delay: 1000 }),
          catchError((error) => {
            this.logger.error('🔴 gRPC ERROR:', error.message);
            return throwError(() => new Error(`GetMerchant failed: ${error.message}`));
          })
        )
      );
      
      this.logger.log(`✅ gRPC connection test successful in ${Date.now() - startTime}ms!`);
      
    } catch (error) {
      this.logger.error('❌ gRPC connection test failed:', error.message);
      this.logger.error('❌ Error details:', error);
    }
  }

  /**
   * NOTE: Removed callGrpcWithRetry - Using RxJS Observable pattern with lastValueFrom() like admin service
   * NestJS gRPC clients return Observables, not callback-based promises
   */

  /**
   * Resolve customer information for payment processing
   * Supports both customerId lookup and inline customer creation
   */
  /**
   * Enhanced customer resolution with digital intelligence
   */
  async resolveCustomerWithIntelligence(
    merchantId: string,
    customerId?: string,
    customerDetails?: {
      email: string;
      phone?: string;
      firstName?: string;
      lastName?: string;
      country?: string;
    },
    digitalIntelligence?: {
      ipAddress?: string;
      userAgent?: string;
      deviceFingerprint?: string;
      geolocation?: {
        country: string;
        state?: string;
        city?: string;
        timezone?: string;
        coordinates?: { lat: number; lng: number };
      };
      browserData?: {
        language: string;
        platform: string;
        screenResolution: string;
        colorDepth: number;
        timezoneOffset: number;
      };
    },
    requestId?: string,
    createIfNotExists: boolean = false
  ): Promise<CustomerResolutionResult> {
    try {
      this.logger.log(`[${requestId}] Enhanced customer resolution with digital intelligence`);

      // First, try standard resolution
      const standardResolution = await this.resolveCustomer(
        merchantId,
        customerId,
        customerDetails,
        requestId,
        createIfNotExists
      );

      // If customer found or created, enhance with digital intelligence
      if (standardResolution.success && standardResolution.customer && digitalIntelligence) {
        const enhancedCustomer = await this.enhanceCustomerWithIntelligence(
          standardResolution.customer,
          digitalIntelligence,
          requestId
        );

        return {
          ...standardResolution,
          customer: enhancedCustomer
        };
      }

      return standardResolution;
    } catch (error) {
      this.logger.error(`[${requestId}] Enhanced customer resolution failed:`, error);
      throw error;
    }
  }

  /**
   * Standard customer resolution (existing method)
   */
  async resolveCustomer(
    merchantId: string,
    customerId?: string,
    customerDetails?: {
      email: string;
      phone?: string;
      firstName?: string;
      lastName?: string;
      country?: string;
    },
    requestId?: string,
    createIfNotExists: boolean = false
  ): Promise<CustomerResolutionResult> {
    try {
      this.logger.log(`[${requestId}] Resolving customer: customerId=${customerId}, hasDetails=${!!customerDetails}`);

      // Case 1: Customer ID provided - fetch existing customer
      if (customerId) {
        console.log('customerId checking here: ', customerId);
        return await this.fetchExistingCustomer(merchantId, customerId, requestId);
      }
      this.logger.debug(`[${requestId}] Customer details:`, JSON.stringify(customerDetails));

      // Case 2: Customer details provided - look up by email or create
      if (customerDetails?.email) {
        // ENABLED: gRPC customer lookup/creation with proper error handling
        try {
          console.log('customerDetails.email checking here: ', customerDetails.email);
          const existingCustomer = await this.lookupCustomerByEmail(
            merchantId, 
            customerDetails.email, 
            requestId
          );

          if (existingCustomer.success) {
            this.logger.log(`[${requestId}] Found existing customer by email: ${existingCustomer.customer?.customerId}`);
            return existingCustomer;
          }

          // Customer not found - create if allowed
          if (createIfNotExists) {
            this.logger.log(`[${requestId}] Customer not found, creating new customer...`);
            return await this.createCustomerFromDetails(merchantId, customerDetails, requestId);
          }

          // Customer not found and creation not allowed
          this.logger.warn(`[${requestId}] Customer not found and creation not allowed`);
          return {
            success: false,
            error: {
              code: 'CUSTOMER_NOT_FOUND',
              message: `Customer with email ${customerDetails.email} not found`
            }
          };

        } catch (grpcError) {
          // If gRPC call fails, handle gracefully based on error type
          this.logger.error(`[${requestId}] gRPC error during customer resolution:`, grpcError.message);
          
          // For timeout or connection errors, create a temporary customer to allow payment to proceed
          if (grpcError.message.includes('timeout') || grpcError.message.includes('UNAVAILABLE')) {
            this.logger.warn(`[${requestId}] gRPC timeout/unavailable - creating temporary customer`);
            
            return {
              success: true,
              customer: {
                customerId: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                merchantId: merchantId,
                email: customerDetails.email,
                phone: customerDetails.phone,
                name: `${customerDetails.firstName || ''} ${customerDetails.lastName || ''}`.trim() || 'Customer',
                createdAt: new Date(),
                totalTransactionAmount: 0,
                totalTransactionCount: 0,
                isNewCustomer: true
              }
            };
          }
          
          // For other errors, throw to be caught by outer catch block
          throw grpcError;
        }
      }

      return {
        success: false,
        error: {
          code: 'INSUFFICIENT_CUSTOMER_DATA',
          message: 'Either customerId or customerDetails with email must be provided'
        }
      };

    } catch (error) {
      this.logger.error(`[${requestId}] Customer resolution failed:`, error.stack);
      return {
        success: false,
        error: {
          code: 'CUSTOMER_RESOLUTION_ERROR',
          message: `Customer resolution failed: ${error.message}`
        }
      };
    }
  }

  /**
   * Fetch existing customer by ID
   */
  private async fetchExistingCustomer(
    merchantId: string, 
    customerId: string, 
    requestId?: string
  ): Promise<CustomerResolutionResult> {
    try {
      // Get merchant integer ID first
      const merchantLookupRequest = {
        merchant_id: 0, // Will be ignored, but required by proto
        merchant_id_string: merchantId
      };

      const merchantResult = await lastValueFrom(
        this.merchantService.GetMerchant(merchantLookupRequest).pipe(
          timeout(30000),
          retry({ count: 3, delay: 1000 }),
          catchError((error) => {
            this.logger.error(`[${requestId}] GetMerchant error:`, error.message);
            return throwError(() => new Error(`GetMerchant failed: ${error.message}`));
          })
        )
      );

      if (!merchantResult.success || !merchantResult.merchant) {
        this.logger.error(`[${requestId}] Merchant not found during customer fetch: ${merchantId}`);
        return {
          success: false,
          error: {
            code: 'MERCHANT_NOT_FOUND',
            message: `Merchant not found: ${merchantId}`
          }
        };
      }

      const merchantIntegerId = merchantResult.merchant.id;
      this.logger.debug(`[${requestId}] Using merchant integer ID: ${merchantIntegerId} for customer fetch`);

      const request: GetCustomerDetailsRequestDto = {
        customer_id: customerId,
        merchant_id: merchantId,
      };

      const customer = await lastValueFrom(
        this.merchantService.GetCustomer(request).pipe(
          timeout(30000),
          retry({ count: 3, delay: 1000 }),
          catchError((error) => {
            this.logger.error(`[${requestId}] GetCustomer error:`, error.message);
            return throwError(() => new Error(`GetCustomer failed: ${error.message}`));
          })
        )
      );

      if (!customer.success || !customer.customer) {
        return {
          success: false,
          error: {
            code: 'CUSTOMER_NOT_FOUND',
            message: `Customer ${customerId} not found for merchant ${merchantId}`
          }
        };
      }

      const customerData = customer.customer;
      return {
        success: true,
        customerId: customerData.customer_id,
        customer: {
          customerId: customerData.customer_id,
          email: customerData.email,
          phone: customerData.phone,
          name: customerData.first_name,
          merchantId: merchantId,
          createdAt: new Date(customerData.created_at || new Date()),
          totalTransactionAmount: customerData.total_transaction_amount || 0,
          totalTransactionCount: customerData.total_transaction_count || 0,
          riskProfile: customerData.risk_profile ? {
            riskLevel: (customerData.risk_profile.risk_level || 'low') as 'low' | 'medium' | 'high' | 'critical',
            riskScore: customerData.risk_profile.risk_score || 0,
            isBlacklisted: customerData.risk_profile.is_blacklisted || false,
            lastRiskCheck: customerData.risk_profile.last_risk_check ? 
              new Date(customerData.risk_profile.last_risk_check) : undefined,
            riskFactors: customerData.risk_profile.risk_factors || []
          } : {
            riskLevel: 'low' as const,
            riskScore: 0,
            isBlacklisted: false,
            lastRiskCheck: new Date(),
            riskFactors: []
          },
          isNewCustomer: false,
          lastTransactionAt: customerData.last_transaction_at ? 
            new Date(customerData.last_transaction_at) : undefined,
        }
      };

    } catch (error) {
      this.logger.error(`[${requestId}] Failed to fetch customer ${customerId}:`, error);
      return {
        success: false,
        error: {
          code: 'CUSTOMER_FETCH_ERROR',
          message: `Failed to fetch customer: ${error.message}`
        }
      };
    }
  }

  /**
   * Quick lookup customer by email only (for payment intent creation)
   */
  async lookupCustomerByEmailOnly(
    merchantId: string,
    email: string,
    requestId?: string
  ): Promise<CustomerResolutionResult> {
    try {
      this.logger.log(`[${requestId}] Quick customer lookup for email: ${email}`);

      const request: ListCustomersRequestDto = {
        merchant_id: merchantId,
        page: 1,
        limit: 1,
        search_term: email,
        environment: process.env.NODE_ENV || 'development',
      };

      const searchResult = await lastValueFrom(
        this.merchantService.ListCustomers(request).pipe(
          timeout(30000),
          retry({ count: 3, delay: 1000 }),
          catchError((error) => {
            this.logger.error(`[${requestId}] ListCustomers error:`, error.message);
            return throwError(() => new Error(`ListCustomers failed: ${error.message}`));
          })
        )
      );

      if (searchResult.success && searchResult.customers && searchResult.customers.length > 0) {
        const customerData = searchResult.customers[0];
        
        return {
          success: true,
          customer: {
            customerId: customerData.customer_id,
            email: customerData.email,
            phone: customerData.phone,
            name: `${customerData.first_name || ''} ${customerData.last_name || ''}`.trim(),
            merchantId: merchantId,
            createdAt: new Date(customerData.created_at),
            totalTransactionAmount: customerData.total_transaction_amount || 0,
            totalTransactionCount: customerData.total_transaction_count || 0,
            riskProfile: customerData.risk_profile ? {
              riskLevel: (customerData.risk_profile.risk_level as 'low' | 'medium' | 'high' | 'critical') || 'low',
              riskScore: customerData.risk_profile.risk_score || 0,
              isBlacklisted: customerData.risk_profile.is_blacklisted || false,
              lastRiskCheck: customerData.risk_profile.last_risk_check ? 
                new Date(customerData.risk_profile.last_risk_check) : undefined,
              riskFactors: customerData.risk_profile.risk_factors || []
            } : {
              riskLevel: 'low' as const,
              riskScore: 0,
              isBlacklisted: false,
              lastRiskCheck: new Date(),
              riskFactors: []
            },
            isNewCustomer: false,
            lastTransactionAt: customerData.last_transaction_at ? 
              new Date(customerData.last_transaction_at) : undefined,
          }
        };
      }

      return {
        success: false,
        error: {
          code: 'CUSTOMER_NOT_FOUND',
          message: `No customer found with email: ${email}`
        }
      };

    } catch (error) {
      this.logger.error(`[${requestId}] Quick customer lookup failed for ${email}:`, error);
      return {
        success: false,
        error: {
          code: 'CUSTOMER_LOOKUP_ERROR',
          message: `Customer lookup failed: ${error.message}`
        }
      };
    }
  }

  /**
   * Look up customer by email
   */
  private async lookupCustomerByEmail(
    merchantId: string, 
    email: string, 
    requestId?: string
  ): Promise<CustomerResolutionResult> {
    try {
      // Get merchant integer ID first
      const merchantLookupRequest = {
        merchant_id: 0, 
        merchant_id_string: merchantId
      };

      this.logger.debug(`[${requestId}] Looking up merchant: ${merchantId}`);
      this.logger.debug(`[${requestId}] gRPC request:`, JSON.stringify(merchantLookupRequest));
      
      let merchantResult: any;
      try {
        this.logger.debug(`[${requestId}] merchantService client:`, typeof this.merchantService);
        this.logger.debug(`[${requestId}] merchantService methods:`, Object.keys(this.merchantService || {}).join(', '));
        
        merchantResult = await lastValueFrom(
          this.merchantService.GetMerchant(merchantLookupRequest).pipe(
            timeout(30000),
            retry({ count: 3, delay: 1000 }),
            catchError((error) => {
              this.logger.error(`[${requestId}] GetMerchant error:`, error.message);
              return throwError(() => new Error(`GetMerchant failed: ${error.message}`));
            })
          )
        );
        
        this.logger.debug(`[${requestId}] gRPC call completed successfully`);
      } catch (grpcError) {
        this.logger.error(`[${requestId}] gRPC call failed with exception:`, grpcError.message);
        this.logger.error(`[${requestId}] gRPC error stack:`, grpcError.stack);
        this.logger.error(`[${requestId}] gRPC error details:`, grpcError);
        merchantResult = { error: grpcError.message };
      }

      this.logger.debug(`[${requestId}] gRPC GetMerchant response:`, JSON.stringify(merchantResult));

      if (!merchantResult.success || !merchantResult.merchant) {
        this.logger.error(`[${requestId}] Merchant lookup failed`);
        this.logger.error(`[${requestId}] merchantResult.success: ${merchantResult.success}`);
        this.logger.error(`[${requestId}] merchantResult.merchant: ${JSON.stringify(merchantResult.merchant)}`);
        this.logger.error(`[${requestId}] Full merchantResult:`, JSON.stringify(merchantResult));
        return {
          success: false,
          error: {
            code: 'MERCHANT_NOT_FOUND',
            message: `Merchant not found: ${merchantId}`
          }
        };
      }

      const merchantIntegerId = merchantResult.merchant.id;
      this.logger.debug(`[${requestId}] Using merchant integer ID: ${merchantIntegerId} for customer lookup`);

      const request: ListCustomersRequestDto = {
        merchant_id: merchantId,
        page: 1,
        limit: 1,
        search_term: email,
        environment: process.env.NODE_ENV || 'development',
      };

      const searchResult = await lastValueFrom(
        this.merchantService.ListCustomers(request).pipe(
          timeout(30000),
          retry({ count: 3, delay: 1000 }),
          catchError((error) => {
            this.logger.error(`[${requestId}] ListCustomers error:`, error.message);
            return throwError(() => new Error(`ListCustomers failed: ${error.message}`));
          })
        )
      );

      if (!searchResult.success || !searchResult.customers || searchResult.customers.length === 0) {
        return {
          success: false,
          error: {
            code: 'CUSTOMER_NOT_FOUND_BY_EMAIL',
            message: `No customer found with email ${email}`
          }
        };
      }

      const customerData = searchResult.customers[0];
      return {
        success: true,
        customerId: customerData.customer_id,
        customer: {
          customerId: customerData.customer_id,
          email: customerData.email,
          phone: customerData.phone,
          name: customerData.first_name,
          merchantId: merchantId,
          createdAt: new Date(customerData.created_at || new Date()),
          totalTransactionAmount: customerData.total_transaction_amount || 0,
          totalTransactionCount: customerData.total_transaction_count || 0,
          riskProfile: customerData.risk_profile ? {
            riskLevel: this.mapRiskLevel(customerData.risk_profile.risk_level) || 'medium',
            riskScore: customerData.risk_profile.risk_score || 30,
            isBlacklisted: customerData.risk_profile.is_blacklisted || false,
            lastRiskCheck: customerData.risk_profile.last_risk_check ? 
              new Date(customerData.risk_profile.last_risk_check) : new Date(),
            riskFactors: customerData.risk_profile.risk_factors || []
          } : {
            riskLevel: 'medium' as const,
            riskScore: 30,
            isBlacklisted: false,
            lastRiskCheck: new Date(),
            riskFactors: []
          },
          isNewCustomer: false,
          lastTransactionAt: customerData.last_transaction_at ? 
            new Date(customerData.last_transaction_at) : undefined,
        }
      };

    } catch (error) {
      this.logger.error(`[${requestId}] Failed to lookup customer by email ${email}:`, error);
      return {
        success: false,
        error: {
          code: 'CUSTOMER_LOOKUP_ERROR',
          message: `Failed to lookup customer by email: ${error.message}`
        }
      };
    }
  }

  /**
   * Create new customer from details
   */
  private async createCustomerFromDetails(
    merchantId: string,
    customerDetails: {
      email: string;
      phone?: string;
      firstName?: string;
      lastName?: string;
      country?: string;
    },
    requestId?: string
  ): Promise<CustomerResolutionResult> {
    try {
      this.logger.log(`[${requestId}] Creating new customer for email: ${customerDetails.email}`);

      // First, get the merchant's integer ID from the string merchantId
      const merchantLookupRequest = {
        merchant_id: 0, // Will be ignored, but required by proto
        merchant_id_string: merchantId
      };

      this.logger.debug(`[${requestId}] CreateCustomer - Looking up merchant: ${merchantId}`);
      this.logger.debug(`[${requestId}] CreateCustomer - gRPC request:`, JSON.stringify(merchantLookupRequest));

      let merchantResult: any;
      
      
      try {
        this.logger.debug(`[${requestId}] CreateCustomer - merchantService client:`, typeof this.merchantService);
        this.logger.debug(`[${requestId}] CreateCustomer - merchantService methods:`, Object.keys(this.merchantService || {}).join(', '));
        
        // Use Observable pattern with proper timeout (admin service style)
        merchantResult = await lastValueFrom(
          this.merchantService.GetMerchant(merchantLookupRequest).pipe(
            timeout(30000),
            retry({ count: 3, delay: 1000 }),
            catchError((error) => {
              this.logger.error(`[${requestId}] GetMerchant error:`, error.message);
              return throwError(() => new Error(`GetMerchant failed: ${error.message}`));
            })
          )
        );
        
        this.logger.debug(`[${requestId}] CreateCustomer - gRPC call completed successfully`);
      } catch (grpcError) {
        this.logger.error(`[${requestId}] CreateCustomer - gRPC call failed with exception:`, grpcError.message);
        this.logger.error(`[${requestId}] CreateCustomer - gRPC error stack:`, grpcError.stack);
        this.logger.error(`[${requestId}] CreateCustomer - gRPC error details:`, grpcError);
        merchantResult = { error: grpcError.message };
      }
      this.logger.debug(`[${requestId}] CreateCustomer - merchantResult:`, JSON.stringify(merchantResult));

      this.logger.debug(`[${requestId}] CreateCustomer - gRPC GetMerchant response:`, JSON.stringify(merchantResult));

      if (!merchantResult.success || !merchantResult.merchant) {
        this.logger.error(`[${requestId}] CreateCustomer - Merchant lookup failed`);
        this.logger.error(`[${requestId}] CreateCustomer - merchantResult.success: ${merchantResult.success}`);
        this.logger.error(`[${requestId}] CreateCustomer - merchantResult.merchant: ${JSON.stringify(merchantResult.merchant)}`);
        this.logger.error(`[${requestId}] CreateCustomer - Full merchantResult:`, JSON.stringify(merchantResult));
        throw new Error(`Merchant not found: ${merchantId}`);
      }

      const merchantIntegerId = merchantResult.merchant.id;
      this.logger.debug(`[${requestId}] Found merchant integer ID: ${merchantIntegerId} for merchantId: ${merchantId}`);

      const request: CreateCustomerRequestDto = {
        email: customerDetails.email,
        phone: customerDetails.phone || '',
        first_name: customerDetails.firstName || '',
        last_name: customerDetails.lastName || '',
        country: customerDetails.country || 'US',
        ip_address: '127.0.0.1', // Default for payment-created customers
        device_fingerprint: 'payment_engine_created',
        merchant_id: merchantId, 
        metadata: {
          'createdVia': 'payment_engine',
          'createdAt': new Date().toISOString(),
        },
      };

      const newCustomer = await lastValueFrom(
        this.merchantService.CreateCustomer(request).pipe(
          timeout(30000),
          retry({ count: 3, delay: 1000 }),
          catchError((error) => {
            this.logger.error(`[${requestId}] CreateCustomer error:`, error.message);
            return throwError(() => new Error(`CreateCustomer failed: ${error.message}`));
          })
        )
      );

      if (!newCustomer.success || !newCustomer.customer) {
        return {
          success: false,
          error: {
            code: 'CUSTOMER_CREATION_ERROR',
            message: `Failed to create customer: ${newCustomer.message || 'Unknown error'}`
          }
        };
      }

      const customerData = newCustomer.customer;
      this.logger.log(`[${requestId}] Created new customer: ${customerData.customer_id}`);

      return {
        success: true,
        customerId: customerData.customer_id,
        customer: {
          customerId: customerData.customer_id,
          email: customerData.email,
          phone: customerData.phone,
          name: customerData.first_name,
          merchantId: merchantId,
          createdAt: new Date(customerData.created_at || new Date()),
          totalTransactionAmount: 0,
          totalTransactionCount: 0,
          riskProfile: customerData.risk_profile ? {
            riskLevel: this.mapRiskLevel(customerData.risk_profile.risk_level) || 'low',
            riskScore: customerData.risk_profile.risk_score || 10,
            isBlacklisted: customerData.risk_profile.is_blacklisted || false,
            lastRiskCheck: new Date(),
            riskFactors: customerData.risk_profile.risk_factors || []
          } : {
            riskLevel: 'low' as const, // New customers start with low risk
            riskScore: 10,    // Default low score for new customers
            isBlacklisted: false,
            lastRiskCheck: new Date(),
            riskFactors: []
          },
          isNewCustomer: true, // This is definitely a new customer
          lastTransactionAt: undefined, // No transactions yet
        }
      };

    } catch (error) {
      this.logger.error(`[${requestId}] Failed to create customer:`, error);
      return {
        success: false,
        error: {
          code: 'CUSTOMER_CREATION_FAILED',
          message: `Customer creation failed: ${error.message}`
        }
      };
    }
  }

  /**
   * Map risk level string from merchant service to proper union type
   */
  private mapRiskLevel(riskLevel?: string): 'low' | 'medium' | 'high' | 'critical' {
    switch (riskLevel?.toLowerCase()) {
      case 'low':
        return 'low';
      case 'medium':
        return 'medium';
      case 'high':
        return 'high';
      case 'critical':
        return 'critical';
      default:
        return 'medium'; 
    }
  }

  /**
   * Enhance customer with digital intelligence data
   */
  private async enhanceCustomerWithIntelligence(
    customer: any,
    digitalIntelligence: {
      ipAddress?: string;
      userAgent?: string;
      deviceFingerprint?: string;
      geolocation?: {
        country: string;
        state?: string;
        city?: string;
        timezone?: string;
        coordinates?: { lat: number; lng: number };
      };
      browserData?: {
        language: string;
        platform: string;
        screenResolution: string;
        colorDepth: number;
        timezoneOffset: number;
      };
    },
    requestId?: string
  ): Promise<any> {
    try {
      this.logger.log(`[${requestId}] Enhancing customer ${customer.customerId} with digital intelligence`);

      // Extract location intelligence
      const locationIntelligence = this.extractLocationIntelligence(digitalIntelligence);
      
      // Extract device intelligence  
      const deviceIntelligence = this.extractDeviceIntelligence(digitalIntelligence);

      // Calculate risk score based on digital footprint
      const digitalRiskScore = this.calculateDigitalRiskScore(digitalIntelligence, customer);

      // Update customer's risk profile with digital intelligence
      const enhancedRiskProfile = {
        ...customer.riskProfile,
        digitalFootprint: {
          ipAddress: digitalIntelligence.ipAddress,
          userAgent: digitalIntelligence.userAgent,
          deviceFingerprint: digitalIntelligence.deviceFingerprint,
          location: locationIntelligence,
          device: deviceIntelligence,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
        },
        riskScore: Math.max(customer.riskProfile.riskScore, digitalRiskScore),
        riskFactors: [
          ...customer.riskProfile.riskFactors,
          ...this.generateDigitalRiskFactors(digitalIntelligence)
        ]
      };

      return {
        ...customer,
        riskProfile: enhancedRiskProfile,
        digitalIntelligence: {
          location: locationIntelligence,
          device: deviceIntelligence,
          timestamp: new Date(),
        }
      };

    } catch (error) {
      this.logger.error(`[${requestId}] Failed to enhance customer with intelligence:`, error);
      // Return original customer if enhancement fails
      return customer;
    }
  }

  /**
   * Extract location intelligence from digital data
   */
  private extractLocationIntelligence(digitalIntelligence: any) {
    return {
      country: digitalIntelligence.geolocation?.country || 'Unknown',
      state: digitalIntelligence.geolocation?.state,
      city: digitalIntelligence.geolocation?.city,
      timezone: digitalIntelligence.geolocation?.timezone || digitalIntelligence.browserData?.timezoneOffset,
      coordinates: digitalIntelligence.geolocation?.coordinates,
      ipAddress: digitalIntelligence.ipAddress,
      // Can be enhanced with IP geolocation service
    };
  }

  /**
   * Extract device intelligence from digital data
   */
  private extractDeviceIntelligence(digitalIntelligence: any) {
    const userAgent = digitalIntelligence.userAgent || '';
    
    return {
      fingerprint: digitalIntelligence.deviceFingerprint,
      userAgent: userAgent,
      platform: digitalIntelligence.browserData?.platform || this.extractPlatformFromUserAgent(userAgent),
      language: digitalIntelligence.browserData?.language || 'Unknown',
      screenResolution: digitalIntelligence.browserData?.screenResolution,
      colorDepth: digitalIntelligence.browserData?.colorDepth,
      isMobile: this.isMobileDevice(userAgent),
      browser: this.extractBrowserFromUserAgent(userAgent),
      os: this.extractOSFromUserAgent(userAgent),
    };
  }

  /**
   * Calculate digital risk score based on various factors
   */
  private calculateDigitalRiskScore(digitalIntelligence: any, customer: any): number {
    let riskScore = 0;

    // VPN/Proxy detection (would need external service)
    if (this.isVPNOrProxy(digitalIntelligence.ipAddress)) {
      riskScore += 20;
    }

    // Suspicious user agent
    if (this.isSuspiciousUserAgent(digitalIntelligence.userAgent)) {
      riskScore += 15;
    }

    // Multiple device fingerprints for same customer
    if (customer.totalTransactionCount > 0 && digitalIntelligence.deviceFingerprint) {
      // This would require checking against previous device fingerprints
      // For now, just a placeholder
      riskScore += 0;
    }

    // Location anomalies (rapid location changes)
    if (this.hasLocationAnomalies(digitalIntelligence.geolocation, customer)) {
      riskScore += 25;
    }

    return Math.min(riskScore, 100); // Cap at 100
  }

  /**
   * Generate risk factors based on digital intelligence
   */
  private generateDigitalRiskFactors(digitalIntelligence: any): string[] {
    const riskFactors: string[] = [];

    if (this.isVPNOrProxy(digitalIntelligence.ipAddress)) {
      riskFactors.push('VPN_OR_PROXY_DETECTED');
    }

    if (this.isSuspiciousUserAgent(digitalIntelligence.userAgent)) {
      riskFactors.push('SUSPICIOUS_USER_AGENT');
    }

    if (!digitalIntelligence.geolocation?.country) {
      riskFactors.push('LOCATION_UNAVAILABLE');
    }

    return riskFactors;
  }

  // Helper methods for device/location analysis
  private extractPlatformFromUserAgent(userAgent: string): string {
    if (/Windows/i.test(userAgent)) return 'Windows';
    if (/Mac/i.test(userAgent)) return 'macOS';
    if (/Linux/i.test(userAgent)) return 'Linux';
    if (/Android/i.test(userAgent)) return 'Android';
    if (/iOS/i.test(userAgent)) return 'iOS';
    return 'Unknown';
  }

  private extractBrowserFromUserAgent(userAgent: string): string {
    if (/Chrome/i.test(userAgent)) return 'Chrome';
    if (/Firefox/i.test(userAgent)) return 'Firefox';
    if (/Safari/i.test(userAgent)) return 'Safari';
    if (/Edge/i.test(userAgent)) return 'Edge';
    return 'Unknown';
  }

  private extractOSFromUserAgent(userAgent: string): string {
    return this.extractPlatformFromUserAgent(userAgent);
  }

  private isMobileDevice(userAgent: string): boolean {
    return /Mobile|Android|iPhone|iPad/i.test(userAgent);
  }

  private isVPNOrProxy(ipAddress?: string): boolean {
    // Placeholder - would integrate with VPN detection service
    return false;
  }

  private isSuspiciousUserAgent(userAgent?: string): boolean {
    if (!userAgent) return true;
    
    // Check for bot-like patterns
    if (/bot|crawler|spider|scraper/i.test(userAgent)) return true;
    
    // Check for outdated browsers (potential security risk)
    if (/MSIE [1-8]\./i.test(userAgent)) return true;
    
    return false;
  }

  private hasLocationAnomalies(geolocation: any, customer: any): boolean {
    // Placeholder - would check against customer's previous locations
    // and detect rapid geographical changes
    return false;
  }
}
