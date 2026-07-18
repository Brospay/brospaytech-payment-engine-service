-- Migration: Add Payaza TSP Configuration
-- Description: Adds Payaza payment gateway to the payment engine
-- Date: 2025-11-06
-- Author: ZenPay Team

-- ============================================
-- SANDBOX ENVIRONMENT CONFIGURATION
-- ============================================
-- This configuration is for testing purposes
-- Replace placeholder credentials with actual sandbox credentials

INSERT INTO tsp_configurations (
  provider_name,
  display_name,
  environment,
  is_active,
  priority,
  credentials,
  configuration,
  min_amount,
  max_amount,
  supported_currencies,
  supported_payment_methods,
  supported_countries,
  processing_fee_percentage,
  processing_fee_fixed,
  supports_instant_payouts,
  supports_refunds,
  supports_recurring,
  timeout_ms,
  max_retries,
  base_url,
  webhook_url,
  health_status,
  last_health_check,
  metadata,
  created_by,
  created_at,
  updated_at
) VALUES (
  'payaza',
  'Payaza',
  'sandbox',
  true,  -- Activate sandbox for testing
  90,    -- Priority (lower than primary TSPs initially)
  jsonb_build_object(
    'merchant_id', 'REPLACE_WITH_YOUR_SANDBOX_MERCHANT_ID',
    'api_key', 'REPLACE_WITH_YOUR_SANDBOX_API_KEY',
    'encryption_key', 'REPLACE_WITH_YOUR_SANDBOX_ENCRYPTION_KEY',
    'base_url', 'https://api-sandbox.payaza.africa',
    'webhook_secret', 'REPLACE_WITH_YOUR_SANDBOX_WEBHOOK_SECRET',
    'transaction_pin', 'REPLACE_WITH_YOUR_SANDBOX_TRANSACTION_PIN'
  ),
  jsonb_build_object(
    'supports_3ds', true,
    'supports_card_payments', true,
    'supports_bank_transfers', true,
    'supports_mobile_money', false,
    'supports_virtual_accounts', false,
    'region', 'africa',
    'primary_country', 'NG',
    'business_model', 'B2B',
    'settlement_cycle', 'T+1'
  ),
  100.00,           -- Min amount: 100 NGN (or currency equivalent)
  10000000.00,      -- Max amount: 10M NGN (or currency equivalent)
  ARRAY['NGN', 'GHS', 'KES', 'UGX', 'ZAR'],  -- Supported currencies
  ARRAY['card', 'bank_transfer', 'mobile_money'],  -- Payment methods
  ARRAY['NG', 'GH', 'KE', 'UG', 'ZA'],  -- Supported countries
  2.50,             -- Processing fee: 2.5%
  100.00,           -- Fixed fee: 100 NGN
  true,             -- Supports instant payouts
  true,             -- Supports refunds
  false,            -- Recurring payments (not yet implemented)
  30000,            -- Timeout: 30 seconds
  3,                -- Max retries: 3
  'https://api-sandbox.payaza.africa',
  'https://your-domain.com/webhooks/payaza',  -- REPLACE with your webhook URL
  'pending',        -- Initial health status
  NULL,             -- Last health check
  jsonb_build_object(
    'integration_version', '1.0.0',
    'documentation', 'https://docs.payaza.africa',
    'support_email', 'support@payaza.africa',
    'features', ARRAY['card_payments', 'bank_transfers', 'refunds', 'chargebacks'],
    'test_cards', jsonb_build_object(
      'success', '5399834444444446',
      'failed', '5399835555555556',
      'insufficient_funds', '5399836666666666'
    )
  ),
  'system',         -- Created by
  NOW(),
  NOW()
)
ON CONFLICT (provider_name, environment) 
DO UPDATE SET
  display_name = EXCLUDED.display_name,
  is_active = EXCLUDED.is_active,
  priority = EXCLUDED.priority,
  credentials = EXCLUDED.credentials,
  configuration = EXCLUDED.configuration,
  min_amount = EXCLUDED.min_amount,
  max_amount = EXCLUDED.max_amount,
  supported_currencies = EXCLUDED.supported_currencies,
  supported_payment_methods = EXCLUDED.supported_payment_methods,
  supported_countries = EXCLUDED.supported_countries,
  processing_fee_percentage = EXCLUDED.processing_fee_percentage,
  processing_fee_fixed = EXCLUDED.processing_fee_fixed,
  supports_instant_payouts = EXCLUDED.supports_instant_payouts,
  supports_refunds = EXCLUDED.supports_refunds,
  supports_recurring = EXCLUDED.supports_recurring,
  timeout_ms = EXCLUDED.timeout_ms,
  max_retries = EXCLUDED.max_retries,
  base_url = EXCLUDED.base_url,
  webhook_url = EXCLUDED.webhook_url,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

-- ============================================
-- PRODUCTION ENVIRONMENT CONFIGURATION
-- ============================================
-- This configuration is for live transactions
-- Keep is_active = false until ready for production
-- Replace placeholder credentials with actual production credentials

