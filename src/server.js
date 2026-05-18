const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
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

// Serve static files (HTML widget)
app.use(express.static('public'));

// Request timer
app.use((req, res, next) => {
    req.startTime = Date.now();
    next();
});

// Initialize database and credit manager
let dbReady = false;
let creditManager = null;
let db = null;
let paymentRoutes = null;
let paymentWebhook = null;

// Initialize everything
const initialize = async () => {
    try {
        await initDatabase();
        dbReady = true;
        console.log('✅ Database initialized and ready');
        
        const { db: database } = require('./database/schema');
        db = database;
        creditManager = new CreditManager(db);
        console.log('✅ Credit manager initialized');
        
        const paymentRoutesModule = require('./api/paymentRoutes');
        const paymentWebhookModule = require('./api/paymentWebhook');
        
        paymentRoutes = paymentRoutesModule(db);
        paymentWebhook = paymentWebhookModule(db);
        
        app.use('/api', paymentRoutes);
        app.use('/api/payment', paymentWebhook);
        
        console.log('✅ Payment routes initialized');
        
    } catch (err) {
        console.error('❌ Initialization failed:', err.message);
    }
};

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        database: dbReady,
        creditManager: creditManager !== null,
        paymentRoutes: paymentRoutes !== null,
        flutterwave: process.env.FLW_SECRET_KEY ? 'configured' : 'not configured',
        twoWaySMS: true,
        autoReply: true,
        timestamp: new Date().toISOString(),
        service: 'KaziSMS API',
        version: '2.0.0',
        uptime: process.uptime(),
        features: ['SMS', 'Payment', 'Credits', 'Flutterwave', 'Two-Way SMS', 'Auto-Reply']
    });
});

// Welcome route
app.get('/', (req, res) => {
    res.json({
        name: 'KaziSMS API',
        description: 'Lightning fast SMS API for East Africa with Two-Way SMS & Payment Integration',
        version: '2.0.0',
        status: 'operational',
        database: dbReady ? 'connected' : 'pending',
        features: {
            sms_sending: true,
            two_way_sms: true,
            auto_reply: true,
            payment: {
                provider: 'Flutterwave',
                supported: ['MTN Mobile Money', 'Airtel Money', 'Card Payments'],
                status: paymentRoutes ? 'ready' : 'initializing'
            }
        },
        endpoints: {
            send_sms: 'POST /v1/sms/send',
            get_messages: 'GET /v1/messages',
            get_incoming: 'GET /v1/messages/incoming',
            reply_sms: 'POST /v1/sms/reply',
            auto_reply: 'POST /v1/auto-reply/configure',
            get_auto_reply: 'GET /v1/auto-reply/rules',
            get_stats: 'GET /v1/stats',
            get_balance: 'GET /v1/balance',
            carrier_lookup: 'GET /v1/lookup/:phone',
            message_status: 'GET /v1/sms/:id',
            buy_credits: 'POST /api/buy-credits',
            check_balance: 'GET /api/balance/:phoneNumber',
            transaction_history: 'GET /api/transactions/:phoneNumber',
            test_incoming: 'POST /api/test/incoming',
            webhook: 'POST /api/sms-webhook',
            payment_widget: 'GET /buy-credits.html'
        }
    });
});

// ============ TWO-WAY SMS ENDPOINTS ============

