import { Controller, Get, Post, Body, Headers, Query, Param } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { ApiTags, ApiSecurity, ApiQuery, ApiParam } from '@nestjs/swagger';
import { TSPManagementService } from './tsp-management.service';
import { InternalApiEndpoint } from '@/common/decorators/api.decorators';
import { ResponseHelper } from '@/common/helpers/response.helper';
import { CreateTSPConfigurationDto } from '@/dto/tsp/tsp-request.dto';
import {
  GetTSPConfigurationsResponseDto,
  CreateTSPConfigurationResponseDto
} from '@/dto/tsp/tsp-response.dto';

@Controller('tsp-configurations')
@ApiTags('tsp-management')
@ApiSecurity('API-Key')
export class TSPManagementController {
  constructor(private readonly tspManagementService: TSPManagementService) {}

  @Get()
  @InternalApiEndpoint(
    'Get TSP Configurations',
    'Retrieves all configured payment service providers with their settings and health status',
    GetTSPConfigurationsResponseDto
  )
  async getTSPConfigurations(
    @Headers('x-request-id') requestId: string
  ): Promise<GetTSPConfigurationsResponseDto> {
    ResponseHelper.validateRequiredParams({ requestId });

    return ResponseHelper.executeServiceCall(
      () => this.tspManagementService.getAllConfigurations(requestId),
      requestId,
      'GET /tsp-configurations',
      'TSP configurations retrieved successfully',
      'TSP_CONFIGURATIONS_RETRIEVAL_FAILED',
      'Failed to retrieve TSP configurations'
    );
  }

  @Post()
  @InternalApiEndpoint(
    'Create TSP Configuration',
    'Creates a new payment service provider configuration with credentials and settings',
    CreateTSPConfigurationResponseDto
  )
  async createTSPConfiguration(
    @Body() createDto: CreateTSPConfigurationDto,
    @Headers('x-request-id') requestId: string
  ): Promise<CreateTSPConfigurationResponseDto> {
    ResponseHelper.validateRequiredParams({ requestId });

    return ResponseHelper.executeServiceCall(
      () => this.tspManagementService.createConfiguration(createDto, requestId),
      requestId,
      'POST /tsp-configurations',
      'TSP configuration created successfully',
      'TSP_CONFIGURATION_CREATION_FAILED',
      'Failed to create TSP configuration'
    );
  }


  @GrpcMethod('PaymentEngineService', 'CreateTSPConfiguration')
  async createTSPConfigurationGrpc(data: any) {
    try {
      
      if (!data) {
        throw new Error('No data received in gRPC call');
      }
      
      const providerName = data.provider_name || data.providerName;
      const displayName = data.display_name || data.displayName;
      const environment = data.environment;
      const isActive = data.is_active !== undefined ? data.is_active : data.isActive;
      const priority = data.priority;
      const credentials = data.credentials;
      const configuration = data.configuration;
      const supportedCurrencies = data.supported_currencies || data.supportedCurrencies;
      const supportedPaymentMethods = data.supported_payment_methods || data.supportedPaymentMethods;
      const webhookUrl = data.webhook_url || data.webhookUrl;
      const connectionTimeout = data.connection_timeout || data.connectionTimeout;
      const readTimeout = data.read_timeout || data.readTimeout;
      const createdBy = data.created_by || data.createdBy;
      const requestId = data.request_id || data.requestId;
      
      if (!providerName) {
        throw new Error(`Missing provider_name/providerName. Received keys: ${Object.keys(data || {}).join(', ')}`);
      }

      const createDto: CreateTSPConfigurationDto = {
        providerName: providerName,
        environment: environment,
        isActive: isActive ?? true,
        credentials: credentials || {},
        supportedPaymentMethods: supportedPaymentMethods || ['UPI', 'CARD', 'NETBANKING'],
        feeStructure: {},
        apiConfig: configuration || {},
        metadata: {
          supportedCurrencies: supportedCurrencies,
          webhookUrl: webhookUrl,
          connectionTimeout: connectionTimeout,
          readTimeout: readTimeout,
          createdBy: createdBy,
        }
      };

      
      let result;
      try {
        result = await this.tspManagementService.createConfiguration(createDto, requestId || 'grpc-request');
      } catch (serviceError) {
        console.error('[Payment Engine gRPC] Service call failed:', serviceError.message, serviceError.stack);
        throw new Error(`TSP service failed: ${serviceError.message}`);
      }
      
      // Return response in proto TSPConfigResponse format using SERVICE RESPONSE data
      const response = {
        success: true,
        message: 'TSP configuration created successfully',
        data: {
          config_id: parseInt(result.configurationId?.replace('tsp_', '') || '0') || 0,
          provider_name: String(result.providerName || 'unknown'),
          display_name: String(displayName || result.providerName || 'Unknown Provider'),
          environment: String(result.environment || 'sandbox'),
          is_active: Boolean(result.isActive ?? true),
          priority: parseInt(String(priority || 1)) || 1,
          health_status: String('HEALTHY'),
          last_health_check: String(new Date().toISOString()),
          configuration: configuration || {},
          supported_currencies: Array.isArray(result.additionalSettings?.supportedCurrencies) ? result.additionalSettings.supportedCurrencies : ['INR'],
          supported_payment_methods: Array.isArray(result.supportedPaymentMethods) ? result.supportedPaymentMethods : ['UPI', 'CARD', 'NETBANKING'],
          webhook_url: String(result.healthCheckEndpoint || ''),
          connection_timeout: parseInt(String(connectionTimeout || 30)) || 30,
          read_timeout: parseInt(String(readTimeout || 60)) || 60,
          created_at: String(result.createdAt || new Date().toISOString()),
          updated_at: String(result.updatedAt || new Date().toISOString()),
          created_by: String(createdBy || 'admin'),
          updated_by: String(createdBy || 'admin'),
        },
        error_message: String(''),
      };


      return response;
      } catch (error) {
        console.error('[Payment Engine gRPC] Full error in createTSPConfigurationGrpc:', {
          message: error.message,
          stack: error.stack,
          receivedData: data
        });
        
        // Return error in proto format instead of throwing
        return {
          success: false,
          message: 'Failed to create TSP configuration',
          data: null,
          error_message: error.message || 'Unknown error',
        };
      }
  }

