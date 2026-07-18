/**
 * Enterprise Payment Response Code System
 * Enhanced version of Valorapays response codes with comprehensive transaction state management
 * 
 * Architecture Pattern:
 * - PaymentIntent: High-level intention to collect payment (requires_payment_method -> succeeded)
 * - PaymentTransaction: Individual attempts to process via TSP (initiated -> success/failed)
 * 
 * This follows Stripe's separation model for better retry and state management
 */

export enum ResponseCodeType {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  PENDING = 'PENDING',
  WAITING_BANK = 'WAITING_BANK',
  WAITING_CUSTOMER = 'WAITING_CUSTOMER',
  ABANDONED = 'ABANDONED',
  TIMEOUT = 'TIMEOUT',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
  EXPIRED = 'EXPIRED',
  REQUIRES_ACTION = 'REQUIRES_ACTION'
}

export enum ResponseCodeCategory {
  SUCCESS = 'SUCCESS',
  BANK_DECLINE = 'BANK_DECLINE',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
  USER_ACTION = 'USER_ACTION',
  FRAUD = 'FRAUD',
  LIMIT_EXCEEDED = 'LIMIT_EXCEEDED',
  PENDING = 'PENDING',
  TIMEOUT = 'TIMEOUT',
  COMPLIANCE = 'COMPLIANCE',
  BUSINESS_RULE = 'BUSINESS_RULE'
}

export interface ResponseCodeInfo {
  code: string;
  type: ResponseCodeType;
  description: string;
  category: ResponseCodeCategory;
  isFinalStatus: boolean;
  requiresFollowup: boolean;
  affectsSettlement: boolean;
  canRetry: boolean;
  maxRetries?: number;
  retryDelaySeconds?: number;
  customerMessage: string;
  merchantMessage: string;
  httpStatusCode: number;
}

