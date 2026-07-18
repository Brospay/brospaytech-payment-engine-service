/**
 * TSP Assets Reference Configuration
 * 
 * This file serves as a REFERENCE ONLY for supported assets across all TSPs.
 * Actual TSP configurations are stored in the database (tsp_configurations table).
 * 
 * Use this file to:
 * 1. Validate database configurations
 * 2. Provide defaults when creating new TSP configs
 * 3. Reference supported payment methods/currencies during smart routing
 */

// ==================== KINGDOM BANK REFERENCE ====================

export const KINGDOM_BANK_REFERENCE = {
  supportedCurrencies: {
    fiat: [
      'EUR', 'USD', 'GBP', 'CAD', 'AUD', 'SGD', 'INR', 'JPY', 'CNY',
      'SEK', 'NOK', 'DKK', 'CHF', 'PLN', 'CZK', 'HUF', 'RON', 'BGN',
      'BRL', 'MXN', 'ARS', 'CLP', 'COP', 'PEN', 'ZAR', 'TRY', 'RUB',
      'KRW', 'HKD', 'TWD', 'PHP', 'IDR', 'MYR', 'THB', 'VND',
      'PKR', 'BDT', 'LKR', 'NPR', 'EGY', 'NGN', 'KES', 'GHS',
    ],
    crypto: [
      'BTC', 'ETH', 'USDT.ERC20', 'USDT.TRC20', 'USDC.ERC20', 'USDC.TRC20',
      'XRP', 'SOL', 'DOGE', 'ADA',
    ],
  },
  supportedPaymentMethods: [
    'INSTANT_BANK_TRANSFER', 'CRYPTO', 'BANKWIRE', 'PIX', 'SPEI', 'PSE',
    'INTERAC', 'COMMUNITY_INSTANT_BANK_TRANSFER', 'KINGDOM_WALLET',
    'PERFECT_MONEY', 'KINGDOM_CASH', 'CASH_TO_CODE', 'EFECTY_CASH',
    'PAGO_EFECTIVO_BANK', 'MONET_PAY_BANK', 'MONET_PAY_CASH',
    'JETON_CASH', 'PAYCASH_CASH', 'PAYNET_CASH', 'QR_PAYMENT',
  ],
  supportedCountries: [
    // Europe
    'DEU', 'GBR', 'FRA', 'ITA', 'ESP', 'NLD', 'BEL', 'AUT', 'CHE', 'SWE',
    'NOR', 'DNK', 'FIN', 'POL', 'CZE', 'HUN', 'ROU', 'BGR',
    // Americas
    'USA', 'CAN', 'BRA', 'MEX', 'ARG', 'CHL', 'COL', 'PER',
    // Asia
    'IND', 'JPN', 'SGP', 'HKG', 'KOR', 'CHN', 'THA', 'VNM', 'PHL', 'IDN',
    'MYS', 'AUS', 'NZL', 'PAK', 'BGD', 'LKA',
    // Middle East & Africa
    'ARE', 'SAU', 'ZAF', 'EGY', 'NGA', 'KEN', 'TUR',
  ],
};

// ==================== PAYTARA REFERENCE ====================

export const PAYTARA_REFERENCE = {
  supportedCurrencies: {
    fiat: ['INR'],
    crypto: [],
  },
  supportedPaymentMethods: ['UPI', 'NET_BANKING', 'CARD', 'WALLET'],
  supportedCountries: ['IND'],
};

// ==================== RAZORPAY REFERENCE ====================

export const RAZORPAY_REFERENCE = {
  supportedCurrencies: {
    fiat: ['INR'],
    crypto: [],
  },
  supportedPaymentMethods: ['UPI', 'NET_BANKING', 'CARD', 'WALLET', 'EMI'],
  supportedCountries: ['IND'],
};

// ==================== STRIPE REFERENCE ====================

export const STRIPE_REFERENCE = {
  supportedCurrencies: {
    fiat: [
      'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'SGD', 'JPY', 'CNY', 'CHF',
      'SEK', 'NOK', 'DKK', 'PLN', 'BRL', 'MXN', 'HKD', 'KRW', 'INR',
    ],
    crypto: [],
  },
  supportedPaymentMethods: ['CARD', 'BANK_TRANSFER', 'WALLET'],
  supportedCountries: ['*'],
};

export function isCryptoCurrency(currency: string): boolean {
  const cryptoCurrencies = ['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL', 'DOGE', 'ADA', 'TRX', 'BNB'];
  return cryptoCurrencies.includes(currency.toUpperCase());
}

export function isFiatCurrency(currency: string): boolean {
  return (
    KINGDOM_BANK_REFERENCE.supportedCurrencies.fiat.includes(currency as any) ||
    PAYTARA_REFERENCE.supportedCurrencies.fiat.includes(currency as any) ||
    RAZORPAY_REFERENCE.supportedCurrencies.fiat.includes(currency as any) ||
    STRIPE_REFERENCE.supportedCurrencies.fiat.includes(currency as any)
  );
}

/**
 * Map Valorapays currency codes to Kingdom Bank format
 * Kingdom Bank requires network-specific currency codes for stablecoins
 * Default network: TRC20 (lower gas fees, faster confirmation)
 */
export function mapToKingdomBankCurrency(currency: string, network?: 'ERC20' | 'TRC20'): string {
  const currencyUpper = currency.toUpperCase();
  
  if (currencyUpper === 'USDT' || currencyUpper === 'USDC') {
    const selectedNetwork = network || 'TRC20';
    return `${currencyUpper}.${selectedNetwork}`;
  }
  
  const allKingdomBankCrypto = KINGDOM_BANK_REFERENCE.supportedCurrencies.crypto;
  
  if (allKingdomBankCrypto.includes(currencyUpper)) {
    return currencyUpper;
  }
  
  const unsupportedCurrencies = ['BNB', 'TRX'];
  if (unsupportedCurrencies.includes(currencyUpper)) {
    throw new Error(`Currency ${currency} is not supported by Kingdom Bank. Supported crypto: ${allKingdomBankCrypto.join(', ')}`);
  }
  
  return currencyUpper;
}

/**
 * Map Kingdom Bank currency format back to Valorapays format
 */
export function mapFromKingdomBankCurrency(kingdomBankCurrency: string): { 
  currency: string; 
  network?: 'ERC20' | 'TRC20' 
} {
  const parts = kingdomBankCurrency.split('.');
  
  if (parts.length === 2) {
    return {
      currency: parts[0],
      network: parts[1] as 'ERC20' | 'TRC20',
    };
  }
  
  return { currency: kingdomBankCurrency };
}

export function getTSPReference(provider: string): typeof KINGDOM_BANK_REFERENCE | null {
  const references = {
    kingdom_bank: KINGDOM_BANK_REFERENCE,
    paytara: PAYTARA_REFERENCE,
    razorpay: RAZORPAY_REFERENCE,
    stripe: STRIPE_REFERENCE,
  };
  
  return references[provider.toLowerCase()] || null;
}

