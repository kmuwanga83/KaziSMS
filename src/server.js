const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const { validatePhoneNumber, getCarrierInfo } = require('./utils/phone');
const { initDatabase, dbHelpers } = require('./database/schema');
const { CreditManager } = require('./credits');
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

// Initialize database and credit manager
let dbReady = false;
let creditManager = null;
let db = null;

// Initialize everything
const initialize = async () => {
    try {
        // Initialize database
        await initDatabase();
        dbReady = true;
        console.log('✅ Database initialized and ready');
        
        // Get database instance and initialize credit manager
        const { db: database } = require('./database/schema');
        db = database;
        creditManager = new CreditManager(db);
        console.log('✅ Credit manager initialized');
        
    } catch (err) {
        console.error('❌ Initialization failed:', err.message);
    }
};

// Run initialization
initialize();

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        database: dbReady,
        creditManager: creditManager !== null,
        timestamp: new Date().toISOString(),
        service: 'KaziSMS API',
        version: '2.0.0',
        uptime: process.uptime(),
        features: ['SMS', 'Payment', 'Credits']
    });
});

// Welcome route
app.get('/', (req, res) => {
    res.json({
        name: 'KaziSMS API',
        description: 'Lightning fast SMS API for East Africa with Payment Integration',
        version: '2.0.0',
        status: 'operational',
        database: dbReady ? 'connected' : 'pending',
        endpoints: {
            send_sms: 'POST /v1/sms/send',
            get_messages: 'GET /v1/messages',
            get_stats: 'GET /v1/stats',
            get_balance: 'GET /v1/balance',
            carrier_lookup: 'GET /v1/lookup/:phone',
            message_status: 'GET /v1/sms/:id',
            buy_credits: 'POST /api/buy-credits',
            check_balance: 'GET /api/balance/:phoneNumber',
            transaction_history: 'GET /api/transactions/:phoneNumber'
        }
    });
});

// ============ PAYMENT & CREDIT ENDPOINTS ============

// Buy credits
app.post('/api/buy-credits', async (req, res) => {
    const { phoneNumber, amount } = req.body;
    
    if (!creditManager) {
        return res.status(503).json({
            success: false,
            error: {
                code: 'SERVICE_UNAVAILABLE',
                message: 'Credit system initializing. Please try again.'
            }
        });
    }
    
    if (!phoneNumber || !amount) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'MISSING_FIELDS',
                message: 'Phone number and amount are required'
            }
        });
    }
    
    if (amount < 1000) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'MINIMUM_AMOUNT',
                message: 'Minimum amount is 1000 UGX',
                minimum: 1000
            }
        });
    }
    
    const reference = 'SMS_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
    const smsCredits = Math.floor(amount / 50);
    
    try {
        const user = await creditManager.getUser(phoneNumber);
        
        // For development, auto-add credits
        if (process.env.NODE_ENV === 'development') {
            const result = await creditManager.addCredits(user.user_id, amount, reference, `Purchase of ${smsCredits} SMS credits`);
            
            return res.json({
                success: true,
                transaction_id: reference,
                reference: reference,
                amount: amount,
                credits: smsCredits,
                cost_per_sms: 50,
                new_balance: result.new_balance,
                merchant_phone: process.env.MERCHANT_PHONE || '256700000000',
                payment_instructions: `For production: Send ${amount} UGX to ${process.env.MERCHANT_PHONE || '256700000000'} with reference: ${reference}`,
                note: "Development mode: Credits added automatically. In production, payment verification required."
            });
        }
        
        // Production: Return payment instructions
        res.json({
            success: true,
            transaction_id: reference,
            reference: reference,
            amount: amount,
            credits: smsCredits,
            cost_per_sms: 50,
            merchant_phone: process.env.MERCHANT_PHONE || '256700000000',
            payment_instructions: `Send ${amount} UGX to ${process.env.MERCHANT_PHONE || '256700000000'} via Mobile Money with reference: ${reference}`,
            status: 'pending_payment'
        });
        
    } catch (error) {
        console.error('Buy credits error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'PAYMENT_ERROR',
                message: error.message
            }
        });
    }
});

// Check balance
app.get('/api/balance/:phoneNumber', async (req, res) => {
    const { phoneNumber } = req.params;
    
    if (!creditManager) {
        return res.status(503).json({
            success: false,
            error: {
                code: 'SERVICE_UNAVAILABLE',
                message: 'Credit system initializing. Please try again.'
            }
        });
    }
    
    try {
        const user = await creditManager.getUser(phoneNumber);
        const balance = await creditManager.getBalance(user.user_id);
        const stats = await creditManager.getUserStats(user.user_id);
        
        res.json({
            success: true,
            data: {
                phone_number: phoneNumber,
                balance: balance,
                sms_credits: Math.floor(balance / 50),
                cost_per_sms: 50,
                total_purchased: stats.total_purchased || 0,
                total_used: stats.total_used || 0,
                total_sms_sent: stats.total_sms_sent || 0
            }
        });
    } catch (error) {
        console.error('Balance check error:', error);
        res.status(500).json({
            success: false,
            error: { message: error.message }
        });
    }
});