export const ENHANCED_RESPONSE_CODE_MAPPINGS: Record<string, ResponseCodeInfo> = {
  // ========== SUCCESS CODES ==========
  '0': {
    code: '0',
    type: ResponseCodeType.SUCCESS,
    description: 'Transaction completed successfully',
    category: ResponseCodeCategory.SUCCESS,
    isFinalStatus: true,
    requiresFollowup: false,
    affectsSettlement: true,
    canRetry: false,
    customerMessage: 'Payment completed successfully',
    merchantMessage: 'Transaction successful - ready for settlement',
    httpStatusCode: 200
  },
  
  '100': {
    code: '100',
    type: ResponseCodeType.SUCCESS,
    description: 'Partial refund processed successfully',
    category: ResponseCodeCategory.SUCCESS,
    isFinalStatus: true,
    requiresFollowup: false,
    affectsSettlement: true,
    canRetry: false,
    customerMessage: 'Partial refund processed successfully',
    merchantMessage: 'Partial refund completed - settlement adjusted',
    httpStatusCode: 200
  },

  // ========== PENDING STATES ==========
  '1006': {
    code: '1006',
    type: ResponseCodeType.WAITING_BANK,
    description: 'Waiting for bank response',
    category: ResponseCodeCategory.PENDING,
    isFinalStatus: false,
    requiresFollowup: true,
    affectsSettlement: false,
    canRetry: false,
    maxRetries: 0,
    customerMessage: 'Your payment is being processed by the bank. Please wait...',
    merchantMessage: 'Transaction pending - awaiting bank confirmation',
    httpStatusCode: 202
  },

  '1088': {
    code: '1088',
    type: ResponseCodeType.PENDING,
    description: 'Transaction is being processed',
    category: ResponseCodeCategory.PENDING,
    isFinalStatus: false,
    requiresFollowup: true,
    affectsSettlement: false,
    canRetry: false,
    customerMessage: 'Your payment is being processed. Please wait...',
    merchantMessage: 'Transaction in progress - processing with TSP',
    httpStatusCode: 202
  },

  '1200': {
    code: '1200',
    type: ResponseCodeType.WAITING_CUSTOMER,
    description: 'Waiting for customer authentication (2FA/OTP)',
    category: ResponseCodeCategory.PENDING,
    isFinalStatus: false,
    requiresFollowup: true,
    affectsSettlement: false,
    canRetry: false,
    customerMessage: 'Please complete the authentication on your banking app',
    merchantMessage: 'Transaction pending - customer authentication required',
    httpStatusCode: 202
  },

  '1201': {
    code: '1201',
    type: ResponseCodeType.REQUIRES_ACTION,
    description: 'Customer action required (3D Secure)',
    category: ResponseCodeCategory.PENDING,
    isFinalStatus: false,
    requiresFollowup: true,
    affectsSettlement: false,
    canRetry: false,
    customerMessage: 'Please complete the verification with your bank',
    merchantMessage: 'Transaction pending - 3D Secure authentication required',
    httpStatusCode: 202
  },

  // ========== BANK DECLINE CODES ==========
  '1009': {
    code: '1009',
    type: ResponseCodeType.FAILED,
    description: 'Transaction declined by bank',
    category: ResponseCodeCategory.BANK_DECLINE,
    isFinalStatus: true,
    requiresFollowup: false,
    affectsSettlement: false,
    canRetry: true,
    maxRetries: 2,
    retryDelaySeconds: 300,
    customerMessage: 'Payment declined by your bank. Please try another payment method or contact your bank.',
    merchantMessage: 'Transaction declined - bank rejection',
    httpStatusCode: 400
  },

  '1015': {
    code: '1015',
    type: ResponseCodeType.FAILED,
    description: 'Insufficient funds in customer account',
    category: ResponseCodeCategory.BANK_DECLINE,
    isFinalStatus: true,
    requiresFollowup: false,
    affectsSettlement: false,
    canRetry: true,
    maxRetries: 1,
    retryDelaySeconds: 1800, // 30 minutes
    customerMessage: 'Insufficient balance in your account. Please add funds and try again.',
    merchantMessage: 'Transaction failed - insufficient customer funds',
    httpStatusCode: 400
  },

  '1072': {
    code: '1072',
    type: ResponseCodeType.FAILED,
    description: 'Card blocked or expired',
    category: ResponseCodeCategory.BANK_DECLINE,
    isFinalStatus: true,
    requiresFollowup: false,
    affectsSettlement: false,
    canRetry: true,
    maxRetries: 1,
    customerMessage: 'Your card appears to be blocked or expired. Please use another card.',
    merchantMessage: 'Transaction failed - card blocked/expired',
    httpStatusCode: 400
  },

  '1075': {
    code: '1075',
    type: ResponseCodeType.FAILED,
    description: 'Daily transaction limit exceeded',
    category: ResponseCodeCategory.LIMIT_EXCEEDED,
    isFinalStatus: true,
    requiresFollowup: false,
    affectsSettlement: false,
    canRetry: true,
    maxRetries: 1,
    retryDelaySeconds: 86400, // 24 hours
    customerMessage: 'Your daily transaction limit has been exceeded. Please try again tomorrow.',
    merchantMessage: 'Transaction failed - customer daily limit exceeded',
    httpStatusCode: 400
  },

  // ========== SYSTEM ERROR CODES ==========
  '1000': {
    code: '1000',
    type: ResponseCodeType.FAILED,
    description: 'General transaction failure',
    category: ResponseCodeCategory.SYSTEM_ERROR,
    isFinalStatus: true,
    requiresFollowup: false,
    affectsSettlement: false,
    canRetry: true,
    maxRetries: 3,
    retryDelaySeconds: 60,
    customerMessage: 'Transaction failed. Please try again.',
    merchantMessage: 'Transaction failed - general system error',
    httpStatusCode: 500
  },

  '1042': {
    code: '1042',
    type: ResponseCodeType.TIMEOUT,
    description: 'No response from bank - timeout',
    category: ResponseCodeCategory.TIMEOUT,
    isFinalStatus: true,
    requiresFollowup: false,
    affectsSettlement: false,
    canRetry: true,
    maxRetries: 2,
    retryDelaySeconds: 120,
    customerMessage: 'Bank is not responding. Please try again in a few minutes.',
    merchantMessage: 'Transaction timeout - no bank response',
    httpStatusCode: 408
  },

  '1050': {
    code: '1050',
    type: ResponseCodeType.FAILED,
    description: 'TSP integration error',
    category: ResponseCodeCategory.SYSTEM_ERROR,
    isFinalStatus: true,
    requiresFollowup: false,
    affectsSettlement: false,
    canRetry: true,
    maxRetries: 2,
    retryDelaySeconds: 30,
    customerMessage: 'Payment processing temporarily unavailable. Please try again.',
    merchantMessage: 'Transaction failed - TSP integration error',
    httpStatusCode: 502
  },

  '1051': {
    code: '1051',
    type: ResponseCodeType.FAILED,
    description: 'Database connection error',
    category: ResponseCodeCategory.SYSTEM_ERROR,
    isFinalStatus: true,
    requiresFollowup: false,
    affectsSettlement: false,
    canRetry: true,
    maxRetries: 3,
    retryDelaySeconds: 10,
    customerMessage: 'Service temporarily unavailable. Please try again.',
    merchantMessage: 'Transaction failed - database connectivity issue',
    httpStatusCode: 503
  },

  // ========== USER ACTION CODES ==========
  '1030': {
    code: '1030',
    type: ResponseCodeType.ABANDONED,
    description: 'Customer abandoned transaction',
    category: ResponseCodeCategory.USER_ACTION,
    isFinalStatus: true,
    requiresFollowup: false,
    affectsSettlement: false,
    canRetry: true,
    maxRetries: 1,
    customerMessage: 'Payment was not completed. You can try again.',
    merchantMessage: 'Transaction abandoned by customer',
    httpStatusCode: 400
  },

  '1043': {
    code: '1043',
    type: ResponseCodeType.CANCELLED,
    description: 'Transaction cancelled by user',
    category: ResponseCodeCategory.USER_ACTION,
    isFinalStatus: true,
    requiresFollowup: false,
    affectsSettlement: false,
    canRetry: true,
    maxRetries: 1,
    customerMessage: 'Payment cancelled. You can start a new payment.',
    merchantMessage: 'Transaction cancelled by customer',
    httpStatusCode: 400
  },

  '1084': {
    code: '1084',
    type: ResponseCodeType.ABANDONED,
    description: 'Page refreshed during payment',
    category: ResponseCodeCategory.USER_ACTION,
    isFinalStatus: true,
    requiresFollowup: false,
    affectsSettlement: false,
    canRetry: true,
    maxRetries: 1,
    customerMessage: 'Payment session was interrupted. Please try again.',
    merchantMessage: 'Transaction abandoned - page refresh detected',
    httpStatusCode: 400
  },

  '1090': {
    code: '1090',
    type: ResponseCodeType.EXPIRED,
    description: 'Payment intent expired (15 minute limit)',
    category: ResponseCodeCategory.USER_ACTION,
    isFinalStatus: true,
    requiresFollowup: false,
    affectsSettlement: false,
    canRetry: true,
    maxRetries: 1,
    customerMessage: 'Payment session expired. Please create a new payment.',
    merchantMessage: 'Payment intent expired - customer took too long',
    httpStatusCode: 408
  },

  // ========== FRAUD CODES ==========
  '2000': {
    code: '2000',
    type: ResponseCodeType.FAILED,
    description: 'Transaction blocked due to fraud detection',
    category: ResponseCodeCategory.FRAUD,
    isFinalStatus: true,
    requiresFollowup: false,
    affectsSettlement: false,
    canRetry: false,
    customerMessage: 'Transaction blocked for security reasons. Please contact customer support.',
    merchantMessage: 'Transaction blocked - fraud detection triggered',
    httpStatusCode: 403
  },

  '2001': {
    code: '2001',
    type: ResponseCodeType.FAILED,
    description: 'High risk transaction - manual review required',
    category: ResponseCodeCategory.FRAUD,
    isFinalStatus: true,
    requiresFollowup: true,
    affectsSettlement: false,
    canRetry: false,
    customerMessage: 'Payment under review for security. You will be contacted within 24 hours.',
    merchantMessage: 'Transaction flagged for manual fraud review',
    httpStatusCode: 403
  },

  '2010': {
    code: '2010',
    type: ResponseCodeType.FAILED,
    description: 'Velocity limit exceeded',
    category: ResponseCodeCategory.FRAUD,
    isFinalStatus: true,
    requiresFollowup: false,
    affectsSettlement: false,
    canRetry: true,
    maxRetries: 1,
    retryDelaySeconds: 3600, // 1 hour
    customerMessage: 'Too many payment attempts. Please try again later.',
    merchantMessage: 'Transaction failed - velocity limit exceeded',
    httpStatusCode: 429
  },

  // ========== REFUND CODES ==========
  '1031': {
    code: '1031',
    type: ResponseCodeType.REFUNDED,
    description: 'Transaction auto-refunded due to system error',
    category: ResponseCodeCategory.SYSTEM_ERROR,
    isFinalStatus: true,
    requiresFollowup: false,
    affectsSettlement: true, // Negative settlement impact
    canRetry: true,
    maxRetries: 1,
    customerMessage: 'Payment was automatically refunded due to a technical issue.',
    merchantMessage: 'Transaction auto-refunded - system error recovery',
    httpStatusCode: 200
  },

  '1032': {
    code: '1032',
    type: ResponseCodeType.REFUNDED,
    description: 'Transaction refunded by merchant',
    category: ResponseCodeCategory.USER_ACTION,
    isFinalStatus: true,
    requiresFollowup: false,
    affectsSettlement: true, // Negative settlement impact
    canRetry: false,
    customerMessage: 'Payment refunded successfully',
    merchantMessage: 'Refund processed successfully',
    httpStatusCode: 200
  },

  // ========== BUSINESS RULE VIOLATIONS ==========
  '3000': {
    code: '3000',
    type: ResponseCodeType.FAILED,
    description: 'Merchant account suspended',
    category: ResponseCodeCategory.BUSINESS_RULE,
    isFinalStatus: true,
    requiresFollowup: true,
    affectsSettlement: false,
    canRetry: false,
    customerMessage: 'Payment cannot be processed. Please contact the merchant.',
    merchantMessage: 'Account suspended - contact admin',
    httpStatusCode: 403
  },

  '3001': {
    code: '3001',
    type: ResponseCodeType.FAILED,
    description: 'Merchant daily limit exceeded',
    category: ResponseCodeCategory.LIMIT_EXCEEDED,
    isFinalStatus: true,
    requiresFollowup: false,
    affectsSettlement: false,
    canRetry: true,
    maxRetries: 1,
    retryDelaySeconds: 86400, // 24 hours
    customerMessage: 'Merchant has reached daily transaction limit. Please try tomorrow.',
    merchantMessage: 'Daily transaction limit exceeded',
    httpStatusCode: 429
  },

  '3010': {
    code: '3010',
    type: ResponseCodeType.FAILED,
    description: 'Unsupported payment method for merchant',
    category: ResponseCodeCategory.BUSINESS_RULE,
    isFinalStatus: true,
    requiresFollowup: false,
    affectsSettlement: false,
    canRetry: true,
    maxRetries: 1,
    customerMessage: 'This payment method is not accepted. Please choose another option.',
    merchantMessage: 'Unsupported payment method for your account',
    httpStatusCode: 400
  },

  // ========== TIMEOUT CODES ==========
  '4000': {
    code: '4000',
    type: ResponseCodeType.TIMEOUT,
    description: 'TSP request timeout',
    category: ResponseCodeCategory.TIMEOUT,
    isFinalStatus: true,
    requiresFollowup: false,
    affectsSettlement: false,
    canRetry: true,
    maxRetries: 2,
    retryDelaySeconds: 60,
    customerMessage: 'Payment processing timed out. Please try again.',
    merchantMessage: 'TSP timeout - retry recommended',
    httpStatusCode: 408
  },

  '4001': {
    code: '4001',
    type: ResponseCodeType.TIMEOUT,
    description: 'Bank response timeout',
    category: ResponseCodeCategory.TIMEOUT,
    isFinalStatus: true,
    requiresFollowup: false,
    affectsSettlement: false,
    canRetry: true,
    maxRetries: 2,
    retryDelaySeconds: 300, // 5 minutes
    customerMessage: 'Bank is taking longer than expected. Please try again.',
    merchantMessage: 'Bank timeout - safe to retry',
    httpStatusCode: 408
  },

  '4010': {
    code: '4010',
    type: ResponseCodeType.EXPIRED,
    description: 'Payment session expired',
    category: ResponseCodeCategory.TIMEOUT,
    isFinalStatus: true,
    requiresFollowup: false,
    affectsSettlement: false,
    canRetry: true,
    maxRetries: 1,
    customerMessage: 'Payment session expired. Please start a new payment.',
    merchantMessage: 'Payment intent expired - create new intent',
    httpStatusCode: 408
  },

  // ========== COMPLIANCE AND REGULATORY ==========
  '5000': {
    code: '5000',
    type: ResponseCodeType.FAILED,
    description: 'KYC verification required',
    category: ResponseCodeCategory.COMPLIANCE,
    isFinalStatus: true,
    requiresFollowup: true,
    affectsSettlement: false,
    canRetry: false,
    customerMessage: 'Additional verification required. Please complete KYC process.',
    merchantMessage: 'Transaction blocked - customer KYC required',
    httpStatusCode: 403
  },

  '5001': {
    code: '5001',
    type: ResponseCodeType.FAILED,
    description: 'AML (Anti-Money Laundering) check failed',
    category: ResponseCodeCategory.COMPLIANCE,
    isFinalStatus: true,
    requiresFollowup: true,
    affectsSettlement: false,
    canRetry: false,
    customerMessage: 'Transaction under compliance review. Please contact customer support.',
    merchantMessage: 'Transaction blocked - AML compliance issue',
    httpStatusCode: 403
  },

};

/**
 * Enhanced utility functions for response code management
 */
export class ResponseCodeManager {
  /**
   * Get comprehensive response code information
   */
  static getResponseCodeInfo(code: string): ResponseCodeInfo | null {
    return ENHANCED_RESPONSE_CODE_MAPPINGS[code] || null;
  }

  /**
   * Check if transaction is successful
   */
  static isSuccessfulTransaction(responseCode: string): boolean {
    const info = this.getResponseCodeInfo(responseCode);
    return info?.type === ResponseCodeType.SUCCESS;
  }

  /**
   * Check if transaction affects settlement
   */
  static affectsSettlement(responseCode: string): boolean {
    const info = this.getResponseCodeInfo(responseCode);
    return info?.affectsSettlement ?? false;
  }

  /**
   * Check if transaction requires follow-up
   */
  static requiresFollowup(responseCode: string): boolean {
    const info = this.getResponseCodeInfo(responseCode);
    return info?.requiresFollowup ?? false;
  }

  /**
   * Check if transaction can be retried
   */
  static canRetryTransaction(responseCode: string, currentAttempts: number = 0): {
    canRetry: boolean;
    maxRetries: number;
    retryDelaySeconds: number;
    reason?: string;
  } {
    const info = this.getResponseCodeInfo(responseCode);
    
    if (!info?.canRetry) {
      return {
        canRetry: false,
        maxRetries: 0,
        retryDelaySeconds: 0,
        reason: 'Response code does not allow retries'
      };
    }

    const maxRetries = info.maxRetries ?? 1;
    
    if (currentAttempts >= maxRetries) {
      return {
        canRetry: false,
        maxRetries,
        retryDelaySeconds: 0,
        reason: `Maximum retry attempts (${maxRetries}) exceeded`
      };
    }

    return {
      canRetry: true,
      maxRetries,
      retryDelaySeconds: info.retryDelaySeconds ?? 60,
    };
  }

