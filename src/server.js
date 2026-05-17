const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const { validatePhoneNumber, getCarrierInfo } = require('./utils/phone');
const { initDatabase, dbHelpers } = require('./database/schema');
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

// Initialize database
let dbReady = false;
initDatabase().then(() => {
    dbReady = true;
    console.log('✅ Database initialized and ready');
}).catch(err => {
    console.error('❌ Database initialization failed:', err);
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        database: dbReady,
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
        database: dbReady ? 'connected' : 'pending',
        endpoints: {
            send_sms: 'POST /v1/sms/send',
            get_messages: 'GET /v1/messages',
            get_stats: 'GET /v1/stats',
            get_balance: 'GET /v1/balance',
            carrier_lookup: 'GET /v1/lookup/:phone',
            message_status: 'GET /v1/sms/:id'
        }
    });
});

// SMS send endpoint with database storage
app.post('/v1/sms/send', async (req, res) => {
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
    
    // Validate phone number
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
    
    // Generate unique message ID
    const messageId = 'KAZI' + Date.now() + Math.random().toString(36).substr(2, 8);
    const messageParts = Math.ceil(message.length / 160);
    
    // Save to database
    const messageData = {
        message_id: messageId,
        to_number: phoneValidation.normalized,
        from_number: from || 'KaziSMS',
        message: message,
        status: 'queued',
        carrier: phoneValidation.carrier,
        country: phoneValidation.countryName || phoneValidation.country,
        cost: 50,
        parts: messageParts
    };
    
    try {
        await dbHelpers.saveMessage(messageData);
        console.log(`📱 SMS saved: ${messageId} -> ${phoneValidation.normalized} (${phoneValidation.carrier})`);
        
        res.json({
            success: true,
            data: {
                message_id: messageId,
                status: 'queued',
                to: phoneValidation.normalized,
                from: from || 'KaziSMS',
                message: message,
                carrier: phoneValidation.carrier,
                country: phoneValidation.countryName || phoneValidation.country,
                country_code: phoneValidation.countryCode,
                cost: 50,
                currency: 'UGX',
                message_parts: messageParts,
                balance_remaining: 50000
            },
            meta: {
                estimated_delivery: messageParts === 1 ? '< 2 seconds' : '< 5 seconds',
                saved_to_database: true,
                timestamp: new Date().toISOString(),
                processing_ms: Date.now() - req.startTime
            }
        });
    } catch (error) {
        console.error('Failed to save message:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'DB_ERROR',
                message: 'Failed to save message to database'
            }
        });
    }
});

// Get all messages endpoint
app.get('/v1/messages', async (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    
    try {
        const messages = await dbHelpers.getAllMessages(limit);
        res.json({
            success: true,
            count: messages.length,
            messages: messages
        });
    } catch (error) {
        console.error('Failed to get messages:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'DB_ERROR',
                message: 'Failed to retrieve messages'
            }
        });
    }
});

// Get single message status
app.get('/v1/sms/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        const message = await dbHelpers.getMessage(id);
        if (!message) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: 'Message not found'
                }
            });
        }
        
        res.json({
            success: true,
            message: message
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: {
                code: 'DB_ERROR',
                message: 'Failed to retrieve message'
            }
        });
    }
});

// Get statistics
app.get('/v1/stats', async (req, res) => {
    try {
        const messages = await dbHelpers.getAllMessages(1000);
        const stats = {
            total: messages.length,
            queued: messages.filter(m => m.status === 'queued').length,
            delivered: messages.filter(m => m.status === 'delivered').length,
            failed: messages.filter(m => m.status === 'failed').length,
            by_carrier: {}
        };
        
        // Group by carrier
        messages.forEach(msg => {
            const carrier = msg.carrier || 'unknown';
            if (!stats.by_carrier[carrier]) {
                stats.by_carrier[carrier] = 0;
            }
            stats.by_carrier[carrier]++;
        });
        
        res.json({
            success: true,
            stats: stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: {
                code: 'DB_ERROR',
                message: 'Failed to get statistics'
            }
        });
    }
});

// Balance endpoint
app.get('/v1/balance', (req, res) => {
    res.json({
        success: true,
        data: {
            balance: 50000,
            currency: 'UGX',
            currency_symbol: 'UGX',
            estimated_sms: 1000,
            last_topup_date: '2024-05-01',
            expiry_date: '2024-12-31'
        }
    });
});

// Carrier lookup
app.get('/v1/lookup/:phone', (req, res) => {
    const { phone } = req.params;
    const carrierInfo = getCarrierInfo(phone);
    
    res.json({
        success: true,
        data: carrierInfo
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
            database: dbReady ? 'connected' : 'pending',
            supported_countries: ['Uganda', 'Kenya', 'Tanzania', 'Rwanda', 'Burundi'],
            features: ['2-way SMS', 'Bulk SMS', 'Database Storage', 'Message History']
        }
    });
});

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
                'GET /v1/messages',
                'GET /v1/stats',
                'GET /v1/balance',
                'GET /v1/info',
                'GET /v1/lookup/:phone',
                'GET /v1/sms/:id'
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
            message: 'Something went wrong'
        }
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`\n╔═══════════════════════════════════════════════════════╗`);
    console.log(`║          🚀 KAZISMS API IS RUNNING! 🚀               ║`);
    console.log(`╠═══════════════════════════════════════════════════════╣`);
    console.log(`║  📡 URL: http://localhost:${PORT}                           ║`);
    console.log(`║  💾 Database: SQLite (kazisms.db)                      ║`);
    console.log(`║  💪 Ready to send SMS across East Africa!             ║`);
    console.log(`╚═══════════════════════════════════════════════════════╝\n`);
});

module.exports = app;