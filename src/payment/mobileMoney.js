// src/payment/mobileMoney.js
const axios = require('axios');
const crypto = require('crypto');

class MobileMoneyPayment {
    constructor(config) {
        this.apiKey = config.apiKey;
        this.apiSecret = config.apiSecret;
        this.baseURL = config.baseURL || 'https://api.mobilemoney.ug';
        this.merchantPhone = config.merchantPhone || process.env.MERCHANT_PHONE;
    }

    // Generate payment request for MTN/Airtel Mobile Money
    async requestPayment(phoneNumber, amount, reference) {
        const payload = {
            phone: phoneNumber,
            amount: amount,
            currency: 'UGX',
            reference: reference,
            description: `SMS Credits - ${amount} UGX`,
            callback_url: `${process.env.APP_URL || 'http://localhost:3001'}/api/payment/callback`,
            merchant_phone: this.merchantPhone
        };

        try {
            // For testing/demo purposes, simulate payment
            if (process.env.NODE_ENV === 'development') {
                return {
                    success: true,
                    transaction_id: 'TXN_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
                    status: 'pending',
                    payment_url: null,
                    instructions: `Send ${amount} UGX to ${this.merchantPhone} with reference ${reference}`,
                    reference: reference,
                    amount: amount,
                    is_test: true
                };
            }

            // Real API call (when you have actual integration)
            const response = await axios.post(`${this.baseURL}/pay`, payload, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });
            
            return {
                success: true,
                transaction_id: response.data.transaction_id,
                status: response.data.status,
                payment_url: response.data.payment_url,
                reference: reference,
                amount: amount
            };
        } catch (error) {
            console.error('Payment request error:', error.message);
            return {
                success: false,
                error: error.message,
                fallback_instructions: `Send ${amount} UGX to ${this.merchantPhone} with reference ${reference}`
            };
        }
    }

    // Verify payment status
    async verifyPayment(transactionId) {
        try {
            if (process.env.NODE_ENV === 'development') {
                // Simulate successful payment after 30 seconds
                return {
                    success: true,
                    status: 'completed',
                    amount: 5000,
                    verified: true
                };
            }

            const response = await axios.get(`${this.baseURL}/verify/${transactionId}`, {
                headers: { 'Authorization': `Bearer ${this.apiKey}` }
            });
            
            return {
                success: true,
                status: response.data.status,
                amount: response.data.amount,
                verified: response.data.status === 'completed'
            };
        } catch (error) {
            console.error('Payment verification error:', error.message);
            return { success: false, error: error.message, verified: false };
        }
    }

    // Simulate payment webhook (for testing)
    simulatePaymentWebhook(reference, amount) {
        return {
            event: 'payment.completed',
            data: {
                reference: reference,
                amount: amount,
                transaction_id: 'TXN_' + Date.now(),
                phone: '+256700000000',
                status: 'completed',
                timestamp: new Date().toISOString()
            }
        };
    }
}

module.exports = { MobileMoneyPayment };