  /**
   * Categorize transaction for comprehensive metrics
   */
  static categorizeTransaction(responseCode: string): {
    isSuccessful: boolean;
    isFailed: boolean;
    isPending: boolean;
    isAbandoned: boolean;
    isTimeout: boolean;
    isExpired: boolean;
    requiresCustomerAction: boolean;
    affectsSettlement: boolean;
    canRetry: boolean;
    category: ResponseCodeCategory;
    type: ResponseCodeType;
  } {
    const info = this.getResponseCodeInfo(responseCode);
    
    return {
      isSuccessful: info?.type === ResponseCodeType.SUCCESS,
      isFailed: info?.type === ResponseCodeType.FAILED,
      isPending: info?.type === ResponseCodeType.PENDING || info?.type === ResponseCodeType.WAITING_BANK,
      isAbandoned: info?.type === ResponseCodeType.ABANDONED,
      isTimeout: info?.type === ResponseCodeType.TIMEOUT,
      isExpired: info?.type === ResponseCodeType.EXPIRED,
      requiresCustomerAction: info?.type === ResponseCodeType.WAITING_CUSTOMER || info?.type === ResponseCodeType.REQUIRES_ACTION,
      affectsSettlement: info?.affectsSettlement ?? false,
      canRetry: info?.canRetry ?? false,
      category: info?.category ?? ResponseCodeCategory.SYSTEM_ERROR,
      type: info?.type ?? ResponseCodeType.FAILED,
    };
  }

