/**
 * Test client for KaziSMS SMSC Server
 * Tests SMPP connection to your SMSC server
 */

const smpp = require('smpp');
const readline = require('readline');

// Configuration
const SMSC_HOST = process.env.SMSC_HOST || 'localhost';
const SMSC_PORT = process.env.SMSC_PORT || 2775;

// Test credentials
const TEST_CLIENT = {
    system_id: 'test_client_1',
    password: 'test123'
};

// Test phone number
const TEST_PHONE = '256775951662';

console.log('\n╔═══════════════════════════════════════════════════════╗');
console.log('║     📱 KAZISMS SMSC CLIENT TEST                      ║');
console.log('╠═══════════════════════════════════════════════════════╣');
console.log(`║  📡 SMSC Host: ${SMSC_HOST}:${SMSC_PORT}`);
console.log(`║  🔑 Client ID: ${TEST_CLIENT.system_id}`);
console.log(`║  📞 Test Phone: ${TEST_PHONE}`);
console.log('╚═══════════════════════════════════════════════════════╝\n');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function sendTestSMS(session, message) {
    return new Promise((resolve, reject) => {
        console.log(`\n📤 Sending SMS:`);
        console.log(`   To: ${TEST_PHONE}`);
        console.log(`   Message: ${message}`);
        
        session.submit_sm({
            destination_addr: TEST_PHONE,
            source_addr: 'KaziSMS',
            short_message: message,
            registered_delivery: 1
        }, (pdu) => {
            if (pdu.command_status === 0) {
                console.log(`✅ SMS sent successfully!`);
                console.log(`   Message ID: ${pdu.message_id}`);
                resolve(pdu.message_id);
            } else {
                console.log(`❌ SMS failed!`);
                reject(new Error(`Send failed: ${pdu.command_status}`));
            }
        });
        
        setTimeout(() => reject(new Error('Send timeout')), 10000);
    });
}

function testConnection() {
    return new Promise((resolve, reject) => {
        console.log('🔌 Connecting to SMSC...');
        
        const session = smpp.connect({ host: SMSC_HOST, port: SMSC_PORT });
        let isConnected = false;
        
        session.on('connect', () => {
            console.log('✅ TCP Connection established');
            console.log('🔐 Binding with credentials...');
            
            session.bind_transceiver({
                system_id: TEST_CLIENT.system_id,
                password: TEST_CLIENT.password
            }, (pdu) => {
                if (pdu.command_status === 0) {
                    console.log('✅ Authentication successful!');
                    console.log(`   Bound as: ${TEST_CLIENT.system_id}`);
                    isConnected = true;
                    resolve(session);
                } else {
                    console.log('❌ Authentication failed!');
                    reject(new Error('Authentication failed'));
                }
            });
        });
        
        session.on('error', (err) => {
            console.log('❌ Connection error:', err.message);
            reject(err);
        });
        
        session.on('close', () => {
            if (isConnected) console.log('🔌 Connection closed');
        });
    });
}

async function runTests() {
    try {
        console.log('\n📋 TEST 1: SMPP Connection & Authentication');
        console.log('─'.repeat(50));
        const session = await testConnection();
        
        console.log('\n📋 TEST 2: Send SMS');
        console.log('─'.repeat(50));
        const testMessage = `KaziSMS Test ${new Date().toLocaleTimeString()} - Your SMSC is working!`;
        await sendTestSMS(session, testMessage);
        
        console.log('\n📋 TEST 3: Interactive Mode');
        console.log('─'.repeat(50));
        console.log('Type your message and press Enter to send.');
        console.log('Type "quit" or "exit" to end.\n');
        
        const sendMessage = () => {
            rl.question('📝 Enter message: ', async (input) => {
                if (input.toLowerCase() === 'quit' || input.toLowerCase() === 'exit') {
                    console.log('\n👋 Closing connection...');
                    session.unbind();
                    session.close();
                    rl.close();
                    return;
                }
                
                if (input.trim()) {
                    try {
                        await sendTestSMS(session, input);
                    } catch (err) {
                        console.log('❌ Failed to send:', err.message);
                    }
                }
                sendMessage();
            });
        };
        
        sendMessage();
        
        session.on('close', () => {
            console.log('\n📊 Test Summary:');
            console.log('   ✅ Connection: Successful');
            console.log('   ✅ Authentication: Successful');
            console.log('   ✅ SMS Sending: Successful');
            console.log('\n🎉 Your KaziSMS SMSC is working perfectly!\n');
            process.exit(0);
        });
        
    } catch (error) {
        console.error('\n❌ Test Failed:', error.message);
        console.log('\n💡 Troubleshooting Tips:');
        console.log('   1. Make sure SMSC server is running: npm run smsc');
        console.log('   2. Create test client:');
        console.log('      curl -X POST http://localhost:3002/api/admin/clients \\');
        console.log('        -H "Content-Type: application/json" \\');
        console.log('        -d \'{"system_id":"test_client_1","password":"test123","name":"Test","initial_balance":10000}\'');
        process.exit(1);
    }
}

console.log('🚀 Starting SMSC Client Tests...\n');
runTests();
