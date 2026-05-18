// src/payment/flutterwave.js
const axios = require('axios');
const crypto = require('crypto');

class FlutterwavePayment {
    constructor() {
        this.secretKey = process.env.FLW_SECRET_KEY;
        this.publicKey = process.env.FLW_PUBLIC_KEY;
        this.secretHash = process.env.FLW_SECRET_HASH;
        this.baseURL = process.env.NODE_ENV === 'production'
            ? 'https://api.flutterwave.com/v3'
            : 'https://api.flutterwave.com/v3'; // Same URL, use test keys for sandbox
    }

    // Detect mobile money network from phone number
    detectNetwork(phoneNumber) {
        const cleaned = phoneNumber.replace(/\D/g, '');
        // MTN Uganda prefixes: 78, 79, 77, 74, 76
        if (cleaned.startsWith('78') || cleaned.startsWith('79') || 
            cleaned.startsWith('77') || cleaned.startsWith('74') || 
            cleaned.startsWith('76')) {
            return 'MTN';
        }
        // Airtel Uganda prefixes: 70, 75
        if (cleaned.startsWith('70') || cleaned.startsWith('75')) {
            return 'AIRTEL';
        }
        return 'MTN'; // Default to MTN
    }

    // Format phone number to international format
    formatPhoneNumber(phoneNumber) {
        let cleaned = phoneNumber.replace(/\D/g, '');
        if (cleaned.startsWith('0')) {
            cleaned = '256' + cleaned.substring(1);
        }
        if (!cleaned.startsWith('256')) {
            cleaned = '256' + cleaned;
        }
        return cleaned;
    }

    // Initiate mobile money payment
    async chargeMobileMoney(phoneNumber, amount, reference, email = null) {
        const formattedPhone = this.formatPhoneNumber(phoneNumber);
        const network = this.detectNetwork(formattedPhone);
        
        const payload = {
            tx_ref: reference,
            amount: amount,
            currency: 'UGX',
            email: email || `user_${reference}@kazisms.com`,
            phone_number: formattedPhone,
            fullname: 'KaziSMS Customer',
            network: network,
            redirect_url: `${process.env.APP_URL || 'http://localhost:3001'}/api/payment/callback`,
            meta: {
                purpose: 'SMS Credit Purchase',
                phone: phoneNumber,
                reference: reference
            },
            customization: {
                title: 'KaziSMS Credits',
                description: `Purchase ${Math.floor(amount / 50)} SMS credits`
            }
        };

        try {
            console.log(`💰 Initiating Flutterwave payment: ${amount} UGX for ${formattedPhone}`);
            
            const response = await axios.post(
                `${this.baseURL}/charges?type=mobile_money_uganda`,
                payload,
                {
                    headers: {
                        'Authorization': `Bearer ${this.secretKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.data.status === 'success') {
                return {
                    success: true,
                    transaction_id: response.data.data.id,
                    reference: reference,
                    amount: amount,
                    status: response.data.data.status,
                    processor_response: response.data.data.processor_response
                };
            } else {
                return {
                    success: false,
                    error: response.data.message,
                    reference: reference
                };
            }
        } catch (error) {
            console.error('Flutterwave charge error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.message || error.message,
                reference: reference
            };
        }
    }

    // Verify payment status
    async verifyPayment(transactionId) {
        try {
            const response = await axios.get(
                `${this.baseURL}/transactions/${transactionId}/verify`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.secretKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.data.status === 'success') {
                const transaction = response.data.data;
                return {
                    success: true,
                    status: transaction.status,
                    amount: transaction.amount,
                    currency: transaction.currency,
                    reference: transaction.tx_ref,
                    customer: {
                        phone: transaction.customer?.phone_number,
                        email: transaction.customer?.email
                    }
                };
            } else {
                return {
                    success: false,
                    status: response.data.status,
                    error: response.data.message
                };
            }
        } catch (error) {
            console.error('Flutterwave verify error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Verify webhook signature (security)
    verifyWebhookSignature(payload, signature) {
        if (!signature || !this.secretHash) {
            console.error('Missing signature or secret hash');
            return false;
        }

        try {
            const hash = crypto
                .createHmac('sha256', this.secretHash)
                .update(payload)
                .digest('hex');
            
            return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
        } catch (error) {
            console.error('Signature verification error:', error);
            return false;
        }
    }

    // Get payment link for card payments (alternative)
    async getPaymentLink(amount, reference, phoneNumber, email = null) {
        const formattedPhone = this.formatPhoneNumber(phoneNumber);
        
        const payload = {
            tx_ref: reference,
            amount: amount,
            currency: 'UGX',
            email: email || `user_${reference}@kazisms.com`,
            phone_number: formattedPhone,
            fullname: 'KaziSMS Customer',
            redirect_url: `${process.env.APP_URL || 'http://localhost:3001'}/api/payment/callback`,
            meta: {
                purpose: 'SMS Credit Purchase'
            }
        };

        try {
            const response = await axios.post(
                `${this.baseURL}/payments`,
                payload,
                {
                    headers: {
                        'Authorization': `Bearer ${this.secretKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return {
                success: true,
                payment_link: response.data.data.link,
                reference: reference
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = { FlutterwavePayment };