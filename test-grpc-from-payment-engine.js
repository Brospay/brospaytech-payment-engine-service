const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

// Test from payment engine directory to use the same proto file
const PROTO_PATH = path.join(__dirname, 'src/proto/merchant.proto');
const MERCHANT_SERVICE_URL = 'localhost:50002';
const MERCHANT_ID_STRING = 'mer_db25ab2b28e6ebda';

async function testPaymentEngineToMerchant() {
  console.log('🧪 Testing Payment Engine → Merchant Service gRPC');
  console.log('Using Payment Engine Proto:', PROTO_PATH);
  console.log('');

  try {
    // Load proto definition (same as payment engine would use)
    const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      arrays: true,
    });
    const merchantProto = grpc.loadPackageDefinition(packageDefinition).merchant;

    // Create gRPC client
    const client = new merchantProto.MerchantService(
      MERCHANT_SERVICE_URL,
      grpc.credentials.createInsecure()
    );
    
    console.log('✅ gRPC Client Created (using payment engine proto)');
    console.log('');

    // Test GetMerchant first
    console.log('1️⃣ Testing GetMerchant...');
    const merchantRequest = { merchant_id_string: MERCHANT_ID_STRING };
    
    const merchantResponse = await new Promise((resolve, reject) => {
      client.GetMerchant(merchantRequest, (error, response) => {
        if (error) {
          return reject(error);
        }
        resolve(response);
      });
    });

    if (merchantResponse.success && merchantResponse.merchant) {
      console.log('✅ GetMerchant Success');
      console.log(`📍 Merchant ID: ${merchantResponse.merchant.id}`);
      console.log('');

      // Test CreateCustomer with string merchant_id
      console.log('2️⃣ Testing CreateCustomer with string merchant_id...');
      const customerRequest = {
        email: 'payment.engine.test@example.com',
        phone: '+1234567890',
        first_name: 'Payment',
        last_name: 'Engine',
        country: 'US',
        ip_address: '127.0.0.1',
        device_fingerprint: 'payment_engine_test',
        merchant_id: MERCHANT_ID_STRING, // Use string directly
        metadata: {
          'testType': 'payment_engine_proto_test'
        },
      };

      console.log('Customer Request:', JSON.stringify(customerRequest, null, 2));

      const customerResponse = await new Promise((resolve, reject) => {
        client.CreateCustomer(customerRequest, (error, response) => {
          if (error) {
            return reject(error);
          }
          resolve(response);
        });
      });

      if (customerResponse.success) {
        console.log('✅ CreateCustomer Success!');
        console.log(`📍 Customer ID: ${customerResponse.customer.customerId}`);
        console.log('');
        console.log('🎉 Payment Engine → Merchant Service gRPC Working!');
      } else {
        console.log('❌ CreateCustomer Failed');
        console.log(`Error: ${customerResponse.errorCode} - ${customerResponse.message}`);
      }
    } else {
      console.log('❌ GetMerchant Failed');
    }

  } catch (error) {
    console.error('❌ gRPC Test Failed:', error.message);
    if (error.code) {
      console.error(`gRPC Error Code: ${error.code}`);
    }
    if (error.details) {
      console.error(`gRPC Error Details: ${error.details}`);
    }
  }
}

// Run the test
testPaymentEngineToMerchant().then(() => {
  console.log('\n✅ Test completed');
  process.exit(0);
}).catch((error) => {
  console.error('\n❌ Test failed:', error.message);
  process.exit(1);
});