  @GrpcMethod('PaymentEngineService', 'GetTSPConfigurations')
  async getTSPConfigurationsGrpc(data: { request_id: string }) {
    try {
      const result = await this.tspManagementService.getAllConfigurations(data.request_id);
      
      // Map result to match TSPConfigurationsResponse proto with TSPConfigData structure
      const mappedConfigs = result.map((config: any) => {
        // Extract database ID from configurationId (format: "tsp_1") or use raw id if available
        const dbId = config.id || (config.configurationId ? parseInt(config.configurationId.replace('tsp_', ''), 10) : null);
        
        // Extract connection_timeout and read_timeout from configuration map or metadata
        const configMap = config.additionalSettings?.configuration || {};
        const metadata = config.additionalSettings?.metadata || {};
        
        const credentials = config.additionalSettings?.credentials || {};
        
        const finalConfigMap = {
          ...configMap,
          credentials: JSON.stringify(credentials), // Store credentials as JSON string in configuration map
        };
        
        let connectionTimeout = 30000;
        if (configMap.connection_timeout) {
          const timeoutValue = typeof configMap.connection_timeout === 'string' 
            ? parseInt(configMap.connection_timeout, 10) 
            : configMap.connection_timeout;
          connectionTimeout = timeoutValue < 1000 ? timeoutValue * 1000 : timeoutValue; // Convert seconds to ms if needed
        } else if (metadata.connectionTimeout) {
          connectionTimeout = metadata.connectionTimeout;
        }
        
        let readTimeout = 60000;
        if (configMap.read_timeout) {
          const timeoutValue = typeof configMap.read_timeout === 'string'
            ? parseInt(configMap.read_timeout, 10)
            : configMap.read_timeout;
          readTimeout = timeoutValue < 1000 ? timeoutValue * 1000 : timeoutValue; // Convert seconds to ms if needed
        } else if (metadata.readTimeout) {
          readTimeout = metadata.readTimeout;
        }
        
        const connectionTimeoutSeconds = connectionTimeout >= 1000 ? connectionTimeout / 1000 : connectionTimeout;
        const readTimeoutSeconds = readTimeout >= 1000 ? readTimeout / 1000 : readTimeout;
        
        return {
          config_id: dbId || 0,
          provider_name: config.providerName || 'unknown',
          display_name: config.displayName || config.providerName || 'Unknown Provider',
          environment: config.environment || 'sandbox',
          is_active: config.isActive ?? true,
          priority: config.priority ?? 100,
          health_status: 'HEALTHY',
          last_health_check: new Date().toISOString(),
          configuration: finalConfigMap,
          supported_currencies: config.additionalSettings?.supportedCurrencies || metadata.supportedCurrencies || ['INR'],
          supported_payment_methods: config.supportedPaymentMethods || ['UPI', 'CARD', 'NETBANKING'],
          webhook_url: metadata.webhookUrl || config.healthCheckEndpoint || '',
          connection_timeout: connectionTimeoutSeconds,
          read_timeout: readTimeoutSeconds,
          created_at: config.createdAt || new Date().toISOString(),
          updated_at: config.updatedAt || new Date().toISOString(),
          created_by: metadata.createdBy || 'admin',
          updated_by: metadata.updatedBy || 'admin',
        };
      });

      const response = {
        success: true,
        configurations: mappedConfigs,
        error_message: '',
      };

      return response;
    } catch (error) {
      return {
        success: false,
        configurations: [],
        error_message: error.message || 'Failed to retrieve TSP configurations',
      };
    }
  }

