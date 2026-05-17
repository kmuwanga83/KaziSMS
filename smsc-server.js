const express = require('express');
const { SMSCServer } = require('./src/smsc/server');
const adminApi = require('./src/smsc/adminApi');
require('dotenv').config();

console.log('\n🔧 Starting KaziSMS SMSC Server...\n');

// Create and start SMSC server
const smscServer = new SMSCServer({
    host: process.env.SMSC_HOST || '0.0.0.0',
    port: process.env.SMSC_PORT || 2775,
    debug: true
});

// Start the SMPP server
smscServer.start();

// Create admin API
const app = express();
const ADMIN_PORT = process.env.ADMIN_PORT || 3002;

app.use(express.json());
app.use('/api/admin', adminApi);

// Health check endpoint
app.get('/health', (req, res) => {
    const stats = smscServer.getStats();
    res.json({
        status: 'healthy',
        smsc: 'running',
        smpp_port: process.env.SMSC_PORT || 2775,
        sessions: stats.sessions,
        queue: stats.queueLength,
        timestamp: new Date().toISOString()
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'KaziSMS SMSC Server',
        version: '1.0.0',
        description: 'Your own SMPP SMSC server for East Africa',
        documentation: {
            smpp_host: process.env.SMSC_HOST || 'localhost',
            smpp_port: 2775,
            admin_api: `http://localhost:${ADMIN_PORT}`,
            endpoints: {
                create_client: 'POST /api/admin/clients',
                list_clients: 'GET /api/admin/clients',
                get_stats: 'GET /api/admin/stats',
                client_balance: 'GET /api/admin/clients/:systemId/balance'
            }
        }
    });
});

// Start admin API server
app.listen(ADMIN_PORT, () => {
    console.log(`\n╔═══════════════════════════════════════════════════════╗`);
    console.log(`║     🔧 KAZISMS SMSC ADMIN API RUNNING!               ║`);
    console.log(`╠═══════════════════════════════════════════════════════╣`);
    console.log(`║  📡 URL: http://localhost:${ADMIN_PORT}                      ║`);
    console.log(`║  🔑 Create clients: POST /api/admin/clients          ║`);
    console.log(`║  📊 View stats: GET /api/admin/stats                 ║`);
    console.log(`║  👥 List clients: GET /api/admin/clients             ║`);
    console.log(`║                                                       ║`);
    console.log(`║  📱 SMPP Server: ${process.env.SMSC_HOST || 'localhost'}:${process.env.SMSC_PORT || 2775}     ║`);
    console.log(`╚═══════════════════════════════════════════════════════╝\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down SMSC server...');
    smscServer.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down SMSC server...');
    smscServer.stop();
    process.exit(0);
});

module.exports = { smscServer };