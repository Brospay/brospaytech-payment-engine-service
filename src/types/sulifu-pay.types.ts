/**
 * Sulifu Pay API Types
 * Based on Sulifu Pay API Documentation v3.0
 */

/**
 * Sulifu Pay Authentication Credentials
 */
export interface SulifuPayAuth {
  merNo: string;           // Merchant Number
  apiKey: string;          // API Key for signature generation
  apiUrl: string;          // Base API URL
}

/**
 * Channel Types (Deposit)
 * See documentation section 4.3
 */
export type SulifuPayChannelType =
  | 'BankToBank'          // Bank card transfer to bank card (IMPS India)
  | 'UPIQR'               // UPI QR Code (India)
  | 'UPIQR-H5'            // UPI Wake-up (India)
  | 'NoCharges'           // Test channel (no fees)
  | 'SupermarketCodePay'  // Store code
  | 'PIXPay'              // Brazil PIX
  | 'AutoBank'            // Fast Pay
  | 'QR'                  // QR Code
  | 'CreditCard'          // Credit Card
  | 'Alipay'              // Alipay
  | 'Alipay-H5'           // Native Alipay
  | 'WeChat'              // WeChat
  | 'FasterPayment'       // FPS (Hong Kong)
  | 'Walltet'             // Wallet
  | 'VirtualPay'          // Virtual account
  | 'QRIS'                // QRIS (Indonesia)
  | 'OVO'                 // OVO
  | 'DANA'                // DANA
  | 'ShopeePay'           // ShopeePay
  | 'GoPay'               // GoPay
  | 'LinkAja'             // LinkAja
  | 'KBZpay'              // KBZpay
  | 'WavePay'             // WavePay
  | 'LinePay'             // LinePay
  | 'PayID';              // PayID

/**
 * Payout Channel Types
 * See documentation section 4.4
 */
export type SulifuPayPayoutChannelType =
  | 'Payout'              // Withdrawal
  | 'Payout3'             // Manual withdrawal
  | 'PIXPayout'           // Brazil PIX withdrawal
  | 'FasterPayout';       // FPS Withdrawal

/**
 * Account Type for Payouts
 */
export type SulifuPayAccountType =
  | 'CPF'       // Personal tax number (Brazil)
  | 'CNPJ'      // Company tax number (Brazil)
  | 'PHONE'     // Phone
  | 'EMAIL'     // Email
  | '40'        // Clabe (Mexico)
  | '3'         // Bank card (Mexico, India, Russia)
  | 'UPI'       // UPI (India)
  | 'SBP'       // SBP (Russia)
  | 'IMPS';     // IMPS (India)

/**
 * Payment Status
 */
export enum SulifuPayPaymentStatus {
  FAILED_CREATE = -1,     // Failed to create order
  PROCESSING = 0,         // Processing
  SUCCESS = 1,            // Deposit successful
  REVIEWING = 9,          // Under review
}

/**
 * Payout Status
 */
export enum SulifuPayPayoutStatus {
  FAILED_CREATE = -2,     // Failed to create order
  PROCESSING = 0,         // Processing
  FAILED_PAYMENT = -1,    // Payment failed
  API_AUDIT = 8,          // API Audit
  SUCCESS = 1,            // Withdrawal successful
  MANUAL_AUDIT = 9,       // Manual audit
}

/**
 * Deposit/Payment Request
 * POST /pay/createOrder
 */