  /**
   * Get customer-friendly message
   */
  static getCustomerMessage(responseCode: string): string {
    const info = this.getResponseCodeInfo(responseCode);
    return info?.customerMessage ?? 'Transaction status unknown. Please contact support.';
  }

  /**
   * Get merchant-facing message
   */
  static getMerchantMessage(responseCode: string): string {
    const info = this.getResponseCodeInfo(responseCode);
    return info?.merchantMessage ?? 'Unknown transaction status';
  }

  /**
   * Get appropriate HTTP status code
   */
  static getHttpStatusCode(responseCode: string): number {
    const info = this.getResponseCodeInfo(responseCode);
    return info?.httpStatusCode ?? 500;
  }

  /**
   * Determine if payment intent should transition based on transaction result
   */
  static shouldUpdatePaymentIntent(responseCode: string): {
    shouldUpdate: boolean;
    newIntentStatus: string;
    reason: string;
  } {
    const info = this.getResponseCodeInfo(responseCode);
    
    if (!info) {
      return {
        shouldUpdate: true,
        newIntentStatus: 'requires_payment_method',
        reason: 'Unknown response code - reset intent'
      };
    }

    switch (info.type) {
      case ResponseCodeType.SUCCESS:
        return {
          shouldUpdate: true,
          newIntentStatus: 'succeeded',
          reason: 'Payment completed successfully'
        };

      case ResponseCodeType.FAILED:
        if (info.canRetry) {
          return {
            shouldUpdate: true,
            newIntentStatus: 'requires_payment_method',
            reason: 'Failed transaction - can retry with different method'
          };
        } else {
          return {
            shouldUpdate: true,
            newIntentStatus: 'canceled',
            reason: 'Failed transaction - no retry possible'
          };
        }

      case ResponseCodeType.PENDING:
      case ResponseCodeType.WAITING_BANK:
      case ResponseCodeType.WAITING_CUSTOMER:
      case ResponseCodeType.REQUIRES_ACTION:
        return {
          shouldUpdate: true,
          newIntentStatus: 'processing',
          reason: 'Transaction in progress - waiting for completion'
        };

      case ResponseCodeType.ABANDONED:
      case ResponseCodeType.CANCELLED:
        return {
          shouldUpdate: true,
          newIntentStatus: 'requires_payment_method',
          reason: 'Transaction abandoned - customer can retry'
        };

      case ResponseCodeType.EXPIRED:
        return {
          shouldUpdate: true,
          newIntentStatus: 'canceled',
          reason: 'Payment intent expired'
        };

      case ResponseCodeType.TIMEOUT:
        return {
          shouldUpdate: true,
          newIntentStatus: 'requires_payment_method',
          reason: 'Transaction timed out - safe to retry'
        };

      default:
        return {
          shouldUpdate: false,
          newIntentStatus: '',
          reason: 'No intent update required'
        };
    }
  }

