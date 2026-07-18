import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TSPConfiguration } from '@/entities/tsp-configuration.entity';
import {
  CreateTSPConfigurationResponse,
  GetTSPConfigurationsResponse,
  TSPConfigurationSummary
} from '@/types';
import { CreateTSPConfigurationDto } from '@/dto/tsp/tsp-request.dto';
import { TSPProvider } from '@/enums/tsp-provider.enum';

@Injectable()
export class TSPManagementService {
  private readonly logger = new Logger(TSPManagementService.name);

  constructor(
    @InjectRepository(TSPConfiguration)
    private readonly tspRepository: Repository<TSPConfiguration>
  ) {}

  async getAllConfigurations(requestId: string): Promise<GetTSPConfigurationsResponse> {
    try {
      this.logger.log(`Fetching all TSP configurations for request: ${requestId}`);

      const configurations = await this.tspRepository.find({
        order: {
          priority: 'DESC',
          createdAt: 'DESC'
        }
      });

      // Map entity to response format
      const mappedConfigurations: TSPConfigurationSummary[] = configurations.map(config => ({
        configurationId: `tsp_${config.id}`,
        id: config.id, // Include raw database ID for internal use
        providerName: config.providerName,
        environment: config.environment,
        isActive: config.isActive,
        priority: config.priority, // Include priority
        baseUrl: config.baseUrl,
        supportedPaymentMethods: config.supportedPaymentMethods || [],
        feeStructure: {
          percentage: config.processingFeePercentage,
          fixed: config.processingFeeFixed
        },
        healthCheckEndpoint: config.webhookUrl,
        createdAt: config.createdAt.toISOString(),
        updatedAt: config.updatedAt.toISOString(),
        additionalSettings: {
          supportedCurrencies: config.supportedCurrencies,
          credentials: config.credentials,
          configuration: config.configuration,
          metadata: {
            ...config.metadata,
            priority: config.priority,
            connectionTimeout: config.timeoutMs, // Store timeoutMs as connectionTimeout in metadata
            readTimeout: config.metadata?.readTimeout || 60000, // Default read timeout
            webhookUrl: config.webhookUrl,
          }
        }
      }));

      this.logger.log(`Found ${configurations.length} TSP configurations`);
      return mappedConfigurations as GetTSPConfigurationsResponse;
    } catch (error) {
      this.logger.error(`Failed to fetch TSP configurations: ${error.message}`, error.stack);
      throw error;
    }
  }

