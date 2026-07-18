/**
 * TSP (Third-Party Service Provider) Provider Names Enum
 * 
 * Defines supported payment gateway providers in the Valorapays system.
 * This enum ensures consistency across backend services and frontend applications.
 */
export enum TSPProvider {
  PAYTARA = 'paytara',
  RAZORPAY = 'razorpay',
  STRIPE = 'stripe',
  KINGDOM_BANK = 'kingdom_bank',
  SULIFU_PAY = 'sulifu_pay',
  CASHFREE = 'cashfree',
  PHONEPE = 'phonepe',
  PAYU = 'payu',
  PAYAZA = 'payaza',
}

export const TSP_PROVIDER_DISPLAY_NAMES: Record<TSPProvider, string> = {
  [TSPProvider.PAYTARA]: 'Paytara',
  [TSPProvider.RAZORPAY]: 'Razorpay',
  [TSPProvider.STRIPE]: 'Stripe',
  [TSPProvider.KINGDOM_BANK]: 'Kingdom Bank',
  [TSPProvider.SULIFU_PAY]: 'Sulifu Pay',
  [TSPProvider.CASHFREE]: 'Cashfree',
  [TSPProvider.PHONEPE]: 'PhonePe',
  [TSPProvider.PAYU]: 'PayU',
  [TSPProvider.PAYAZA]: 'Payaza',
};

/**
 * TSP Provider Categories
 * Groups providers by type for better organization
 */
export const TSP_PROVIDER_CATEGORIES = {
  indian: [
    TSPProvider.PAYTARA,
    TSPProvider.RAZORPAY,
    TSPProvider.KINGDOM_BANK,
    TSPProvider.CASHFREE,
    TSPProvider.PHONEPE,
    TSPProvider.PAYU,
  ],
  international: [
    TSPProvider.STRIPE,
  ],
  multi_region: [
    TSPProvider.SULIFU_PAY,
  ],
  african: [
    TSPProvider.PAYAZA,
  ],
};

/**
 * Get all TSP providers as array
 */
export const getAllTSPProviders = (): TSPProvider[] => {
  return Object.values(TSPProvider);
};

/**
 * Get TSP providers by category
 */
export const getTSPProvidersByCategory = (category: keyof typeof TSP_PROVIDER_CATEGORIES): TSPProvider[] => {
  return TSP_PROVIDER_CATEGORIES[category];
};

/**
 * Get display name for a TSP provider
 */
export const getTSPProviderDisplayName = (provider: TSPProvider): string => {
  return TSP_PROVIDER_DISPLAY_NAMES[provider];
};

/**
 * Check if a provider is valid
 */
export const isValidTSPProvider = (provider: string): provider is TSPProvider => {
  return Object.values(TSPProvider).includes(provider as TSPProvider);
};
