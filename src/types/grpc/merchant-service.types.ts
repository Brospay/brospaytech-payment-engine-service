/**
 * Merchant Service gRPC Types
 * Type definitions for gRPC communication with Merchant Service
 * Uses Observable pattern (NestJS gRPC standard) - same as admin service
 */

import { Observable } from 'rxjs';
import {
  GetCustomerDetailsRequestDto,
  GetCustomerDetailsResponseDto,
  UpdateCustomerRiskScoreRequestDto,
  UpdateCustomerRiskScoreResponseDto,
  CreateCustomerRequestDto,
  ListCustomersRequestDto,
  ListCustomersResponseDto,
  GetMerchantFraudSettingsRequestDto,
  GetMerchantFraudSettingsResponseDto,
  ValidateMerchantRequestDto,
  ValidateMerchantResponseDto,
  GetMerchantSettingsRequestDto,
  GetMerchantSettingsResponseDto
} from '@/dto/merchant-service';

// Merchant Service gRPC interface - NestJS returns Observables, not callbacks!
export interface MerchantServiceGrpc {
  // Customer operations - exact proto method names  
  CreateCustomer(request: CreateCustomerRequestDto): Observable<any>;
  
  GetCustomer(request: GetCustomerDetailsRequestDto): Observable<any>;
  
  ListCustomers(request: ListCustomersRequestDto): Observable<any>;
  
  // Merchant operations
  GetMerchant(request: { merchant_id_string: string; merchant_id: number }): Observable<any>;
  
  // Webhook configuration
  getMerchantWebhookConfig(request: GetMerchantWebhookConfigRequest): Observable<GetMerchantWebhookConfigResponse>;
  
  // Customer transaction stats
  UpdateCustomerTransactionStats(request: UpdateCustomerTransactionStatsRequest): Observable<UpdateCustomerTransactionStatsResponse>;
  
  // Legacy methods (for backwards compatibility)
  getCustomerDetails(request: GetCustomerDetailsRequestDto): Observable<any>;
  
  updateCustomerRiskScore(request: UpdateCustomerRiskScoreRequestDto): Observable<any>;
  
  getMerchantFraudSettings(request: GetMerchantFraudSettingsRequestDto): Observable<any>;
  
  validateMerchant(request: ValidateMerchantRequestDto): Observable<any>;
  
  getMerchantSettings(request: GetMerchantSettingsRequestDto): Observable<any>;
}

// Additional interfaces for internal use
export interface GetMerchantWebhookConfigRequest {
  merchantId: string;
  requestId: string;
}

export interface GetMerchantWebhookConfigResponse {
  success: boolean;
  webhookUrl: string;
  webhookSecret: string;
  isActive: boolean;
  retryAttempts: number;
  timeoutMs: number;
}

// // Customer Profile for fraud analysis - derived from DTOs
// export interface CustomerProfile {
//   customerId: string;
//   merchantId: number;
//   email?: string;
//   phone?: string;
//   previousTransactions: number;
//   successfulTransactions: number;
//   failedTransactions: number;
//   totalAmount: number;
//   averageAmount: number;
//   lastTransactionDate?: Date;
//   riskScore: number;
//   fraudFlags: string[];
//   deviceFingerprint?: string;
//   ipAddress?: string;
//   location?: string;
// }

// Update Customer Transaction Stats interfaces
export interface UpdateCustomerTransactionStatsRequest {
  customer_id: string;
  merchant_id: string;
  currency: string;
  amount: number;
  transaction_status: 'success' | 'failed';
  transaction_id: string;
  payment_method?: string;
  transaction_date?: string;
}

export interface UpdateCustomerTransactionStatsResponse {
  success: boolean;
  message: string;
  customer_id: string;
  updated_stats?: {
    total_transactions: number;
    total_amount: number;
    successful_transactions: number;
    failed_transactions: number;
    average_transaction_amount: number;
    last_transaction_date: string;
    transactions_by_asset: Record<string, {
      total_amount: number;
      transaction_count: number;
      successful_count: number;
      failed_count: number;
      last_transaction_date: string;
      average_amount: number;
    }>;
  };
  error_code?: string;
}