  @GrpcMethod('PaymentEngineService', 'UpdateTSPConfiguration')
  async updateTSPConfigurationGrpc(data: any) {
    try {
      if (!data) {
        throw new Error('No data received in gRPC call');
      }
      const configId = data.config_id || data.configId;
      const displayNameInput = data.display_name || data.displayName;
      const priority = data.priority;
      const configuration = data.configuration;
      const supportedFeatures = data.supported_features || data.supportedFeatures;
      const requestId = data.request_id || data.requestId;
      const performedBy = data.performed_by || data.performedBy || 'system';
      
      let environment = data.environment || (data as any).environment || '';
      if (!environment || environment === '') {
        const requestIdMatch = requestId?.match(/update-tsp-[^-]+-([^-]+)-/);
        if (requestIdMatch && requestIdMatch[1]) {
          environment = requestIdMatch[1];
        }
      }
      if (!configId) {
        throw new Error('config_id is required');
      }

      const mappedSupportedFeatures = supportedFeatures ? {
        instantPayouts: supportedFeatures.instant_payouts !== undefined ? supportedFeatures.instant_payouts : supportedFeatures.instantPayouts,
        refunds: supportedFeatures.refunds,
        recurring: supportedFeatures.recurring_payments !== undefined ? supportedFeatures.recurring_payments : supportedFeatures.recurringPayments,
        webhooks: supportedFeatures.webhooks
      } : undefined;

      const result = await this.tspManagementService.updateConfiguration(
        configId,
        displayNameInput,
        priority,
        configuration,
        mappedSupportedFeatures,
        environment,
        requestId || 'grpc-request',
        performedBy
      );

      const displayName = result.additionalSettings?.metadata?.displayName || result.providerName || 'Unknown Provider';
      const priorityValue = (result as any).priority ?? result.additionalSettings?.metadata?.priority ?? 100;
      
      const configMap = result.additionalSettings?.configuration || {};
      const connectionTimeout = configMap.connection_timeout 
        ? (typeof configMap.connection_timeout === 'string' ? parseInt(configMap.connection_timeout, 10) : configMap.connection_timeout)
        : 30000;
      const readTimeout = configMap.read_timeout
        ? (typeof configMap.read_timeout === 'string' ? parseInt(configMap.read_timeout, 10) : configMap.read_timeout)
        : 60000;

      const connectionTimeoutSeconds = connectionTimeout >= 1000 ? connectionTimeout / 1000 : connectionTimeout;
      const readTimeoutSeconds = readTimeout >= 1000 ? readTimeout / 1000 : readTimeout;

      const response = {
        success: true,
        message: 'TSP configuration updated successfully',
        data: {
          config_id: parseInt(result.configurationId?.replace('tsp_', '') || '0') || 0,
          provider_name: String(result.providerName || 'unknown'),
          display_name: String(displayName),
          environment: String(result.environment || 'sandbox'),
          is_active: Boolean(result.isActive ?? true),
          priority: parseInt(String(priorityValue)) || 100,
          health_status: String('HEALTHY'),
          last_health_check: String(new Date().toISOString()),
          configuration: result.additionalSettings?.configuration || {},
          supported_currencies: Array.isArray(result.additionalSettings?.supportedCurrencies)
            ? result.additionalSettings.supportedCurrencies
            : ['INR'],
          supported_payment_methods: Array.isArray(result.supportedPaymentMethods)
            ? result.supportedPaymentMethods
            : ['UPI', 'CARD', 'NETBANKING'],
          webhook_url: String(result.healthCheckEndpoint || ''),
          connection_timeout: connectionTimeoutSeconds,
          read_timeout: readTimeoutSeconds,
          created_at: String(result.createdAt || new Date().toISOString()),
          updated_at: String(result.updatedAt || new Date().toISOString()),
          created_by: String('system'),
          updated_by: String(performedBy || 'system'),
        },
        error_message: String(''),
      };

      return response;
    } catch (error) {
      console.error('[Payment Engine gRPC] Error in updateTSPConfigurationGrpc:', {
        message: error.message,
        stack: error.stack,
        receivedData: data,
      });

      return {
        success: false,
        message: 'Failed to update TSP configuration',
        data: null,
        error_message: error.message || 'Unknown error',
      };
    }
  }

