/**
 * Kingdom Bank TSP Integration Types
 * Based on The Kingdom Bank OpenAPI Specification v0.0.1
 */


export interface KingdomBankAuth {
  apiKey: string;
  apiSecret: string;
  signatureKey: string;
  signatureKeyId: string;
}

export interface KingdomBankHeaders {
  'X-Api-Key': string;
  'X-Api-Secret': string;
  'X-Signature': string;
  'X-Signature-Key-Id': string;
  'Content-Type': string;
  'Accept': string;
}


export interface KingdomBankPaymentInitiationRequest {
  foreignTransactionId: string;
  amount: number;
  currency: string;
  notificationUrl: string;
  reference?: string;
  successUrl?: string;
  failUrl?: string;
  externalUserId?: string;
  accountId?: number;
  customer?: KingdomBankCustomer;
  source?: KingdomBankPaymentRequestSourceBankAccount;
  allowedPaymentMethods?: KingdomBankPaymentMethodKey[];
  paymentMethodFlow?: 'CHECKOUT' | 'DIRECT';
  selectedPaymentMethod?: 'INSTANT_BANK_TRANSFER';
  selectedBic?: string; // Deprecated but still part of spec
  bankInstitutionKey?: string;
  items?: KingdomBankPaymentRequestItem[];
  generateInvoice?: boolean;
}

export interface KingdomBankManualBankTransferInitiationRequest {
  foreignTransactionId: string;
  amount: number;
  amountType: 'PAYMENT' | 'SETTLEMENT';
  paymentCurrency: string;
  settlementCurrency: string;
  notificationUrl: string;
  externalUserId?: string;
  accountId?: number;
  customer: KingdomBankCustomer;
  customerBank: KingdomBankCustomerBank;
}

export interface KingdomBankManualPaymentInitiationRequest {
  foreignTransactionId: string;
  amount: number;
  paymentCurrency: string;
  settlementCurrency: string;
  notificationUrl: string;
  externalUserId?: string;
  accountId?: number;
}

// ==================== RESPONSES ====================

export interface KingdomBankPaymentInitiationResponse {
  externalTransactionId: string;
  requestId: string;
  timestamp: string;
  validUntil: string;
  redirectUrl: string;
  qrCode?: string;
  hostedQrPageUrl?: string;
}

export interface KingdomBankBankTransferInitiationResponse {
  externalTransactionId: string;
  requestId: string;
  timestamp: string;
  amountType: 'PAYMENT' | 'SETTLEMENT';
  paymentAmount: number;
  paymentCurrency: string;
  settlementAmount: number;
  settlementCurrency: string;
  fxRate: number;
  reference: string;
  bankAccount: KingdomBankBankTransferInitiationAccountDetailsResponse;
}

export interface KingdomBankManualDepositApiResponse {
  externalTransactionId: string;
  requestId: string;
  timestamp: string;
  paymentAmount: number;
  paymentCurrency: string;
  settlementAmount: number;
  settlementCurrency: string;
  fxRate: number;
  fxRateWithMarkup: number;
  cryptoAddress: KingdomBankCryptoAddressDetails;
}

// ==================== REFUNDS & PAYOUTS ====================

export interface KingdomBankRefundRequest {
  refundForeignTransactionId: string;
  notificationUrl: string;
  originalTransactionId?: number;
  originalForeignTransactionId?: string;
  amount?: number;
}

export interface KingdomBankPayoutRequest {
  payoutForeignTransactionId: string;
  amount: number;
  notificationUrl: string;
  originalTransactionId?: number;
  originalForeignTransactionId?: string;
}

// ==================== TRANSFERS ====================

export interface KingdomBankTransferInternalRequest {
  amount: number;
  currency: string;
  foreignTransactionId: string;
  notificationUrl: string;
  accountId?: number;
  destinationEmail?: string;
  destinationUserId?: number;
}

export interface KingdomBankTransferExternalRequest {
  amount: number;
  currency: string;
  foreignTransactionId: string;
  notificationUrl: string;
  destinationType: KingdomBankDestinationType;
  destination: KingdomBankDestinationAccount;
  accountId?: number;
  reference?: string;
}

// ==================== CUSTOMER & BANK DETAILS ====================

export interface KingdomBankCustomer {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  language?: string;
}

export interface KingdomBankCustomerBank {
  name: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  country: string;
}

