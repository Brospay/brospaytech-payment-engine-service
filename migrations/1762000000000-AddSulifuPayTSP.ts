import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSulifuPayTSP1762000000000 implements MigrationInterface {
  name = 'AddSulifuPayTSP1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Insert Sulifu Pay TSP configuration for sandbox environment
    await queryRunner.query(`
      INSERT INTO tsp_configurations (
        "providerName",
        "displayName",
        environment,
        "isActive",
        priority,
        credentials,
        configuration,
        "supportedCurrencies",
        "supportedPaymentMethods",
        "supportedCountries",
        "processingFeePercentage",
        "processingFeeFixed",
        "supportsInstantPayouts",
        "supportsRefunds",
        "supportsRecurring",
        "timeoutMs",
        "maxRetries",
        metadata,
        "createdBy",
        "createdAt",
        "updatedAt"
      ) VALUES (
        'sulifu_pay',
        'Sulifu Pay',
        'sandbox',
        true,
        90,
        '{"mer_no": "REPLACE_WITH_MERCHANT_NO", "api_key": "REPLACE_WITH_API_KEY", "api_url": "https://sandbox.sulifu77.com"}'::jsonb,
        '{
          "retry_enabled": true,
          "retry_count": 3,
          "retry_delay_ms": 2000,
          "webhook_retry_enabled": true,
          "webhook_retry_count": 5,
          "webhook_retry_interval_minutes": 5
        }'::jsonb,
        ARRAY['USD', 'EUR', 'GBP', 'INR', 'BRL', 'MXN', 'JPY', 'CNY', 'SGD', 'AED', 'HKD', 'KRW', 'IDR', 'THB', 'VND', 'PHP'],
        ARRAY['BankToBank', 'PIXPay', 'AutoBank', 'QR', 'CreditCard', 'Alipay', 'WeChat', 'FasterPayment', 'Walltet', 'QRIS', 'OVO', 'DANA', 'ShopeePay', 'GoPay', 'KBZpay', 'WavePay'],
        ARRAY['BR', 'IN', 'CN', 'HK', 'SG', 'AE', 'US', 'MX', 'JP', 'KR', 'ID', 'TH', 'VN', 'PH', 'MY', 'KH', 'LA', 'MM', 'TW', 'AU'],
        2.50,
        0.00,
        true,
        false,
        false,
        60000,
        3,
        '{
          "supports_multi_currency": true,
          "supports_crypto": true,
          "supports_fiat_on_ramp": true,
          "supports_fiat_off_ramp": true,
          "supports_pix": true,
          "supports_fps": true,
          "supports_e_wallets": true,
          "real_time_settlement": false,
          "settlement_period_days": 1,
          "regions": ["Asia", "Latin America", "Middle East", "Oceania"],
          "documentation_url": "https://docs.sulifu77.com",
          "support_email": "support@sulifu77.com"
        }'::jsonb,
        'system',
        NOW(),
        NOW()
      )
      ON CONFLICT ("providerName", environment) DO NOTHING;
    `);

    // Insert Sulifu Pay TSP configuration for production environment
    await queryRunner.query(`
      INSERT INTO tsp_configurations (
        "providerName",
        "displayName",
        environment,
        "isActive",
        priority,
        credentials,
        configuration,
        "supportedCurrencies",
        "supportedPaymentMethods",
        "supportedCountries",
        "processingFeePercentage",
        "processingFeeFixed",
        "supportsInstantPayouts",
        "supportsRefunds",
        "supportsRecurring",
        "timeoutMs",
        "maxRetries",
        metadata,
        "createdBy",
        "createdAt",
        "updatedAt"
      ) VALUES (
        'sulifu_pay',
        'Sulifu Pay',
        'production',
        false,
        90,
        '{"mer_no": "REPLACE_WITH_MERCHANT_NO", "api_key": "REPLACE_WITH_API_KEY", "api_url": "https://api.sulifu77.com"}'::jsonb,
        '{
          "retry_enabled": true,
          "retry_count": 3,
          "retry_delay_ms": 2000,
          "webhook_retry_enabled": true,
          "webhook_retry_count": 5,
          "webhook_retry_interval_minutes": 5
        }'::jsonb,
        ARRAY['USD', 'EUR', 'GBP', 'INR', 'BRL', 'MXN', 'JPY', 'CNY', 'SGD', 'AED', 'HKD', 'KRW', 'IDR', 'THB', 'VND', 'PHP'],
        ARRAY['BankToBank', 'PIXPay', 'AutoBank', 'QR', 'CreditCard', 'Alipay', 'WeChat', 'FasterPayment', 'Walltet', 'QRIS', 'OVO', 'DANA', 'ShopeePay', 'GoPay', 'KBZpay', 'WavePay'],
        ARRAY['BR', 'IN', 'CN', 'HK', 'SG', 'AE', 'US', 'MX', 'JP', 'KR', 'ID', 'TH', 'VN', 'PH', 'MY', 'KH', 'LA', 'MM', 'TW', 'AU'],
        2.50,
        0.00,
        true,
        false,
        false,
        60000,
        3,
        '{
          "supports_multi_currency": true,
          "supports_crypto": true,
          "supports_fiat_on_ramp": true,
          "supports_fiat_off_ramp": true,
          "supports_pix": true,
          "supports_fps": true,
          "supports_e_wallets": true,
          "real_time_settlement": false,
          "settlement_period_days": 1,
          "regions": ["Asia", "Latin America", "Middle East", "Oceania"],
          "documentation_url": "https://docs.sulifu77.com",
          "support_email": "support@sulifu77.com"
        }'::jsonb,
        'system',
        NOW(),
        NOW()
      )
      ON CONFLICT ("providerName", environment) DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove Sulifu Pay TSP configurations
    await queryRunner.query(`
      DELETE FROM tsp_configurations 
      WHERE "providerName" = 'sulifu_pay';
    `);
  }
}

