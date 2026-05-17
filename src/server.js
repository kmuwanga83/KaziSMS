const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'KaziSMS API',
        version: '1.0.0'
    });
});

// Welcome route
app.get('/', (req, res) => {
    res.json({
        name: 'KaziSMS API',
        description: 'Lightning fast SMS API for East Africa',
        version: '1.0.0',
        status: 'operational',
        endpoints: {
            send_sms: 'POST /v1/sms/send',
            check_status: 'GET /v1/sms/:id',
            get_balance: 'GET /v1/balance',
            get_info: 'GET /v1/info',
            docs: 'GET /docs'
        }
    });
});

// SMS send endpoint
app.post('/v1/sms/send', (req, res) => {
    const { to, message, from } = req.body;
    
    if (!to || !message) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'MISSING_FIELDS',
                message: 'Both "to" and "message" are required'
            }
        });
    }
    
    const messageId = 'KAZI' + Date.now() + Math.random().toString(36).substr(2, 6);
    
    res.json({
        success: true,
        message_id: messageId,
        status: 'queued',
        to: to,
        from: from || 'KaziSMS',
        message: message,
        estimated_delivery: '< 2 seconds',
        carrier_detected: detectCarrier(to),
        note: 'SMS queued for delivery'
    });
});

// Balance endpoint
app.get('/v1/balance', (req, res) => {
    res.json({
        success: true,
        data: {
            balance: 50000,
            currency: 'UGX',
            currency_symbol: 'UGX',
            estimated_sms_count: 1000,
            last_topup_date: '2024-05-01',
            expiry_date: '2024-12-31'
        }
    });
});

// Info endpoint
app.get('/v1/info', (req, res) => {
    res.json({
        success: true,
        data: {
            name: 'KaziSMS',
            version: '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            supported_countries: ['Uganda', 'Kenya', 'Tanzania', 'Rwanda', 'Burundi'],
            carriers: {
                uganda: ['MTN Uganda', 'Airtel Uganda', 'Africell Uganda'],
                kenya: ['Safaricom', 'Airtel Kenya'],
                tanzania: ['Vodacom', 'Tigo', 'Airtel Tanzania']
            },
            pricing: {
                uganda: 'UGX 50 per SMS',
                kenya: 'KES 0.50 per SMS',
                tanzania: 'TZS 30 per SMS'
            },
            features: ['2-way SMS', 'Bulk SMS', 'Scheduled SMS', 'Webhooks', 'Delivery Reports'],
            documentation: 'http://localhost:3001/docs',
            support: {
                email: 'support@kazisms.com',
                whatsapp: '+256700000000'
            }
        }
    });
});

// Message status endpoint
app.get('/v1/sms/:id', (req, res) => {
    const { id } = req.params;
    res.json({
        success: true,
        data: {
            message_id: id,
            status: 'delivered',
            delivered_at: new Date().toISOString(),
            delivery_time_ms: 1850,
            carrier: 'MTN Uganda'
        }
    });
});

// Helper function to detect carrier
function detectCarrier(phone) {
    const cleaned = phone.toString().replace(/\D/g, '');
    if (cleaned.startsWith('256')) {
        const prefix = cleaned.substring(3, 5);
        if (['78', '79'].includes(prefix)) return 'MTN Uganda';
        if (['70', '75'].includes(prefix)) return 'Airtel Uganda';
        if (['77'].includes(prefix)) return 'Africell Uganda';
    }
    if (cleaned.startsWith('254')) {
        const prefix = cleaned.substring(3, 4);
        if (prefix === '7') return 'Safaricom';
        if (prefix === '1') return 'Airtel Kenya';
    }
    return 'Unknown';
}

// 404 handler - FIXED: removed the wildcard '*'
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: {
            code: 'NOT_FOUND',
            message: `Cannot ${req.method} ${req.url}`,
            valid_endpoints: [
                'GET /',
                'GET /health',
                'POST /v1/sms/send',
                'GET /v1/sms/:id',
                'GET /v1/balance',
                'GET /v1/info'
            ]
        }
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        error: {
            code: 'INTERNAL_ERROR',
            message: 'Something went wrong'
        }
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`\n╔═══════════════════════════════════════════╗`);
    console.log(`║     🚀 KAZISMS API IS RUNNING!          ║`);
    console.log(`╠═══════════════════════════════════════════╣`);
    console.log(`║  📡 URL: http://localhost:${PORT}           ║`);
    console.log(`║  🌍 Environment: ${process.env.NODE_ENV || 'development'}                     ║`);
    console.log(`║  💪 Ready to send SMS across East Africa! ║`);
    console.log(`╚═══════════════════════════════════════════╝\n`);
});

module.exports = app;
