/**
 * TSP Management Types
 */

export interface CreateTSPConfigurationRequest {
  providerName: string;
  environment: 'production' | 'sandbox' | 'development';
  configuration: TSPProviderConfig;
  isActive: boolean;
  priority: number;
  supportedPaymentMethods: string[];
  supportedCurrencies: string[];
  merchantId?: string;
  requestId: string;
}

export interface CreateTSPConfigurationResponse {
  configurationId: string;
  providerName: string;
  environment: string;
  isActive: boolean;
  priority?: number; // TSP priority for routing
  baseUrl?: string;
  supportedPaymentMethods: string[];
  feeStructure?: Record<string, any>;
  healthCheckEndpoint?: string;
  createdAt: string;
  updatedAt: string;
  additionalSettings?: Record<string, any>;
}

export interface TSPProviderConfig {
  baseUrl: string;
  apiKey: string;
  merchantId?: string;
  secretKey?: string;
  webhookSecret?: string;
  timeout: number;
  retryAttempts: number;
  additionalSettings?: Record<string, any>;
}

// For service layer - return array directly to match DTO expectation
export interface GetTSPConfigurationsResponse extends Array<TSPConfigurationSummary> {}

export interface TSPConfigurationSummary {
  configurationId: string;
  id?: number; 
  providerName: string;
  environment: string;
  isActive: boolean;
  priority?: number; 
  baseUrl?: string;
  supportedPaymentMethods: string[];
  feeStructure?: Record<string, any>;
  healthCheckEndpoint?: string;
  createdAt: string;
  updatedAt: string;
  additionalSettings?: Record<string, any>;
}
