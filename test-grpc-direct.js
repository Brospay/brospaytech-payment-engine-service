const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Load the merchant service proto
const PROTO_PATH = path.join(__dirname, 'src/proto/merchant.proto');

console.log('🔍 Testing Direct gRPC Call to Merchant Service');
console.log('Proto path:', PROTO_PATH);

// Load proto definition
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  arrays: true,
});

const merchant = grpc.loadPackageDefinition(packageDefinition).merchant;

// Create client
const client = new merchant.MerchantService('localhost:50002', grpc.credentials.createInsecure());

console.log('✅ gRPC Client Created');
console.log('Available methods:', Object.keys(client.__proto__).filter(key => !key.startsWith('_')));

// Test GetMerchant call
const request = {
  merchant_id_string: 'mer_db25ab2b28e6ebda'
};

console.log('\n📞 Calling GetMerchant with request:', JSON.stringify(request));

client.GetMerchant(request, (error, response) => {
  console.log('\n📥 Response received:');
  
  if (error) {
    console.error('❌ gRPC Error:', error.message);
    console.error('Error details:', error.details);
    console.error('Error code:', error.code);
    console.error('Error metadata:', error.metadata);
  } else {
    console.log('✅ Success! Response:', JSON.stringify(response, null, 2));
  }
  
  // Close client
  client.close();
  process.exit(0);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.error('⏰ Timeout - No response received after 10 seconds');
  client.close();
  process.exit(1);
}, 10000);
