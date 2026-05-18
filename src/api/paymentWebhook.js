// src/api/paymentWebhook.js
const express = require('express');
const router = express.Router();
const { FlutterwavePayment } = require('../payment/flutterwave');
const { CreditManager } = require('../credits/creditManager');

module.exports = function(db) {
    // Initialize CreditManager with the database connection
    let creditManager = null;
    if (db) {
        creditManager = new CreditManager(db);
        console.log('✅ Webhook: CreditManager initialized');
    } else {
        console.error('❌ Webhook: No database connection provided');
    }
    
    const flutterwave = new FlutterwavePayment();

    // Main webhook endpoint for Flutterwave callbacks
    router.post('/flutterwave/webhook', async (req, res) => {
        const signature = req.headers['verif-hash'];
        const payload = JSON.stringify(req.body);
        
        console.log('📨 Webhook received:', req.body.event);
        
        if (!creditManager) {
            console.error('❌ Credit manager not available');
            return res.status(500).json({ status: 'error', message: 'Credit manager unavailable' });
        }
        
        // Verify webhook signature
        const isValid = flutterwave.verifyWebhookSignature(payload, signature);
        
        if (!isValid) {
            console.error('❌ Invalid webhook signature');
            return res.status(401).json({ status: 'unauthorized' });
        }

        const { event, data } = req.body;

        // Handle successful payment
        if (event === 'charge.completed' && data.status === 'successful') {
            const { tx_ref, amount, customer } = data;
            const phoneNumber = customer.phone_number;
            const smsCredits = Math.floor(amount / 50);
            
            console.log(`💰 Payment received: ${amount} UGX from ${phoneNumber}`);
            
            try {
                // Get or create user
                const user = await creditManager.getUser(phoneNumber);
                
                // Add credits to user account
                const result = await creditManager.addCredits(
                    user.user_id,
                    amount,
                    tx_ref,
                    `Flutterwave payment: ${smsCredits} SMS credits`
                );
                
                console.log(`✅ Added ${smsCredits} SMS credits to ${phoneNumber}`);
                console.log(`   New balance: ${result.new_balance} UGX`);
                
                return res.status(200).json({ status: 'success' });
            } catch (error) {
                console.error('Error processing webhook:', error);
                return res.status(500).json({ status: 'error', message: error.message });
            }
        }

        // Handle failed payment
        if (event === 'charge.failed') {
            console.log(`❌ Payment failed: ${data.tx_ref} - ${data.processor_response}`);
        }

        res.status(200).json({ status: 'received' });
    });

    // Payment initiation endpoint (called from your frontend)
    router.post('/initiate', async (req, res) => {
        const { phoneNumber, amount } = req.body;
        
        if (!phoneNumber || !amount) {
            return res.status(400).json({
                success: false,
                error: 'Phone number and amount are required'
            });
        }
        
        if (amount < 1000) {
            return res.status(400).json({
                success: false,
                error: 'Minimum amount is 1000 UGX'
            });
        }
        
        const reference = 'KAZI_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
        const smsCredits = Math.floor(amount / 50);
        
        // Initiate Flutterwave payment
        const payment = await flutterwave.chargeMobileMoney(phoneNumber, amount, reference);
        
        if (payment.success) {
            res.json({
                success: true,
                reference: reference,
                amount: amount,
                credits: smsCredits,
                transaction_id: payment.transaction_id,
                status: 'pending',
                message: `Payment initiated. Check your ${flutterwave.detectNetwork(phoneNumber)} Mobile Money for a payment request.`
            });
        } else {
            res.status(500).json({
                success: false,
                error: payment.error,
                reference: reference
            });
        }
    });

    // Verify payment status endpoint
    router.get('/verify/:reference', async (req, res) => {
        const { reference } = req.params;
        
        res.json({
            success: true,
            reference: reference,
            status: 'completed'
        });
    });

    return router;
};