export interface KingdomBankPaymentRequestSourceBankAccount {
  country?: string;
  iban?: string;
  accountNumber?: string;
  bicSwift?: string;
  bankCode?: string;
  branchCode?: string;
  holderName?: string;
  accountType?: KingdomBankBankAccountType;
}

export interface KingdomBankPaymentRequestItem {
  name: string;
  description?: string;
  quantity: number;
  currency: string;
  unitPrice: number;
  discountAmount?: number;
  totalAmount: number;
}

// ==================== ACCOUNT & TRANSACTION TYPES ====================

export interface KingdomBankAccount {
  accountId: number;
  currency: string;
  totalBalance: number;
  availableBalance: number;
  blockedBalance: number;
  bankAccountDetails?: KingdomBankDedicatedBankAccount;
}

export interface KingdomBankTransaction {
  transactionId: number;
  accountId: number;
  createdTime: string;
  lastStatusUpdateTime: string;
  status: KingdomBankTransactionStatus;
  transactionAmount: number;
  transactionCurrency: string;
  direction: KingdomBankTransactionDirection;
  type: string;
  category: KingdomBankTransactionCategory;
  paymentMethod?: KingdomBankPaymentMethodKey;
}

export interface KingdomBankTransactionHistoryRequest {
  accountId: number;
  from: string;
  to: string;
  limit?: number;
  showTransactionsFromAllSubaccounts?: boolean;
}

export interface KingdomBankTransactionSearchRequest {
  transactionId?: number;
  parentTransactionId?: number;
  foreignTransactionId?: string;
  parentForeignTransactionId?: string;
  paymentRequestId?: number;
  include?: string[];
}

// ==================== DESTINATION TYPES ====================

export type KingdomBankDestinationType = 'BANK_ACCOUNT' | 'CRYPTO_WALLET' | 'PIX_ACCOUNT' | 'INTERAC_ACCOUNT';

export type KingdomBankDestinationAccount = 
  | KingdomBankDestinationBankAccount 
  | KingdomBankDestinationCryptoWallet 
  | KingdomBankDestinationPixAccount 
  | KingdomBankDestinationInteracAccount;

export interface KingdomBankDestinationBankAccount {
  country?: string;
  iban?: string;
  accountNumber?: string;
  interbankAccountCode?: string;
  bicSwift?: string;
  bankCode?: string;
  branchCode?: string;
  holderName?: string;
  holderEmail?: string;
  holderPhone?: string;
  holderAddress?: KingdomBankAddress;
  bankName?: string;
  bankAddress?: KingdomBankAddress;
  accountType?: KingdomBankBankAccountType;
  documentId?: string;
}

export interface KingdomBankDestinationCryptoWallet {
  address: string;
  tag?: string;
}

export interface KingdomBankDestinationPixAccount {
  accountNumber: string;
  ispbCode: string;
  branchCode: string;
  holderName: string;
  documentId: string;
  pixKey?: string;
}

export interface KingdomBankDestinationInteracAccount {
  holderName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
}

// ==================== HELPER TYPES ====================

export interface KingdomBankAddress {
  countryCode: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  region?: string;
  postalCode: string;
}

export interface KingdomBankBankTransferInitiationAccountDetailsResponse {
  accountNumber: string;
  bankName: string;
  bankAddress?: string;
  beneficiaryName: string;
  beneficiaryAddress?: string;
  beneficiaryCountry: string;
  bankCode?: string;
  swiftCode?: string;
}

export interface KingdomBankCryptoAddressDetails {
  address: string;
  tag?: string;
  currency: string;
}

export interface KingdomBankDedicatedBankAccount {
  country: string;
  iban?: string;
  accountType?: KingdomBankBankAccountType;
  bankName?: string;
  bicSwift?: string;
  accountNumber?: string;
  bankCode?: string;
  branchCode?: string;
  holderName?: string;
  documentId?: string;
}

// ==================== ENUMS ====================

export type KingdomBankPaymentMethodKey = 
  | 'BANKWIRE'
  | 'CASH_TO_CODE'
  | 'COMMUNITY_INSTANT_BANK_TRANSFER'
  | 'CRYPTO'
  | 'EFECTY_CASH'
  | 'INSTANT_BANK_TRANSFER'
  | 'INTERAC'
  | 'JETON_CASH'
  | 'KINGDOM_CASH'
  | 'KINGDOM_WALLET'
  | 'MONET_PAY_BANK'
  | 'MONET_PAY_CASH'
  | 'PAGO_EFECTIVO_BANK'
  | 'PAYCASH_CASH'
  | 'PAYNET_CASH'
  | 'PERFECT_MONEY'
  | 'PIX'
  | 'PSE'
  | 'QR_PAYMENT'
  | 'SPEI';

