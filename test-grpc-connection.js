const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

async function testGrpcConnection() {
  console.log('🔧 Testing gRPC Connection to Merchant Service\n');
  
  try {
    // Load proto file
    const PROTO_PATH = path.join(__dirname, 'src/proto/merchant.proto');
    console.log('📄 Loading proto file from:', PROTO_PATH);
    
    const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true
    });
    
    const merchantProto = grpc.loadPackageDefinition(packageDefinition).merchant;
    console.log('✅ Proto file loaded successfully\n');
    
    // Create gRPC client
    const client = new merchantProto.MerchantService(
      'localhost:50002',
      grpc.credentials.createInsecure(),
      {
        'grpc.max_receive_message_length': 4 * 1024 * 1024,
        'grpc.max_send_message_length': 4 * 1024 * 1024,
      }
    );
    
    console.log('🔌 gRPC client created\n');
    
    // Test connection with GetMerchant call
    console.log('📞 Calling GetMerchant...');
    const request = {
      merchant_id: 0,
      merchant_id_string: 'mer_db25ab2b28e6ebda'
    };
    
    console.log('Request:', JSON.stringify(request, null, 2));
    
    const deadline = new Date();
    deadline.setSeconds(deadline.getSeconds() + 10); // 10 second deadline
    
    client.GetMerchant(request, { deadline }, (error, response) => {
      if (error) {
        console.error('\n❌ gRPC Error:');
        console.error('Code:', error.code);
        console.error('Message:', error.message);
        console.error('Details:', error.details);
        process.exit(1);
      }
      
      console.log('\n✅ gRPC Call Successful!');
      console.log('Response:', JSON.stringify(response, null, 2));
      process.exit(0);
    });
    
  } catch (error) {
    console.error('\n❌ Test Failed:');
    console.error(error);
    process.exit(1);
  }
}

console.log('Starting gRPC connection test...\n');
testGrpcConnection();

