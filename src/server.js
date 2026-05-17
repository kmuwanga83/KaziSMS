const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const { validatePhoneNumber, getCarrierInfo } = require('./utils/phone');
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

// Request timer
app.use((req, res, next) => {
    req.startTime = Date.now();
    next();
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'KaziSMS API',
        version: '1.0.0',
        uptime: process.uptime()
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
            get_info: 'GET /v1/info'
        }
    });
});

// SMS send endpoint
app.post('/v1/sms/send', (req, res) => {
    const { to, message, from } = req.body;
    
    // Validate required fields
    if (!to || !message) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'MISSING_FIELDS',
                message: 'Both "to" and "message" are required',
                example: {
                    to: '+256712345678',
                    message: 'Hello from KaziSMS!'
                }
            }
        });
    }
    
    // Validate message length
    if (message.length > 1600) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'MESSAGE_TOO_LONG',
                message: `Message exceeds 1600 characters (${message.length})`,
                max_length: 1600
            }
        });
    }
    
    // Validate phone number
    const phoneValidation = validatePhoneNumber(to);
    
    if (!phoneValidation.valid) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'INVALID_PHONE',
                message: phoneValidation.error,
                hint: 'Use formats: 0712345678, +256712345678, or 256712345678'
            }
        });
    }
    
    // Generate unique message ID
    const messageId = 'KAZI' + Date.now() + Math.random().toString(36).substr(2, 8);
    
    // Calculate cost based on carrier and country
    const costPerSms = getCostPerSms(phoneValidation.countryCode);
    const estimatedCost = costPerSms;
    const messageParts = Math.ceil(message.length / 160);
    const totalCost = estimatedCost * messageParts;
    
    // Log the SMS attempt
    console.log(`\n📱 New SMS Request:`);
    console.log(`   ID: ${messageId}`);
    console.log(`   To: ${phoneValidation.normalized}`);
    console.log(`   Carrier: ${phoneValidation.carrier}`);
    console.log(`   Country: ${phoneValidation.countryName}`);
    console.log(`   From: ${from || 'KaziSMS'}`);
    console.log(`   Message: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`);
    console.log(`   Length: ${message.length} chars, ${messageParts} part(s)`);
    console.log(`   Cost: ${totalCost} ${getCurrencySymbol(phoneValidation.countryCode)}`);
    
    // Return success response
    res.json({
        success: true,
        data: {
            message_id: messageId,
            status: 'queued',
            to: phoneValidation.normalized,
            from: from || 'KaziSMS',
            message: message,
            carrier: phoneValidation.carrier,
            country: phoneValidation.countryName,
            country_code: phoneValidation.countryCode,
            cost: totalCost,
            currency: getCurrencySymbol(phoneValidation.countryCode),
            message_parts: messageParts,
            balance_remaining: 50000 - totalCost
        },
        meta: {
            estimated_delivery: messageParts === 1 ? '< 2 seconds' : '< 5 seconds',
            timestamp: new Date().toISOString(),
            processing_ms: Date.now() - req.startTime
        }
    });
});

// Long message endpoint (for messages > 160 chars)
app.post('/v1/sms/send/long', (req, res) => {
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
    
    const phoneValidation = validatePhoneNumber(to);
    if (!phoneValidation.valid) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'INVALID_PHONE',
                message: phoneValidation.error
            }
        });
    }
    
    const messageId = 'KAZILONG' + Date.now() + Math.random().toString(36).substr(2, 8);
    const messageParts = Math.ceil(message.length / 153); // 153 for concatenated messages
    
    res.json({
        success: true,
        data: {
            message_id: messageId,
            status: 'queued',
            to: phoneValidation.normalized,
            from: from || 'KaziSMS',
            message_parts: messageParts,
            carrier: phoneValidation.carrier,
            cost: messageParts * 50,
            balance_remaining: 50000 - (messageParts * 50)
        },
        meta: {
            note: 'Long message will be sent as concatenated SMS',
            timestamp: new Date().toISOString()
        }
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
            estimated_sms: {
                uganda: 1000,
                kenya: 1000,
                tanzania: 1666
            },
            last_topup_date: '2024-05-01',
            expiry_date: '2024-12-31'
        }
    });
});