export interface SulifuPayDepositRequest {
  merNo: string;                      // Merchant Number (Y)
  tradeNo: string;                    // Merchant order number (Y)
  cType: SulifuPayChannelType;        // Channel type (Y)
  bankCode?: string;                  // Bank code (N)
  orderAmount: number;                // Order amount (Y)
  playerId?: string;                  // Player ID (N)
  playerName: string;                 // Player name (Y)
  identifyNum?: string;               // Identity number (N)
  supermarketCode?: string;           // Supermarket code (N)
  playerPayAcc?: string;              // Player payment account (N)
  playerPayBankName?: string;         // Player payment bank name (N)
  playerBirthday?: string;            // Player date of birth (N)
  areaCode?: string;                  // Area code (N)
  playerPhoneNumber?: string;         // Player phone number (N)
  playerEmail?: string;               // Player email (N)
  playerWalletAddr?: string;          // Player wallet address (N)
  notifyUrl: string;                  // Async notification URL (Y)
  returnUrl?: string;                 // Sync notification URL (N)
  idNo?: string;                      // ID number (N)
  telCo?: string;                     // Telecommunication company (N)
  gender?: string;                    // Gender (N)
  playerBankAccountName?: string;     // Player bank account name (N)
  country?: string;                   // Country (N)
  postalCode?: string;                // Postal code (N)
  city?: string;                      // City (N)
  address?: string;                   // Address (N)
  storeId?: string;                   // Store ID (N)
  VerifyChannelNo?: number;           // Audit route (N, default: 1)
  sign: string;                       // Signature (Y)
}

/**
 * Deposit/Payment Response
 */
export interface SulifuPayDepositResponse {
  Success: number;                    // 1 = success, 0 = fail
  Message: string;                    // Status message
  oid?: string;                       // System order ID
  PayPage?: string;                   // Payment page link
  Params?: SulifuPayDepositParams;    // Payment parameters
}

/**
 * Payment Parameters returned in deposit response
 */
export interface SulifuPayDepositParams {
  bankAccount?: string;               // Bank card account
  bankCode?: string;                  // Bank code
  bankName?: string;                  // Bank name
  branchName?: string;                // Branch
  bankAccountName?: string;           // Account name
  noteNo?: string;                    // Deposit note
  orig_money?: string;                // Order amount
  money?: string;                     // System specified deposit amount
  pay_page_type?: string;             // Cash register code
  qrcode_url?: string;                // QR code image URL
  phone_no?: string;                  // Phone number
  pay_page_pin?: string;              // PIN code
}

/**
 * Payout/Withdrawal Request
 * POST /payout/createOrder
 */
export interface SulifuPayPayoutRequest {
  merNo: string;                      // Merchant Number (Y)
  tradeNo: string;                    // Merchant order number (Y)
  cType: SulifuPayPayoutChannelType;  // Channel type (Y)
  bankCode: string;                   // Bank code (Y)
  bankBranch?: string;                // Bank branch (N)
  branchCode?: string;                // Branch code (N)
  documentId?: string;                // Document ID (N)
  accountType?: SulifuPayAccountType; // Account type (N)
  documentType?: string;              // Document type (N)
  bankCardNo: string;                 // Bank card number / wallet address (Y)
  orderAmount: number;                // Order amount (Y)
  accountName: string;                // Beneficiary name (Y)
  openProvince: string;               // Bank account province (Y)
  openCity: string;                   // Bank account city (Y)
  notifyUrl: string;                  // Async notification URL (Y)
  VerifyChannelNo?: number;           // Audit route (N, default: 1)
  financial_bank_code?: string;       // IFSC code (N)
  cellphone_number?: string;          // Cellphone number (N)
  playerId?: string;                  // Player ID (N)
  playerEmail?: string;               // Player email (N)
  sign: string;                       // Signature (Y)
}

/**
 * Payout/Withdrawal Response
 */
export interface SulifuPayPayoutResponse {
  Success: number;                    // 1 = success, 0 = fail
  Message: string;                    // Status message
  oid?: string;                       // System order ID
}

/**
 * Balance Inquiry Request
 * POST /inquiry/getMerBalance
 */
export interface SulifuPayBalanceRequest {
  merNo: string;                      // Merchant Number (Y)
  datetime: string;                   // Timestamp YYYYMMDDhhmmss (Y)
  sign: string;                       // Signature (Y)
}

/**
 * Balance Inquiry Response
 */
export interface SulifuPayBalanceResponse {
  Success: number;                    // 1 = success, 0 = fail
  Message: string;                    // Status message
  Balance?: number;                   // Available balance
  Freeze?: number;                    // Frozen amount
  OpenBalance?: number;               // Daily 00:00 balance
}

