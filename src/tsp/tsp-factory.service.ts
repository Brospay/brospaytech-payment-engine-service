import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TSPConfiguration } from '@/entities/tsp-configuration.entity';
import { TSPProvider } from '@/enums/tsp-provider.enum';
import { LoggerService } from '@/common/services/logger.service';

// TSP Adapters
import { RazorpayAdapter } from './adapters/razorpay.adapter';
import { PaytaraAdapter } from './adapters/paytara.adapter';
import { StripeAdapter } from './adapters/stripe.adapter';
import { KingdomBankAdapter } from './adapters/kingdom-bank.adapter';
import { SulifuPayAdapter } from './adapters/sulifu-pay.adapter';
import { PayazaAdapter } from './adapters/payaza.adapter';

// Types
import { TSPAdapter } from '@/types/tsp';

/**
 * TSP Factory Service - Creates and manages TSP adapter instances
 * This is the main service used by PaymentIntentService
 */
@Injectable()
export class TSPFactoryService {
  private adapters: Map<string, TSPAdapter> = new Map();

  constructor(
    @InjectRepository(TSPConfiguration)
    private readonly tspConfigRepo: Repository<TSPConfiguration>,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Get TSP adapter instance by provider name and environment
   */
  async getTSPAdapter(tspProvider: TSPProvider, environment: 'production' | 'sandbox' | 'development'): Promise<TSPAdapter | null> {
    const cacheKey = `${tspProvider}_${environment}`;
    
    // Check cache first for performance
    if (this.adapters.has(cacheKey)) {
      return this.adapters.get(cacheKey);
    }

    // Load TSP configuration from database
    const config = await this.tspConfigRepo.findOne({
      where: {
        providerName: tspProvider,
        environment,
        isActive: true,
      },
    });

    if (!config) {
      this.logger.warn(`TSP configuration not found: ${tspProvider} (${environment})`);
      return null;
    }

    // Create adapter instance based on provider
    const adapter = await this.createAdapter(config);
    if (adapter) {
      this.adapters.set(cacheKey, adapter);
      this.logger.log(`TSP adapter created and cached: ${tspProvider} (${environment})`);
    }

    return adapter;
  }

  /**
   * Get all active TSP adapters for an environment
   */
  async getActiveTSPAdapters(environment: 'production' | 'sandbox' | 'development'): Promise<TSPAdapter[]> {
    const configs = await this.tspConfigRepo.find({
      where: {
        environment,
        isActive: true,
      },
    });

    const adapters: TSPAdapter[] = [];
    
    for (const config of configs) {
      const adapter = await this.createAdapter(config);
      if (adapter) {
        adapters.push(adapter);
      }
    }

    this.logger.log(`Retrieved ${adapters.length} active TSP adapters for ${environment}`);
    return adapters;
  }

  /**
   * Get TSP adapter by routing decision
   */
  async getTSPAdapterForRouting(routingDecision: { selectedTSP: string }): Promise<TSPAdapter | null> {
    const environment = process.env.NODE_ENV === 'production' ? 'production' : 'sandbox';
    return this.getTSPAdapter(routingDecision.selectedTSP as TSPProvider, environment);
  }

  /**
   * Clear adapter cache - useful for configuration updates
   */
  clearCache(): void {
    this.adapters.clear();
    this.logger.log('TSP adapter cache cleared');
  }

  /**
   * Health check for all cached adapters
   */
  async healthCheck(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    
    for (const [key, adapter] of this.adapters) {
      try {
        const isHealthy = await adapter.healthCheck();
        results[key] = isHealthy;
        this.logger.debug(`Health check ${key}: ${isHealthy ? 'OK' : 'FAIL'}`);
      } catch (error) {
        this.logger.error(`Health check failed for ${key}:`, error);
        results[key] = false;
      }
    }

    return results;
  }

  /**
   * Get available TSP providers for environment
   */
  async getAvailableProviders(environment: 'production' | 'sandbox' | 'development'): Promise<string[]> {
    const configs = await this.tspConfigRepo.find({
      where: {
        environment,
        isActive: true,
      },
      select: ['providerName'],
    });

    return configs.map(config => config.providerName);
  }

  // Private helper methods

  /**
   * Create adapter instance based on TSP configuration
   */
  private async createAdapter(config: TSPConfiguration): Promise<TSPAdapter | null> {
    try {
      // Validate configuration before creating adapter
      if (!this.validateConfig(config)) {
        this.logger.error(`Invalid configuration for TSP: ${config.providerName}`);
        return null;
      }

      switch (config.providerName.toLowerCase()) {
        case 'razorpay':
          this.logger.debug(`Creating Razorpay adapter for ${config.environment}`);
          return new RazorpayAdapter(config, this.logger);
        
        case 'paytara':
          this.logger.debug(`Creating Paytara adapter for ${config.environment}`);
          return new PaytaraAdapter(config, this.logger);
        
        case 'stripe':
          this.logger.debug(`Creating Stripe adapter for ${config.environment}`);
          return new StripeAdapter(config, this.logger);
        
        case 'kingdom_bank':
          this.logger.debug(`Creating Kingdom Bank adapter for ${config.environment}`);
          return new KingdomBankAdapter(config, this.logger);
        
        case 'sulifu_pay':
          this.logger.debug(`Creating Sulifu Pay adapter for ${config.environment}`);
          return new SulifuPayAdapter(config, this.logger);
        
        case 'payaza':
          this.logger.debug(`Creating Payaza adapter for ${config.environment}`);
          return new PayazaAdapter(config, this.logger);
        
        default:
          this.logger.error(`Unknown TSP provider: ${config.providerName}`);
          return null;
      }
    } catch (error) {
      this.logger.error(`Failed to create TSP adapter: ${config.providerName}`, error);
      return null;
    }
  }

  /**
   * Validate TSP configuration
   */
  private validateConfig(config: TSPConfiguration): boolean {
    this.logger.debug(`Validating TSP config for ${config.providerName}`);
    this.logger.debug(`Credentials: ${JSON.stringify(config.credentials)}`);
    
    if (!config.credentials || Object.keys(config.credentials).length === 0) {
      this.logger.error(`No credentials found for TSP: ${config.providerName}`);
      return false;
    }

    // Provider-specific credential validation
    switch (config.providerName.toLowerCase()) {
      case 'razorpay':
        return !!(config.credentials['key_id'] && config.credentials['key_secret']);
      
      case 'paytara':
        return !!(config.credentials['merchant_id'] && config.credentials['secret_key']);
      
      case 'stripe':
        return !!(config.credentials['secret_key'] && config.credentials['publishable_key']);
      
      case 'kingdom_bank':
        const isValid = !!(
          config.credentials['api_key'] && 
          config.credentials['api_secret'] && 
          config.credentials['signature_key'] && 
          config.credentials['signature_key_id']
        );
        this.logger.debug(`Kingdom Bank validation result: ${isValid}`);
        this.logger.debug(`Checking: api_key=${!!config.credentials['api_key']}, api_secret=${!!config.credentials['api_secret']}, signature_key=${!!config.credentials['signature_key']}, signature_key_id=${!!config.credentials['signature_key_id']}`);
        return isValid;
      
      case 'sulifu_pay':
        const sulifuValid = !!(
          config.credentials['mer_no'] && 
          config.credentials['api_key'] && 
          config.credentials['api_url']
        );
        this.logger.debug(`Sulifu Pay validation result: ${sulifuValid}`);
        this.logger.debug(`Checking: mer_no=${!!config.credentials['mer_no']}, api_key=${!!config.credentials['api_key']}, api_url=${!!config.credentials['api_url']}`);
        return sulifuValid;
      
      case 'payaza':
        const payazaValid = !!(
          config.credentials['merchant_id'] && 
          config.credentials['api_key']
        );
        this.logger.debug(`Payaza validation result: ${payazaValid}`);
        this.logger.debug(`Checking: merchant_id=${!!config.credentials['merchant_id']}, api_key=${!!config.credentials['api_key']}`);
        return payazaValid;
      
      default:
        this.logger.error(`Unknown TSP provider: ${config.providerName}`);
        return false;
    }
  }
}