// Test endpoint to simulate incoming SMS (for development)
app.post('/api/test/incoming', async (req, res) => {
    const { from, to, message } = req.body;
    
    if (!from || !message) {
        return res.status(400).json({ 
            success: false, 
            error: { message: 'from and message are required' }
        });
    }
    
    const messageId = 'TEST_IN_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const carrierInfo = getCarrierInfo(from);
    
    const incomingMessage = {
        message_id: messageId,
        from_number: from,
        to_number: to || 'KaziSMS',
        message: message,
        carrier: carrierInfo.carrier || 'Test',
        status: 'received'
    };
    
    try {
        await dbHelpers.saveIncomingMessage(incomingMessage);
        console.log(`📨 Test incoming SMS from ${from}: ${message}`);
        
        // Check for auto-reply
        const lowerMessage = message.toLowerCase();
        const rules = await dbHelpers.getAutoReplyRules(true);
        let autoReplied = false;
        
        for (const rule of rules) {
            if (lowerMessage.includes(rule.keyword.toLowerCase())) {
                const replyId = 'REPLY_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
                const replyCost = Math.ceil(rule.response.length / 160) * 50;
                
                const user = await creditManager.getUser(from);
                const balance = await creditManager.getBalance(user.user_id);
                
                if (balance >= replyCost) {
                    await creditManager.deductCredits(user.user_id, replyCost, replyId, from, rule.response);
                    await dbHelpers.markIncomingProcessed(messageId, replyId);
                    autoReplied = true;
                    console.log(`🤖 Auto-reply sent for keyword: ${rule.keyword}`);
                }
                break;
            }
        }
        
        res.json({
            success: true,
            message_id: messageId,
            from: from,
            message: message,
            auto_replied: autoReplied,
            note: 'Test incoming message saved.'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
    }
});

// Get incoming messages
app.get('/v1/messages/incoming', async (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const processed = req.query.processed === 'true' ? true : 
                     req.query.processed === 'false' ? false : null;
    
    try {
        const messages = await dbHelpers.getIncomingMessages(limit, processed);
        res.json({
            success: true,
            count: messages.length,
            messages: messages
        });
    } catch (error) {
        console.error('Failed to get incoming messages:', error);
        res.status(500).json({
            success: false,
            error: { message: error.message }
        });
    }
});

// Reply to an incoming message
app.post('/v1/sms/reply', async (req, res) => {
    const { to, message, original_message_id, from } = req.body;
    
    if (!creditManager) {
        return res.status(503).json({
            success: false,
            error: { message: 'Credit system initializing.' }
        });
    }
    
    if (!to || !message) {
        return res.status(400).json({
            success: false,
            error: { message: 'to and message are required' }
        });
    }
    
    const phoneValidation = validatePhoneNumber(to);
    if (!phoneValidation.valid) {
        return res.status(400).json({
            success: false,
            error: { message: phoneValidation.error }
        });
    }
    
    const messageId = 'REPLY_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
    const messageParts = Math.ceil(message.length / 160);
    const cost = messageParts * 50;
    
    try {
        const user = await creditManager.getUser(to);
        const balance = await creditManager.getBalance(user.user_id);
        
        if (balance < cost) {
            return res.status(402).json({
                success: false,
                error: {
                    code: 'INSUFFICIENT_CREDITS',
                    message: `Need ${cost} UGX, available: ${balance} UGX`,
                    buy_url: '/buy-credits.html'
                }
            });
        }
        
        const deduction = await creditManager.deductCredits(
            user.user_id, cost, messageId, phoneValidation.normalized, message
        );
        
        if (original_message_id) {
            await dbHelpers.markIncomingProcessed(original_message_id, messageId);
        }
        
        console.log(`📤 Reply sent: ${messageId} to ${phoneValidation.normalized}`);
        
        res.json({
            success: true,
            data: {
                message_id: messageId,
                type: 'reply',
                to: phoneValidation.normalized,
                message: message,
                cost: cost,
                balance_before: balance,
                balance_after: deduction.new_balance
            }
        });
    } catch (error) {
        console.error('Reply error:', error);
        res.status(500).json({
            success: false,
            error: { message: error.message }
        });
    }
});

// Configure auto-reply rule
app.post('/v1/auto-reply/configure', async (req, res) => {
    const { keyword, response, enabled = true } = req.body;
    
    if (!keyword || !response) {
        return res.status(400).json({
            success: false,
            error: { message: 'keyword and response are required' }
        });
    }
    
    try {
        const rule = await dbHelpers.saveAutoReplyRule({ keyword, response, enabled });
        res.json({
            success: true,
            rule: rule,
            message: `Auto-reply rule for "${keyword}" configured successfully`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: { message: error.message }
        });
    }
});

// Get auto-reply rules
app.get('/v1/auto-reply/rules', async (req, res) => {
    try {
        const rules = await dbHelpers.getAutoReplyRules(true);
        res.json({
            success: true,
            rules: rules
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: { message: error.message }
        });
    }
});

// Webhook endpoint for receiving SMS (for your web app)
app.post('/api/sms-webhook', async (req, res) => {
    const { event, data } = req.body;
    
    console.log(`📨 Webhook received: ${event}`);
    
    if (event === 'sms.received') {
        console.log(`📱 New SMS from ${data.from}: ${data.message}`);
        res.json({ 
            status: 'received',
            message: `SMS from ${data.from} processed`
        });
    } else {
        res.json({ status: 'ignored' });
    }
});

// ============ PAYMENT & CREDIT ENDPOINTS ============

app.post('/api/buy-credits', async (req, res) => {
    if (!creditManager) {
        return res.status(503).json({
            success: false,
            error: {
                code: 'SERVICE_UNAVAILABLE',
                message: 'Credit system initializing. Please wait a moment and try again.'
            }
        });
    }
    
    const { phoneNumber, amount } = req.body;
    
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
    
    const reference = 'KAZI_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
    const smsCredits = Math.floor(amount / 50);
    
    try {
        const user = await creditManager.getUser(phoneNumber);
        const result = await creditManager.addCredits(user.user_id, amount, reference, `Purchase of ${smsCredits} SMS credits`);
        
        return res.json({
            success: true,
            transaction_id: reference,
            reference: reference,
            amount: amount,
            credits: smsCredits,
            cost_per_sms: 50,
            new_balance: result.new_balance,
            note: "Development mode: Credits added automatically. Real Flutterwave integration ready."
        });
    } catch (error) {
        console.error('Buy credits error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/balance/:phoneNumber', async (req, res) => {
    const { phoneNumber } = req.params;
    
    if (!creditManager) {
        return res.status(503).json({
            success: false,
            error: {
                code: 'SERVICE_UNAVAILABLE',
                message: 'Credit system initializing. Please wait a moment.'
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

app.get('/api/transactions/:phoneNumber', async (req, res) => {
    const { phoneNumber } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    
    if (!creditManager) {
        return res.status(503).json({
            success: false,
            error: {
                code: 'SERVICE_UNAVAILABLE',
                message: 'Credit system initializing.'
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

// ============ SMS ENDPOINTS ============

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
    
    const messageParts = Math.ceil(message.length / 160);
    const cost = messageParts * 50;
    
    try {
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
                    buy_url: '/buy-credits.html'
                }
            });
        }
        
        const messageId = 'KAZI_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
        const deduction = await creditManager.deductCredits(
            user.user_id, cost, messageId, phoneValidation.normalized, message
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

app.get('/v1/stats', async (req, res) => {
    try {
        const messages = await dbHelpers.getAllMessages(1000);
        const incoming = await dbHelpers.getIncomingMessages(1000);
        
        const stats = {
            total: messages.length,
            queued: messages.filter(m => m.status === 'queued').length,
            delivered: messages.filter(m => m.status === 'delivered').length,
            failed: messages.filter(m => m.status === 'failed').length,
            incoming: incoming.length,
            unprocessed_incoming: incoming.filter(m => !m.processed).length,
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

app.get('/v1/lookup/:phone', (req, res) => {
    const { phone } = req.params;
    const carrierInfo = getCarrierInfo(phone);
    
    res.json({
        success: true,
        data: carrierInfo
    });
});

app.get('/v1/info', (req, res) => {
    res.json({
        success: true,
        data: {
            name: 'KaziSMS',
            version: '2.0.0',
            environment: process.env.NODE_ENV || 'development',
            database: dbReady ? 'connected' : 'pending',
            payment_enabled: true,
            payment_provider: 'Flutterwave',
            two_way_sms: true,
            auto_reply: true,
            supported_countries: ['Uganda', 'Kenya', 'Tanzania', 'Rwanda', 'Burundi'],
            features: ['2-way SMS', 'Bulk SMS', 'Database Storage', 'Message History', 'Flutterwave Payments', 'Credit System', 'Auto-Reply']
        }
    });
});

// Start initialization
initialize();

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
                'GET /v1/messages/incoming',
                'POST /v1/sms/reply',
                'POST /v1/auto-reply/configure',
                'GET /v1/auto-reply/rules',
                'GET /v1/stats',
                'GET /v1/balance',
                'GET /v1/info',
                'GET /v1/lookup/:phone',
                'GET /v1/sms/:id',
                'POST /api/buy-credits',
                'GET /api/balance/:phoneNumber',
                'GET /api/transactions/:phoneNumber',
                'POST /api/test/incoming',
                'POST /api/sms-webhook',
                'GET /buy-credits.html'
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
    console.log(`║  💳 Payment: Flutterwave Ready                         ║`);
    console.log(`║  📨 Two-Way SMS: ENABLED                               ║`);
    console.log(`║  🤖 Auto-Reply: Active                                 ║`);
    console.log(`║  📱 Widget: http://localhost:${PORT}/buy-credits.html      ║`);
    console.log(`║  💪 Ready to send SMS across East Africa!             ║`);
    console.log(`╚═══════════════════════════════════════════════════════╝\n`);
});

module.exports = app;