/**
 * Payment Transaction Inquiry Request
 * POST /inquiry/payOrder
 */
export interface SulifuPayDepositInquiryRequest {
  merNo: string;                      // Merchant Number (Y)
  tradeNo: string;                    // Merchant order number (Y)
  sign: string;                       // Signature (Y)
}

/**
 * Payment Transaction Inquiry Response
 */
export interface SulifuPayDepositInquiryResponse {
  Success: number;                    // 1 = success, 0 = fail
  Message: string;                    // Status message
  orderAmount?: number;               // Order amount
  topupAmount?: number;               // Completion amount
  status?: SulifuPayPaymentStatus;    // Payment status
}

/**
 * Payout Transaction Inquiry Request
 * POST /inquiry/payoutOrder
 */
export interface SulifuPayPayoutInquiryRequest {
  merNo: string;                      // Merchant Number (Y)
  tradeNo: string;                    // Merchant order number (Y)
  sign: string;                       // Signature (Y)
}

/**
 * Payout Transaction Inquiry Response
 */
export interface SulifuPayPayoutInquiryResponse {
  Success: number;                    // 1 = success, 0 = fail
  Message: string;                    // Status message
  orderAmount?: number;               // Order amount
  topupAmount?: number;               // Completion amount
  topupTime?: string;                 // Completion time
  status?: SulifuPayPayoutStatus;     // Payout status
}

/**
 * Deposit Async Notification (Webhook)
 */
export interface SulifuPayDepositNotification {
  tradeNo: string;                    // Merchant order number (Y)
  topupAmount: number;                // Completion amount (Y)
  tradeStatus: SulifuPayPaymentStatus;// Payment status (Y)
  message: string;                    // Status message (Y)
  Fees?: number;                      // Fee (N)
  SingleFee?: number;                 // Single fee (N)
  sign: string;                       // Signature (Y)
}

/**
 * Payout Async Notification (Webhook)
 */
export interface SulifuPayPayoutNotification {
  tradeNo: string;                    // Merchant order number (Y)
  orderAmount: number;                // Payment amount (Y)
  tradeStatus: SulifuPayPayoutStatus; // Payment status (Y)
  message: string;                    // Status message (Y)
  Fees?: number;                      // Fee (N)
  SingleFee?: number;                 // Single fee (N)
  sign: string;                       // Signature (Y)
}

/**
 * API Status Codes
 * See documentation section 4.1
 */
export enum SulifuPayStatusCode {
  SUCCESS = 1,                        // Success
  FAIL = 0,                           // Fail
  INCOMPLETE_PARAMS = 1001,           // Incomplete parameters
  MERCHANT_NOT_EXIST = 1002,          // Merchant ID does not exist
  WRONG_BANK_CODE = 1003,             // Wrong bank code
  ORDER_EXISTS = 1004,                // Order number already exists
  SIGNATURE_ERROR = 1005,             // Signature error
  NO_BANK_CARD = 1006,                // No bank card available
  SYSTEM_EXCEPTION = 1007,            // System exception
  IP_NOT_WHITELISTED = 1008,          // IP not in whitelist
  INSUFFICIENT_FUNDS = 1009,          // Insufficient funds
}

/**
 * API Audit Request (Optional Feature)
 * POST to merchant's verification endpoint
 */
export interface SulifuPayApiAuditRequest {
  TransNo: string;                    // System order number (Y)
  TransactionNumber: number;          // Merchant order number (Y)
  Amount: number;                     // Order amount (Y)
  MerchantNo: string;                 // Merchant Number (Y)
  SignCode: string;                   // Signature (Y)
}

/**
 * API Audit Response
 */
export interface SulifuPayApiAuditResponse {
  Amount: number;                     // Order amount
  Message: string;                    // Processing result
  PayStatus: number;                  // 0=success, 1=error, 2=no data, 5=incorrect params, 6=restrictions
  SignCode: string;                   // Signature
  TransNo: string;                    // System order number
  TransactionNumber: string;          // Merchant order number
}