// Message status endpoint
app.get('/v1/sms/:id', (req, res) => {
    const { id } = req.params;
    
    // Simulate different statuses based on ID prefix
    let status = 'delivered';
    let deliveredAt = new Date().toISOString();
    
    if (id.includes('FAIL')) {
        status = 'failed';
        deliveredAt = null;
    } else if (id.includes('PEND')) {
        status = 'pending';
        deliveredAt = null;
    }
    
    res.json({
        success: true,
        data: {
            message_id: id,
            status: status,
            delivered_at: deliveredAt,
            delivery_time_ms: status === 'delivered' ? Math.floor(Math.random() * 3000) + 500 : null
        }
    });
});

// API Info endpoint
app.get('/v1/info', (req, res) => {
    res.json({
        success: true,
        data: {
            name: 'KaziSMS',
            version: '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            supported_countries: [
                { code: 'UG', name: 'Uganda', carriers: ['MTN Uganda', 'Airtel Uganda', 'Africell Uganda'] },
                { code: 'KE', name: 'Kenya', carriers: ['Safaricom', 'Airtel Kenya'] },
                { code: 'TZ', name: 'Tanzania', carriers: ['Vodacom', 'Tigo', 'Airtel Tanzania'] },
                { code: 'RW', name: 'Rwanda', carriers: ['MTN Rwanda'] },
                { code: 'BI', name: 'Burundi', carriers: ['Lycamobile'] }
            ],
            pricing: {
                uganda: 'UGX 50 per SMS',
                kenya: 'KES 0.50 per SMS',
                tanzania: 'TZS 30 per SMS'
            },
            features: [
                '2-way SMS',
                'Bulk SMS',
                'Scheduled SMS',
                'Webhooks',
                'Delivery Reports',
                'Long SMS (concatenated)',
                'Flash SMS'
            ],
            limits: {
                max_message_length: 1600,
                max_batch_size: 1000,
                rate_limit: '100 requests per minute'
            }
        }
    });
});

// Carrier lookup endpoint
app.get('/v1/lookup/:phone', (req, res) => {
    const { phone } = req.params;
    const carrierInfo = getCarrierInfo(phone);
    
    res.json({
        success: true,
        data: carrierInfo
    });
});

// Helper functions
function getCostPerSms(countryCode) {
    const costs = {
        '256': 50,  // Uganda - UGX
        '254': 0.5, // Kenya - KES
        '255': 30,  // Tanzania - TZS
        '250': 50,  // Rwanda - RWF
        '257': 100  // Burundi - BIF
    };
    return costs[countryCode] || 50;
}

function getCurrencySymbol(countryCode) {
    const currencies = {
        '256': 'UGX',
        '254': 'KES',
        '255': 'TZS',
        '250': 'RWF',
        '257': 'BIF'
    };
    return currencies[countryCode] || 'UGX';
}

// 404 handler
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
                'POST /v1/sms/send/long',
                'GET /v1/sms/:id',
                'GET /v1/balance',
                'GET /v1/info',
                'GET /v1/lookup/:phone'
            ]
        }
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    res.status(500).json({
        success: false,
        error: {
            code: 'INTERNAL_ERROR',
            message: 'Something went wrong. Please try again later.'
        }
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`\n╔═══════════════════════════════════════════════════════╗`);
    console.log(`║          🚀 KAZISMS API IS RUNNING! 🚀               ║`);
    console.log(`╠═══════════════════════════════════════════════════════╣`);
    console.log(`║  📡 URL: http://localhost:${PORT}                           ║`);
    console.log(`║  🌍 Environment: ${process.env.NODE_ENV || 'development'}                               ║`);
    console.log(`║  💪 Ready to send SMS across East Africa!             ║`);
    console.log(`║                                                       ║`);
    console.log(`║  📱 Supported Countries:                              ║`);
    console.log(`║     🇺🇬 Uganda  | 🇰🇪 Kenya  | 🇹🇿 Tanzania            ║`);
    console.log(`║     🇷🇼 Rwanda  | 🇧🇮 Burundi                          ║`);
    console.log(`╚═══════════════════════════════════════════════════════╝\n`);
});

module.exports = app;