INSERT INTO tsp_configurations (
  provider_name,
  display_name,
  environment,
  is_active,
  priority,
  credentials,
  configuration,
  min_amount,
  max_amount,
  supported_currencies,
  supported_payment_methods,
  supported_countries,
  processing_fee_percentage,
  processing_fee_fixed,
  supports_instant_payouts,
  supports_refunds,
  supports_recurring,
  timeout_ms,
  max_retries,
  base_url,
  webhook_url,
  health_status,
  last_health_check,
  metadata,
  created_by,
  created_at,
  updated_at
) VALUES (
  'payaza',
  'Payaza',
  'production',
  false,  -- IMPORTANT: Keep false until ready for production
  95,     -- Higher priority for production (if primary TSP)
  jsonb_build_object(
    'merchant_id', 'REPLACE_WITH_YOUR_PRODUCTION_MERCHANT_ID',
    'api_key', 'REPLACE_WITH_YOUR_PRODUCTION_API_KEY',
    'encryption_key', 'REPLACE_WITH_YOUR_PRODUCTION_ENCRYPTION_KEY',
    'base_url', 'https://api.payaza.africa',
    'webhook_secret', 'REPLACE_WITH_YOUR_PRODUCTION_WEBHOOK_SECRET',
    'transaction_pin', 'REPLACE_WITH_YOUR_PRODUCTION_TRANSACTION_PIN'
  ),
  jsonb_build_object(
    'supports_3ds', true,
    'supports_card_payments', true,
    'supports_bank_transfers', true,
    'supports_mobile_money', false,
    'supports_virtual_accounts', false,
    'region', 'africa',
    'primary_country', 'NG',
    'business_model', 'B2B',
    'settlement_cycle', 'T+1'
  ),
  100.00,           -- Min amount: 100 NGN
  10000000.00,      -- Max amount: 10M NGN
  ARRAY['NGN', 'GHS', 'KES', 'UGX', 'ZAR'],
  ARRAY['card', 'bank_transfer', 'mobile_money'],
  ARRAY['NG', 'GH', 'KE', 'UG', 'ZA'],
  2.50,             -- Processing fee: 2.5%
  100.00,           -- Fixed fee: 100 NGN
  true,
  true,
  false,
  30000,
  3,
  'https://api.payaza.africa',
  'https://your-production-domain.com/webhooks/payaza',  -- REPLACE with your production webhook URL
  'pending',
  NULL,
  jsonb_build_object(
    'integration_version', '1.0.0',
    'documentation', 'https://docs.payaza.africa',
    'support_email', 'support@payaza.africa',
    'features', ARRAY['card_payments', 'bank_transfers', 'refunds', 'chargebacks']
  ),
  'system',
  NOW(),
  NOW()
)
ON CONFLICT (provider_name, environment) 
DO UPDATE SET
  display_name = EXCLUDED.display_name,
  -- Don't update is_active in production - manual change required
  priority = EXCLUDED.priority,
  credentials = EXCLUDED.credentials,
  configuration = EXCLUDED.configuration,
  min_amount = EXCLUDED.min_amount,
  max_amount = EXCLUDED.max_amount,
  supported_currencies = EXCLUDED.supported_currencies,
  supported_payment_methods = EXCLUDED.supported_payment_methods,
  supported_countries = EXCLUDED.supported_countries,
  processing_fee_percentage = EXCLUDED.processing_fee_percentage,
  processing_fee_fixed = EXCLUDED.processing_fee_fixed,
  supports_instant_payouts = EXCLUDED.supports_instant_payouts,
  supports_refunds = EXCLUDED.supports_refunds,
  supports_recurring = EXCLUDED.supports_recurring,
  timeout_ms = EXCLUDED.timeout_ms,
  max_retries = EXCLUDED.max_retries,
  base_url = EXCLUDED.base_url,
  webhook_url = EXCLUDED.webhook_url,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these queries to verify the configuration

-- Check if Payaza configurations were added
SELECT 
  provider_name,
  display_name,
  environment,
  is_active,
  priority,
  supported_currencies,
  created_at
FROM tsp_configurations
WHERE provider_name = 'payaza'
ORDER BY environment;

-- Check credentials (be careful in production!)
SELECT 
  provider_name,
  environment,
  credentials->>'merchant_id' as merchant_id,
  credentials->>'base_url' as base_url,
  CASE 
    WHEN credentials->>'api_key' IS NOT NULL THEN '***SET***'
    ELSE 'NOT SET'
  END as api_key_status,
  CASE 
    WHEN credentials->>'encryption_key' IS NOT NULL THEN '***SET***'
    ELSE 'NOT SET'
  END as encryption_key_status
FROM tsp_configurations
WHERE provider_name = 'payaza';

-- ============================================
-- POST-MIGRATION STEPS
-- ============================================
-- After running this migration:
-- 
-- 1. Update credentials with actual Payaza credentials
-- 2. Update webhook URLs with your actual domain
-- 3. Test sandbox configuration
-- 4. Run health check: GET /api/tsp/payaza/health
-- 5. Test card payment in sandbox
-- 6. Test refund in sandbox
-- 7. Test transfer in sandbox
-- 8. Verify webhook signature validation
-- 9. Monitor logs for any issues
-- 10. When ready, activate production configuration
--
-- To update credentials:
-- UPDATE tsp_configurations 
-- SET credentials = jsonb_set(
--   credentials, 
--   '{merchant_id}', 
--   '"your_actual_merchant_id"'
-- )
-- WHERE provider_name = 'payaza' AND environment = 'sandbox';
--
-- To activate production:
-- UPDATE tsp_configurations 
-- SET is_active = true, updated_at = NOW()
-- WHERE provider_name = 'payaza' AND environment = 'production';

-- ============================================
-- ROLLBACK (if needed)
-- ============================================
-- To remove Payaza configuration:
-- DELETE FROM tsp_configurations WHERE provider_name = 'payaza';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- Payaza TSP has been added to the payment engine
-- Remember to update credentials before testing!





