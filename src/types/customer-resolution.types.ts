/**
 * Customer Resolution Types
 */

import { CustomerResolutionData, RiskProfile } from './common/customer.types';

export interface CustomerResolutionResult {
  success: boolean;
  customerId?: string;
  customer?: CustomerResolutionData;
  error?: {
    code: string;
    message: string;
  };
}

// CustomerDetails is imported from payment-intent.types.ts to avoid duplication