  /**
   * Generate settlement eligibility report
   */
  static getSettlementEligibility(responseCode: string, amount: number): {
    isEligible: boolean;
    settlementAmount: number;
    settlementType: 'credit' | 'debit' | 'none';
    reason: string;
  } {
    const info = this.getResponseCodeInfo(responseCode);
    
    if (!info?.affectsSettlement) {
      return {
        isEligible: false,
        settlementAmount: 0,
        settlementType: 'none',
        reason: 'Transaction does not affect settlement'
      };
    }

    if (info.type === ResponseCodeType.SUCCESS) {
      return {
        isEligible: true,
        settlementAmount: amount,
        settlementType: 'credit',
        reason: 'Successful transaction eligible for settlement'
      };
    }

    if (info.type === ResponseCodeType.REFUNDED) {
      return {
        isEligible: true,
        settlementAmount: -amount, // Negative for refunds
        settlementType: 'debit',
        reason: 'Refund transaction affects settlement negatively'
      };
    }

    return {
      isEligible: false,
      settlementAmount: 0,
      settlementType: 'none',
      reason: 'Transaction not eligible for settlement'
    };
  }
}

/**
 * Payment Intent State Machine (Stripe-Compatible)
 */
export enum PaymentIntentStatus {
  REQUIRES_PAYMENT_METHOD = 'requires_payment_method', // Initial state
  REQUIRES_CONFIRMATION = 'requires_confirmation',     // Payment method attached, needs confirmation
  REQUIRES_ACTION = 'requires_action',                 // Customer action required (3D Secure, etc.)
  PROCESSING = 'processing',                          // Being processed
  REQUIRES_CAPTURE = 'requires_capture',              // Authorized, needs capture (for later)
  CANCELED = 'canceled',                              // Canceled by merchant or expired
  SUCCEEDED = 'succeeded'                             // Successfully completed
}

