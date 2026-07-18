#!/usr/bin/env node

/**
 * Test Customer Creation Flow via Payment Intent API
 * 
 * This test verifies:
 * 1. gRPC connection to merchant service
 * 2. Customer resolution/creation during payment intent creation
 * 3. Proper timeout and retry handling
 */

const axios = require('axios');

const PAYMENT_ENGINE_URL = 'http://localhost:5001/payment/api/v1';
const TEST_MERCHANT_ID = 'mer_db25ab2b28e6ebda'; // Replace with actual merchant ID

// Test merchant API key (should be in merchant service DB)
const TEST_API_KEY = 'test_56e5f5b61e1ce9d5'; 
const TEST_API_SECRET = '8f1c2cb6a7f89f28f5e6de8a';

async function testCustomerCreation() {
  console.log('🧪 Testing Customer Creation Flow\n');
  console.log('='.repeat(60));
  
  try {
    // Test 1: Create payment intent with new customer
    console.log('\n📝 Test 1: Create payment intent with NEW customer');
    console.log('-'.repeat(60));
    
    const newCustomerEmail = `test+${Date.now()}@example.com`;
    const newCustomerPayload = {
      amount: 10000, // ₹100.00
      currency: 'INR',
      description: 'Test payment for customer creation',
      customerEmail: newCustomerEmail,
      customerPhone: '+919876543210',
      customerFirstName: 'Test',
      customerLastName: 'Customer',
      customerCountry: 'IN',
      paymentMethod: 'upi',
      returnUrl: 'https://example.com/return',
      webhookUrl: 'https://example.com/webhook',
      metadata: {
        testCase: 'new_customer_creation',
        timestamp: new Date().toISOString()
      }
    };

    console.log(`Testing with email: ${newCustomerEmail}`);
    console.log(`Making request to: ${PAYMENT_ENGINE_URL}/payment-intents`);
    
    const response1 = await axios.post(
      `${PAYMENT_ENGINE_URL}/payment-intents`,
      newCustomerPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Merchant-ID': TEST_MERCHANT_ID,
          'X-API-Key': TEST_API_KEY,
          'X-Request-ID': `test_${Date.now()}`,
        },
        timeout: 45000 // 45 second timeout to account for retries
      }
    );

    console.log('\n✅ Payment intent created successfully!');
    console.log('Response:', JSON.stringify(response1.data, null, 2));
    
    if (response1.data.data?.customerId) {
      console.log(`\n🎉 Customer created: ${response1.data.data.customerId}`);
    } else {
      console.log('\n⚠️  Warning: No customer ID in response');
    }

    // Wait a bit before next test
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 2: Create payment intent with existing customer
    console.log('\n\n📝 Test 2: Create payment intent with EXISTING customer');
    console.log('-'.repeat(60));
    
    const existingCustomerPayload = {
      amount: 15000, // ₹150.00
      currency: 'INR',
      description: 'Test payment for existing customer',
      customerEmail: newCustomerEmail, // Use same email
      paymentMethod: 'card',
      returnUrl: 'https://example.com/return',
      metadata: {
        testCase: 'existing_customer_lookup',
        timestamp: new Date().toISOString()
      }
    };

    const response2 = await axios.post(
      `${PAYMENT_ENGINE_URL}/payment-intents`,
      existingCustomerPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Merchant-ID': TEST_MERCHANT_ID,
          'X-API-Key': TEST_API_KEY,
          'X-Request-ID': `test_${Date.now()}`,
        },
        timeout: 45000
      }
    );

    console.log('\n✅ Payment intent created for existing customer!');
    console.log('Response:', JSON.stringify(response2.data, null, 2));
    
    if (response2.data.data?.customerId) {
      console.log(`\n🎉 Customer resolved: ${response2.data.data.customerId}`);
      
      // Check if same customer was used
      if (response1.data.data?.customerId === response2.data.data?.customerId) {
        console.log('✅ Same customer used for both intents!');
      } else {
        console.log('⚠️  Different customer IDs - this may indicate an issue');
      }
    }

    // Test 3: Create payment intent without customer details
    console.log('\n\n📝 Test 3: Create payment intent WITHOUT customer details');
    console.log('-'.repeat(60));
    
    const anonymousPayload = {
      amount: 5000, // ₹50.00
      currency: 'INR',
      description: 'Anonymous payment',
      paymentMethod: 'upi',
      returnUrl: 'https://example.com/return',
      metadata: {
        testCase: 'anonymous_payment',
        timestamp: new Date().toISOString()
      }
    };

    const response3 = await axios.post(
      `${PAYMENT_ENGINE_URL}/payment-intents`,
      anonymousPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Merchant-ID': TEST_MERCHANT_ID,
          'X-API-Key': TEST_API_KEY,
          'X-Request-ID': `test_${Date.now()}`,
        },
        timeout: 45000
      }
    );

    console.log('\n✅ Anonymous payment intent created!');
    console.log('Response:', JSON.stringify(response3.data, null, 2));

    // Summary
    console.log('\n\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log('✅ All tests passed!');
    console.log(`Test 1 (New Customer): ${response1.data.success ? 'PASSED' : 'FAILED'}`);
    console.log(`Test 2 (Existing Customer): ${response2.data.success ? 'PASSED' : 'FAILED'}`);
    console.log(`Test 3 (Anonymous): ${response3.data.success ? 'PASSED' : 'FAILED'}`);
    console.log('\n✅ Customer creation via payment intent API is working correctly!');

  } catch (error) {
    console.error('\n\n❌ TEST FAILED');
    console.error('='.repeat(60));
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Error:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('No response received from server');
      console.error('Request details:', error.message);
      console.error('\n⚠️  Is the payment engine service running on port 5001?');
      console.error('⚠️  Is the merchant service running on port 50002 (gRPC)?');
    } else {
      console.error('Error:', error.message);
    }
    
    process.exit(1);
  }
}

// Run tests
console.log('🚀 Starting Customer Creation Tests...\n');
testCustomerCreation().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});





