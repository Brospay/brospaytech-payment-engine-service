/**
 * Wallet Service gRPC Types
 * Type definitions for gRPC communication with Wallet Service
 */

// Wallet Service gRPC interface (matches actual proto with PascalCase method names)
export interface WalletServiceGrpc {
  ProcessPaymentWithFees(data: CreditAmountRequest): Promise<CreditAmountResponse>;
  GetCurrencyWalletBalance(data: GetBalanceRequest): Promise<BalanceResponse>;
  CreateCurrencyWallet(data: CreateWalletRequest): Promise<CreateWalletResponse>;
  GetAllWalletBalances(data: { merchant_id: string; request_id: string }): Promise<any>;
  BlockAmount(data: BlockAmountRequest): Promise<BlockAmountResponse>;
  ReleaseBlockedAmount(data: ReleaseBlockedAmountRequest): Promise<ReleaseBlockedAmountResponse>;
  DebitBlockedAmount(data: DebitBlockedAmountRequest): Promise<DebitBlockedAmountResponse>;
  CalculateFees(data: any): Promise<any>;
}

// Process payment with fees request (formerly credit amount)
export interface CreditAmountRequest {
  merchant_id: string;
  gross_amount: number;
  currency: string;
  transaction_type: string;
  description: string;
  source_transaction_id: string;
  source_order_id: string;
  request_id: string;
  payment_method: string;
  metadata: Record<string, string>;
}

// Fee breakdown structure
export interface FeeBreakdown {
  settlement_fee: number;
  platform_fee: number;
  gateway_fee: number;
  processing_fee: number;
  total_fees: number;
  fee_calculation_method: string;
}

export interface CreditAmountResponse {
  success: boolean;
  merchant_wallet_transaction_id: string;
  admin_wallet_transaction_id: string;
  gross_amount: number;
  total_fees: number;
  net_amount_to_merchant: number;
  fee_breakdown: FeeBreakdown;
  merchant_balance_before: number;
  merchant_balance_after: number;
  admin_wallet_balance_after: number;
  message: string;
  error_message?: string;
}

// Debit amount request/response
export interface DebitAmountRequest {
  merchant_id: number;
  amount: number;
  currency: string;
  reference_id: string;
  transaction_type: string;
  description: string;
  request_id: string;
}

export interface DebitAmountResponse {
  success: boolean;
  message: string;
  transaction_id: string;
  new_balance: number;
}

// Balance request/response
export interface GetBalanceRequest {
  merchant_id: string;
  currency: string;
  request_id: string;
}

export interface BalanceResponse {
  success: boolean;
  wallet: {
    wallet_id: string;
    currency: string;
    currency_symbol: string;
    available_balance: number;
    total_balance: number;
    blocked_balance: number;
    pending_balance: number;
    lifetime_balance: number;
    lifetime_withdrawn: number;
    status: string;
    last_transaction_at: string | null;
  } | null;
  message: string;
  error_message?: string;
}

// Create wallet request/response
export interface CreateWalletRequest {
  merchant_id: string;
  currency: string;
  request_id: string;
}

export interface CreateWalletResponse {
  success: boolean;
  wallet?: {
    wallet_id: string;
    merchant_id: string;
    currency: string;
    available_balance: number;
    blocked_balance: number;
  };
  message: string;
  error_message?: string;
}

// Balance history request/response
export interface GetBalanceHistoryRequest {
  merchant_id: string;
  currency?: string;
  from_date?: string;
  to_date?: string;
  transaction_type?: string;
  limit?: number;
  offset?: number;
  request_id: string;
}

export interface BalanceHistoryResponse {
  success: boolean;
  message: string;
  transactions: WalletTransaction[];
  total_count: number;
}

export interface WalletTransaction {
  transaction_id: string;
  amount: number;
  currency: string;
  transaction_type: string;
  description: string;
  reference_id: string;
  balance_after: number;
  created_at: string;
}

// Payout request/response (renamed to avoid conflicts)
export interface WalletCreatePayoutRequest {
  merchant_id: number;
  amount: number;
  currency: string;
  bank_account_id: string;
  description?: string;
  request_id: string;
}

export interface WalletPayoutResponse {
  success: boolean;
  message: string;
  payout_id: string;
  status: string;
  estimated_arrival: string;
}

export interface GetPayoutStatusRequest {
  payout_id: string;
  merchant_id: number;
  request_id: string;
}

export interface PayoutStatusResponse {
  success: boolean;
  message: string;
  payout_id: string;
  status: string;
  amount: number;
  currency: string;
  created_at: string;
  completed_at?: string;
  failure_reason?: string;
}

// Settlement request/response
export interface ProcessSettlementRequest {
  merchant_id: number;
  settlement_date: string;
  transaction_ids?: string[];
  request_id: string;
}

export interface SettlementResponse {
  success: boolean;
  message: string;
  settlement_id: string;
  total_amount: number;
  transaction_count: number;
  fees_deducted: number;
  net_settlement: number;
}

export interface BlockAmountRequest {
  merchant_id: string;
  amount: number;
  currency: string;
  reference_id: string;
  block_reason: string;
  request_id: string;
}

export interface BlockAmountResponse {
  success: boolean;
  block_id: string;
  blocked_amount: number;
  available_balance: number;
  total_blocked_balance: number;
  message: string;
  error_message?: string;
}

export interface ReleaseBlockedAmountRequest {
  merchant_id: string;
  block_id: string;
  currency: string;
  release_reason: string;
  request_id: string;
}

export interface ReleaseBlockedAmountResponse {
  success: boolean;
  released_amount: number;
  available_balance: number;
  total_blocked_balance: number;
  message: string;
  error_message?: string;
}

export interface DebitBlockedAmountRequest {
  merchant_id: string;
  block_id: string;
  currency: string;
  description: string;
  request_id: string;
}

export interface DebitBlockedAmountResponse {
  success: boolean;
  transaction_id: string;
  debited_amount: number;
  balance_after: number;
  message: string;
  error_message?: string;
}