  @GrpcMethod('PaymentEngineService', 'ActivateTSPConfiguration')
  async activateTSPConfigurationGrpc(data: any) {
    try {
      if (!data) {
        throw new Error('No data received in gRPC call');
      }

      const configId = data.config_id || data.configId;
      const providerName = data.provider_name || data.providerName;
      const environment = data.environment;
      const requestId = data.request_id || data.requestId;
      const performedBy = data.performed_by || data.performedBy || 'system';

      if (!configId && (!providerName || !environment)) {
        throw new Error('Either config_id or (provider_name and environment) must be provided');
      }

      const result = await this.tspManagementService.activateConfiguration(
        configId,
        providerName,
        environment,
        requestId || 'grpc-request',
        performedBy
      );

      const response = {
        success: true,
        message: 'TSP configuration activated successfully',
        data: {
          config_id: parseInt(result.configurationId?.replace('tsp_', '') || '0') || 0,
          provider_name: String(result.providerName || 'unknown'),
          display_name: String(result.providerName || 'Unknown Provider'),
          environment: String(result.environment || 'sandbox'),
          is_active: Boolean(result.isActive ?? true),
          priority: 100,
          health_status: String('HEALTHY'),
          last_health_check: String(new Date().toISOString()),
          configuration: result.additionalSettings?.configuration || {},
          supported_currencies: Array.isArray(result.additionalSettings?.supportedCurrencies)
            ? result.additionalSettings.supportedCurrencies
            : ['INR'],
          supported_payment_methods: Array.isArray(result.supportedPaymentMethods)
            ? result.supportedPaymentMethods
            : ['UPI', 'CARD', 'NETBANKING'],
          webhook_url: String(result.healthCheckEndpoint || ''),
          connection_timeout: 30,
          read_timeout: 60,
          created_at: String(result.createdAt || new Date().toISOString()),
          updated_at: String(result.updatedAt || new Date().toISOString()),
          created_by: String('system'),
          updated_by: String('system'),
        },
        error_message: String(''),
      };

      return response;
    } catch (error) {
      console.error('[Payment Engine gRPC] Error in activateTSPConfigurationGrpc:', {
        message: error.message,
        stack: error.stack,
        receivedData: data,
      });

      return {
        success: false,
        message: 'Failed to activate TSP configuration',
        data: null,
        error_message: error.message || 'Unknown error',
      };
    }
  }

  @GrpcMethod('PaymentEngineService', 'DeactivateTSPConfiguration')
  async deactivateTSPConfigurationGrpc(data: any) {
    try {
      if (!data) {
        throw new Error('No data received in gRPC call');
      }

      const configId = data.config_id || data.configId;
      const providerName = data.provider_name || data.providerName;
      const environment = data.environment;
      const requestId = data.request_id || data.requestId;
      const performedBy = data.performed_by || data.performedBy || 'system';

      if (!configId && (!providerName || !environment)) {
        throw new Error('Either config_id or (provider_name and environment) must be provided');
      }

      const result = await this.tspManagementService.deactivateConfiguration(
        configId,
        providerName,
        environment,
        requestId || 'grpc-request',
        performedBy
      );

      const response = {
        success: true,
        message: 'TSP configuration deactivated successfully',
        data: {
          config_id: parseInt(result.configurationId?.replace('tsp_', '') || '0') || 0,
          provider_name: String(result.providerName || 'unknown'),
          display_name: String(result.providerName || 'Unknown Provider'),
          environment: String(result.environment || 'sandbox'),
          is_active: Boolean(result.isActive ?? false),
          priority: 100,
          health_status: String('HEALTHY'),
          last_health_check: String(new Date().toISOString()),
          configuration: result.additionalSettings?.configuration || {},
          supported_currencies: Array.isArray(result.additionalSettings?.supportedCurrencies)
            ? result.additionalSettings.supportedCurrencies
            : ['INR'],
          supported_payment_methods: Array.isArray(result.supportedPaymentMethods)
            ? result.supportedPaymentMethods
            : ['UPI', 'CARD', 'NETBANKING'],
          webhook_url: String(result.healthCheckEndpoint || ''),
          connection_timeout: 30,
          read_timeout: 60,
          created_at: String(result.createdAt || new Date().toISOString()),
          updated_at: String(result.updatedAt || new Date().toISOString()),
          created_by: String('system'),
          updated_by: String('system'),
        },
        error_message: String(''),
      };

      return response;
    } catch (error) {
      console.error('[Payment Engine gRPC] Error in deactivateTSPConfigurationGrpc:', {
        message: error.message,
        stack: error.stack,
        receivedData: data,
      });

      return {
        success: false,
        message: 'Failed to deactivate TSP configuration',
        data: null,
        error_message: error.message || 'Unknown error',
      };
    }
  }
}