/**
 * Transaction State Machine (Individual TSP Attempts)
 */
export enum TransactionStatus {
  INITIATED = 'initiated',           // Transaction created
  PROCESSING = 'processing',         // Sent to TSP
  WAITING_BANK = 'waiting_bank',     // TSP forwarded to bank, waiting response
  WAITING_CUSTOMER = 'waiting_customer', // Customer action required
  SUCCESS = 'success',               // Completed successfully
  FAILED = 'failed',                 // Failed permanently
  TIMEOUT = 'timeout',               // Timed out
  ABANDONED = 'abandoned',           // Customer abandoned
  CANCELLED = 'cancelled',           // Cancelled
  REFUNDED = 'refunded'             // Refunded
}

/**
 * Automatic state transition rules
 */
export const STATE_TRANSITION_RULES = {
  paymentIntent: {
    // Timeout rules (5 minutes for fast payment processing)
    expirationTimeoutMs: 5 * 60 * 1000, // 5 minutes
    
    // Auto-transitions based on transaction results
    onTransactionSuccess: PaymentIntentStatus.SUCCEEDED,
    onTransactionTimeout: PaymentIntentStatus.REQUIRES_PAYMENT_METHOD,
    onTransactionAbandoned: PaymentIntentStatus.REQUIRES_PAYMENT_METHOD,
    onAllRetriesExhausted: PaymentIntentStatus.CANCELED,
    
    // Expiration handling
    onExpiration: PaymentIntentStatus.CANCELED,
  },
  
  transaction: {
    // Individual transaction timeouts
    tspTimeoutMs: 30 * 1000,      // 30 seconds TSP timeout
    bankTimeoutMs: 5 * 60 * 1000, // 5 minutes bank timeout
    customerActionTimeoutMs: 10 * 60 * 1000, // 10 minutes customer action timeout
    
    // Auto-transitions
    onTspTimeout: TransactionStatus.TIMEOUT,
    onBankTimeout: TransactionStatus.TIMEOUT,
    onCustomerTimeout: TransactionStatus.ABANDONED,
  }
};