  async createConfiguration(data: CreateTSPConfigurationDto, requestId: string): Promise<CreateTSPConfigurationResponse> {
    try {
      this.logger.log(`Creating TSP configuration for ${data.providerName} in ${data.environment} environment`);
      
      // Check if configuration already exists
      const existingConfig = await this.tspRepository.findOne({
        where: {
          providerName: data.providerName as TSPProvider,
          environment: data.environment as any
        }
      });

      if (existingConfig) {
        throw new Error(`TSP configuration already exists for ${data.providerName} in ${data.environment} environment`);
      }

      // Create new TSP configuration entity
      const tspConfig = this.tspRepository.create({
        providerName: data.providerName as TSPProvider,
        displayName: data.providerName, // Use providerName as displayName since DTO doesn't have displayName
        environment: data.environment as any,
        isActive: data.isActive ?? true,
        priority: 100, // Default priority since DTO doesn't have priority
        credentials: data.credentials || {},
        configuration: data.apiConfig || {},
        supportedCurrencies: data.metadata?.supportedCurrencies || ['INR'],
        supportedPaymentMethods: data.supportedPaymentMethods || ['UPI', 'CARD', 'NETBANKING'],
        webhookUrl: data.metadata?.webhookUrl,
        baseUrl: data.baseUrl,
        processingFeePercentage: 0,
        processingFeeFixed: 0,
        supportsInstantPayouts: true,
        supportsRefunds: true,
        supportsRecurring: true,
        timeoutMs: (data.metadata?.connectionTimeout || 30) * 1000,
        maxRetries: 3,
        healthStatus: 'HEALTHY',
        lastHealthCheck: new Date(),
        metadata: data.metadata || {},
        createdBy: data.metadata?.createdBy || 'system',
        updatedBy: data.metadata?.createdBy || 'system'
      });

      // Save to database
      const savedConfig = await this.tspRepository.save(tspConfig);
      
      this.logger.log(`TSP configuration created successfully with ID: ${savedConfig.id}`);

      // Return response in expected format (matching CreateTSPConfigurationResponse interface)
      return {
        configurationId: `tsp_${savedConfig.id}`,
        providerName: savedConfig.providerName,
        environment: savedConfig.environment,
        isActive: savedConfig.isActive,
        baseUrl: savedConfig.baseUrl,
        supportedPaymentMethods: savedConfig.supportedPaymentMethods || [],
        feeStructure: {
          percentage: savedConfig.processingFeePercentage,
          fixed: savedConfig.processingFeeFixed
        },
        healthCheckEndpoint: savedConfig.webhookUrl,
        createdAt: savedConfig.createdAt.toISOString(),
        updatedAt: savedConfig.updatedAt.toISOString(),
        additionalSettings: {
          supportedCurrencies: savedConfig.supportedCurrencies,
          credentials: savedConfig.credentials,
          configuration: savedConfig.configuration,
          metadata: savedConfig.metadata
        }
      };
    } catch (error) {
      this.logger.error(`Failed to create TSP configuration: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateConfiguration(
    configId: number,
    displayName?: string,
    priority?: number,
    configuration?: Record<string, any>,
    supportedFeatures?: {
      instantPayouts?: boolean;
      refunds?: boolean;
      recurring?: boolean;
      webhooks?: boolean;
    },
    environment?: string,
    requestId?: string,
    performedBy?: string
  ): Promise<CreateTSPConfigurationResponse> {
    try {
      this.logger.log(`Updating TSP configuration ${configId} for request: ${requestId || 'unknown'}`);

      const config = await this.tspRepository.findOne({ where: { id: configId } });

      if (!config) {
        throw new Error(`TSP configuration with ID ${configId} not found`);
      }

      if (displayName !== undefined) {
        config.displayName = displayName;
      }

      if (priority !== undefined) {
        config.priority = priority;
      }

      if (environment !== undefined && environment !== null && environment !== '' && environment !== config.environment) {
        const validEnvironments = ['production', 'sandbox', 'development'];
        if (!validEnvironments.includes(environment)) {
          throw new Error(`Invalid environment value: ${environment}. Must be one of: ${validEnvironments.join(', ')}`);
        }

        this.logger.log(`Updating environment from ${config.environment} to ${environment} for config ${configId}`);

        if (environment && environment.trim() !== '') {
          const existingConfig = await this.tspRepository.findOne({
            where: {
              providerName: config.providerName,
              environment: environment as 'production' | 'sandbox' | 'development',
            },
          });

          if (existingConfig && existingConfig.id !== configId) {
            throw new Error(
              `TSP configuration already exists for provider: ${config.providerName} in environment: ${environment}`
            );
          }
        }

        config.environment = environment as 'production' | 'sandbox' | 'development';
      }

      if (configuration !== undefined) {
        config.configuration = { ...config.configuration, ...configuration };
        
        if (configuration.supported_currencies) {
          try {
            const currencies = typeof configuration.supported_currencies === 'string' 
              ? JSON.parse(configuration.supported_currencies)
              : configuration.supported_currencies;
            if (Array.isArray(currencies)) {
              config.supportedCurrencies = currencies;
            }
          } catch (e) {
            this.logger.warn(`Failed to parse supported_currencies: ${e.message}`);
          }
        }
        
        if (configuration.supported_payment_methods) {
          try {
            const methods = typeof configuration.supported_payment_methods === 'string'
              ? JSON.parse(configuration.supported_payment_methods)
              : configuration.supported_payment_methods;
            if (Array.isArray(methods)) {
              config.supportedPaymentMethods = methods;
            }
          } catch (e) {
            this.logger.warn(`Failed to parse supported_payment_methods: ${e.message}`);
          }
        }
        
        if (configuration.webhook_url !== undefined) {
          config.webhookUrl = configuration.webhook_url;
        }
        
        if (configuration.connection_timeout !== undefined) {
          const timeoutValue = typeof configuration.connection_timeout === 'string'
            ? parseInt(configuration.connection_timeout, 10)
            : configuration.connection_timeout;
          config.timeoutMs = timeoutValue < 1000 ? timeoutValue * 1000 : timeoutValue;
        }
        
        if (configuration.read_timeout !== undefined) {
          if (!config.metadata) {
            config.metadata = {};
          }
          const readTimeoutValue = typeof configuration.read_timeout === 'string'
            ? parseInt(configuration.read_timeout, 10)
            : configuration.read_timeout;
          config.metadata.readTimeout = readTimeoutValue;
        }
        
        if (configuration.credentials !== undefined) {
          try {
            const credentialsData = typeof configuration.credentials === 'string'
              ? JSON.parse(configuration.credentials)
              : configuration.credentials;
            
            if (credentialsData && typeof credentialsData === 'object') {
              config.credentials = {
                ...config.credentials,
                ...credentialsData,
              };
              this.logger.log(`Updated credentials for config ${configId}. Total credential keys: ${Object.keys(config.credentials).length}`);
            }
          } catch (e) {
            this.logger.warn(`Failed to parse credentials: ${e.message}`);
          }
        }
      }

      if (supportedFeatures !== undefined) {
        if (supportedFeatures.instantPayouts !== undefined) {
          config.supportsInstantPayouts = supportedFeatures.instantPayouts;
        }
        if (supportedFeatures.refunds !== undefined) {
          config.supportsRefunds = supportedFeatures.refunds;
        }
        if (supportedFeatures.recurring !== undefined) {
          config.supportsRecurring = supportedFeatures.recurring;
        }
        if (supportedFeatures.webhooks !== undefined) {
          if (!config.metadata) {
            config.metadata = {};
          }
          config.metadata.supportsWebhooks = supportedFeatures.webhooks;
        }
      }

      config.updatedBy = performedBy || 'system';
      const updatedConfig = await this.tspRepository.save(config);

      this.logger.log(`TSP configuration ${updatedConfig.id} updated successfully`);

      // Ensure metadata exists and includes displayName and priority
      const metadata = updatedConfig.metadata || {};
      metadata.displayName = updatedConfig.displayName;
      metadata.priority = updatedConfig.priority;
      metadata.connectionTimeout = updatedConfig.timeoutMs;
      metadata.readTimeout = metadata.readTimeout || 60000;

      return {
        configurationId: `tsp_${updatedConfig.id}`,
        providerName: updatedConfig.providerName,
        environment: updatedConfig.environment,
        isActive: updatedConfig.isActive,
        priority: updatedConfig.priority, // Include priority directly
        baseUrl: updatedConfig.baseUrl,
        supportedPaymentMethods: updatedConfig.supportedPaymentMethods || [],
        feeStructure: {
          percentage: updatedConfig.processingFeePercentage,
          fixed: updatedConfig.processingFeeFixed
        },
        healthCheckEndpoint: updatedConfig.webhookUrl,
        createdAt: updatedConfig.createdAt.toISOString(),
        updatedAt: updatedConfig.updatedAt.toISOString(),
        additionalSettings: {
          supportedCurrencies: updatedConfig.supportedCurrencies,
          credentials: updatedConfig.credentials,
          configuration: updatedConfig.configuration,
          metadata: metadata
        }
      };
    } catch (error) {
      this.logger.error(`Failed to update TSP configuration: ${error.message}`, error.stack);
      throw error;
    }
  }

  async activateConfiguration(
    configId?: number,
    providerName?: string,
    environment?: string,
    requestId?: string,
    performedBy?: string
  ): Promise<CreateTSPConfigurationResponse> {
    try {
      this.logger.log(`Activating TSP configuration for request: ${requestId || 'unknown'}`);

      let config: TSPConfiguration | null = null;

      if (configId) {
        config = await this.tspRepository.findOne({ where: { id: configId } });
      } else if (providerName && environment) {
        config = await this.tspRepository.findOne({
          where: {
            providerName: providerName as TSPProvider,
            environment: environment as any
          }
        });
      } else {
        throw new Error('Either config_id or (provider_name and environment) must be provided');
      }

      if (!config) {
        throw new Error(`TSP configuration not found`);
      }

      if (config.isActive) {
        this.logger.warn(`TSP configuration ${config.id} is already active`);
      }

      config.isActive = true;
      config.updatedBy = performedBy || 'system';
      const updatedConfig = await this.tspRepository.save(config);

      this.logger.log(`TSP configuration ${updatedConfig.id} activated successfully`);

      return {
        configurationId: `tsp_${updatedConfig.id}`,
        providerName: updatedConfig.providerName,
        environment: updatedConfig.environment,
        isActive: updatedConfig.isActive,
        baseUrl: updatedConfig.baseUrl,
        supportedPaymentMethods: updatedConfig.supportedPaymentMethods || [],
        feeStructure: {
          percentage: updatedConfig.processingFeePercentage,
          fixed: updatedConfig.processingFeeFixed
        },
        healthCheckEndpoint: updatedConfig.webhookUrl,
        createdAt: updatedConfig.createdAt.toISOString(),
        updatedAt: updatedConfig.updatedAt.toISOString(),
        additionalSettings: {
          supportedCurrencies: updatedConfig.supportedCurrencies,
          credentials: updatedConfig.credentials,
          configuration: updatedConfig.configuration,
          metadata: updatedConfig.metadata
        }
      };
    } catch (error) {
      this.logger.error(`Failed to activate TSP configuration: ${error.message}`, error.stack);
      throw error;
    }
  }

  async deactivateConfiguration(
    configId?: number,
    providerName?: string,
    environment?: string,
    requestId?: string,
    performedBy?: string
  ): Promise<CreateTSPConfigurationResponse> {
    try {
      this.logger.log(`Deactivating TSP configuration for request: ${requestId || 'unknown'}`);

      let config: TSPConfiguration | null = null;

      if (configId) {
        config = await this.tspRepository.findOne({ where: { id: configId } });
      } else if (providerName && environment) {
        config = await this.tspRepository.findOne({
          where: {
            providerName: providerName as TSPProvider,
            environment: environment as any
          }
        });
      } else {
        throw new Error('Either config_id or (provider_name and environment) must be provided');
      }

      if (!config) {
        throw new Error(`TSP configuration not found`);
      }

      if (!config.isActive) {
        this.logger.warn(`TSP configuration ${config.id} is already inactive`);
      }

      config.isActive = false;
      config.updatedBy = performedBy || 'system';
      const updatedConfig = await this.tspRepository.save(config);

      this.logger.log(`TSP configuration ${updatedConfig.id} deactivated successfully`);

      return {
        configurationId: `tsp_${updatedConfig.id}`,
        providerName: updatedConfig.providerName,
        environment: updatedConfig.environment,
        isActive: updatedConfig.isActive,
        baseUrl: updatedConfig.baseUrl,
        supportedPaymentMethods: updatedConfig.supportedPaymentMethods || [],
        feeStructure: {
          percentage: updatedConfig.processingFeePercentage,
          fixed: updatedConfig.processingFeeFixed
        },
        healthCheckEndpoint: updatedConfig.webhookUrl,
        createdAt: updatedConfig.createdAt.toISOString(),
        updatedAt: updatedConfig.updatedAt.toISOString(),
        additionalSettings: {
          supportedCurrencies: updatedConfig.supportedCurrencies,
          credentials: updatedConfig.credentials,
          configuration: updatedConfig.configuration,
          metadata: updatedConfig.metadata
        }
      };
    } catch (error) {
      this.logger.error(`Failed to deactivate TSP configuration: ${error.message}`, error.stack);
      throw error;
    }
  }
}
