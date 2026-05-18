// src/api/paymentRoutes.js
const express = require('express');
const router = express.Router();
const { FlutterwavePayment } = require('../payment/flutterwave');
const { CreditManager } = require('../credits/creditManager');

module.exports = function(db) {
    // Initialize CreditManager with the database connection
    let creditManager = null;
    if (db) {
        creditManager = new CreditManager(db);
        console.log('✅ Payment routes: CreditManager initialized');
    } else {
        console.error('❌ Payment routes: No database connection provided');
    }
    
    const flutterwave = new FlutterwavePayment();

    // Buy credits endpoint
    router.post('/buy-credits', async (req, res) => {
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
        
        const reference = 'KAZI_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
        const smsCredits = Math.floor(amount / 50);
        
        // Use Flutterwave for real payments in production
        if (process.env.NODE_ENV === 'production' && process.env.FLW_SECRET_KEY !== 'FLWSECK_TEST-xxxxxxxxxxxxxxxxxxxxx') {
            const payment = await flutterwave.chargeMobileMoney(phoneNumber, amount, reference);
            
            if (payment.success) {
                return res.json({
                    success: true,
                    reference: reference,
                    amount: amount,
                    credits: smsCredits,
                    transaction_id: payment.transaction_id,
                    status: 'pending',
                    message: `Check your ${flutterwave.detectNetwork(phoneNumber)} Mobile Money for a payment request.`,
                    instructions: `Enter your PIN on your phone to complete the payment.`
                });
            } else {
                return res.status(500).json({
                    success: false,
                    error: payment.error
                });
            }
        }
        
        // Development mode: auto-add credits
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
                note: "Development mode: Credits added automatically. In production, real payment required."
            });
        } catch (error) {
            console.error('Add credits error:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Check balance endpoint
    router.get('/balance/:phoneNumber', async (req, res) => {
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

    // Transaction history endpoint
    router.get('/transactions/:phoneNumber', async (req, res) => {
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

    return router;
};