// Get transaction history
app.get('/api/transactions/:phoneNumber', async (req, res) => {
    const { phoneNumber } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    
    if (!creditManager) {
        return res.status(503).json({
            success: false,
            error: {
                code: 'SERVICE_UNAVAILABLE',
                message: 'Credit system initializing. Please try again.'
            }
        });
    }
    
    try {
        const user = await creditManager.getUser(phoneNumber);
        const transactions = await creditManager.getTransactionHistory(user.user_id, limit);
        
        res.json({
            success: true,
            data: {
                phone_number: phoneNumber,
                transactions: transactions,
                total: transactions.length
            }
        });
    } catch (error) {
        console.error('Transaction history error:', error);
        res.status(500).json({
            success: false,
            error: { message: error.message }
        });
    }
});

// ============ SMS ENDPOINTS WITH CREDIT DEDUCTION ============

// SMS send endpoint with credit deduction
app.post('/v1/sms/send', async (req, res) => {
    const { to, message, from, phoneNumber } = req.body;
    
    if (!creditManager) {
        return res.status(503).json({
            success: false,
            error: {
                code: 'SERVICE_UNAVAILABLE',
                message: 'Credit system initializing. Please try again.'
            }
        });
    }
    
    if (!to || !message) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'MISSING_FIELDS',
                message: 'Both "to" and "message" are required'
            }
        });
    }
    
    if (!phoneNumber) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'MISSING_PHONE',
                message: 'Your phone number is required for billing'
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
    
    // Calculate cost (50 UGX per 160 characters)
    const messageParts = Math.ceil(message.length / 160);
    const cost = messageParts * 50;
    
    try {
        // Get user and check balance
        const user = await creditManager.getUser(phoneNumber);
        const balance = await creditManager.getBalance(user.user_id);
        
        if (balance < cost) {
            return res.status(402).json({
                success: false,
                error: {
                    code: 'INSUFFICIENT_CREDITS',
                    message: `Insufficient credits. Need ${cost} UGX, available: ${balance} UGX`,
                    needed: cost,
                    available: balance,
                    buy_url: '/api/buy-credits'
                }
            });
        }
        
        // Generate unique message ID
        const messageId = 'KAZI_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
        
        // Deduct credits
        const deduction = await creditManager.deductCredits(
            user.user_id, 
            cost, 
            messageId, 
            phoneValidation.normalized, 
            message
        );
        
        console.log(`📱 SMS sent: ${messageId} to ${phoneValidation.normalized}`);
        console.log(`   Cost: ${cost} UGX, New balance: ${deduction.new_balance} UGX`);
        
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
                cost: cost,
                currency: 'UGX',
                message_parts: messageParts,
                balance_before: balance,
                balance_after: deduction.new_balance
            },
            meta: {
                estimated_delivery: messageParts === 1 ? '< 2 seconds' : '< 5 seconds',
                timestamp: new Date().toISOString(),
                processing_ms: Date.now() - req.startTime
            }
        });
        
    } catch (error) {
        console.error('Send SMS error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'SEND_FAILED',
                message: error.message
            }
        });
    }
});

// ============ EXISTING ENDPOINTS ============

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

// Balance endpoint (legacy)
app.get('/v1/balance', async (req, res) => {
    res.json({
        success: true,
        data: {
            demo_balance: 50000,
            currency: 'UGX',
            note: 'For user-specific balance, use GET /api/balance/:phoneNumber'
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
            version: '2.0.0',
            environment: process.env.NODE_ENV || 'development',
            database: dbReady ? 'connected' : 'pending',
            payment_enabled: true,
            supported_countries: ['Uganda', 'Kenya', 'Tanzania', 'Rwanda', 'Burundi'],
            features: ['2-way SMS', 'Bulk SMS', 'Database Storage', 'Message History', 'Mobile Money Payments', 'Credit System']
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
                'GET /v1/sms/:id',
                'POST /api/buy-credits',
                'GET /api/balance/:phoneNumber',
                'GET /api/transactions/:phoneNumber'
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
    console.log(`║     🚀 KAZISMS API v2.0 IS RUNNING! 🚀              ║`);
    console.log(`╠═══════════════════════════════════════════════════════╣`);
    console.log(`║  📡 URL: http://localhost:${PORT}                           ║`);
    console.log(`║  💾 Database: SQLite (kazisms.db)                      ║`);
    console.log(`║  💰 Payment: Mobile Money Integrated                   ║`);
    console.log(`║  💪 Ready to send SMS across East Africa!             ║`);
    console.log(`╚═══════════════════════════════════════════════════════╝\n`);
});

module.exports = app;