export type KingdomBankBankAccountType = 'CURRENT' | 'CHECKING' | 'SAVINGS';

export type KingdomBankTransactionStatus = 'FAILED' | 'CANCELLED' | 'PENDING' | 'SCHEDULED' | 'PROCESSED';

export type KingdomBankTransactionDirection = 'DEPOSIT' | 'WITHDRAWAL';

export type KingdomBankTransactionCategory = 
  | 'PAYMENT'
  | 'DEPOSIT'
  | 'EXTERNAL_TRANSFER'
  | 'INTERNAL_TRANSFER'
  | 'EXCHANGE'
  | 'REFUND'
  | 'PAYOUT'
  | 'RETURN'
  | 'TRANSACTION_FEE'
  | 'SERVICE_FEE'
  | 'CHARGEBACK'
  | 'CHARGEBACK_REVERSAL'
  | 'ADJUSTMENT';

// ==================== NOTIFICATIONS (WEBHOOKS) ====================

export interface KingdomBankNotification {
  notificationId: number;
  foreignTransactionId: string;
  requestId?: string;
  transactionId: number;
  timestamp: string;
  type: KingdomBankNotificationType;
  status: KingdomBankNotificationStatus;
  underpaid?: boolean;
  overpaid?: boolean;
  reference?: string;
  requestAmount: number;
  requestCurrency: string;
  transactionAmount?: number;
  transactionCurrency?: string;
  processingAmount?: number;
  processingCurrency?: string;
  paidAmount?: number;
  paidCurrency?: string;
  customerAmount?: number;
  customerCurrency?: string;
  customer?: KingdomBankPaymentNotificationCustomer;
  externalUserId?: string;
  originalTransactionId?: number;
  originalForeignTransactionId?: string;
  error?: KingdomBankNotificationError;
  fees?: KingdomBankFee[];
}

export interface KingdomBankPaymentNotificationCustomer {
  last4Chars?: string;
}

export interface KingdomBankNotificationError {
  code: number;
  message: string;
}

export interface KingdomBankFee {
  feeType: string;
  amount: number;
  currency: string;
}

export type KingdomBankNotificationType = 
  | 'PAYMENT'
  | 'PAYOUT'
  | 'EXTERNAL_TRANSFER'
  | 'INTERNAL_TRANSFER'
  | 'REFUND'
  | 'CHARGEBACK';

export type KingdomBankNotificationStatus = 
  | 'PENDING'
  | 'SCHEDULED'
  | 'PROCESSED'
  | 'FAILED'
  | 'CANCELLED';

// ==================== ERROR HANDLING ====================

export interface KingdomBankError {
  traceId: string;
  timestamp: string;
  code: number;
  message: string;
  cause?: KingdomBankErrorCause[];
}

export interface KingdomBankErrorCause {
  field: string;
  cause: string;
}

export interface KingdomBankGeneralError {
  traceId: string;
  timestamp: string;
}

// ==================== PAGINATION ====================

export interface KingdomBankPaginatedResponse<T> {
  pageSize: number;
  totalElements: number;
  totalPages: number;
  pageNumber: number;
  elements: T[];
}

export interface KingdomBankScrollingResponse<T> {
  pageSize: number;
  nextPageId?: string;
  elements: T[];
}

// ==================== RATE & EXCHANGE ====================

export interface KingdomBankRateInfo {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
}

export interface KingdomBankExchangeApiRequest {
  fromCurrency?: string;
  fromAccountId?: number;
  toCurrency?: string;
  toAccountId?: number;
  fromAmount: number;
}

export interface KingdomBankExchangeApiResponse {
  transactionId: number;
  status: string;
  fee: number;
  feeCurrency: string;
  rate: number;
  rateCurrency: string;
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;
  toAmount: number;
}

// ==================== VALIDATION ====================

export interface KingdomBankValidateDestinationAccountRequest {
  destinationType: KingdomBankDestinationType;
  destination: KingdomBankDestinationAccount;
}

export interface KingdomBankValidateDestinationAccountResponse {
  valid: boolean;
  cause?: KingdomBankErrorCause[];
}
