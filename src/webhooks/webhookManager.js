const axios = require('axios');
const crypto = require('crypto');

class WebhookManager {
    constructor() {
        this.webhooks = [];
        this.loadWebhooks();
    }

    async loadWebhooks() {
        const webhookUrl = process.env.WEBHOOK_URL || '';
        const webhookSecret = process.env.WEBHOOK_SECRET || 'kazisms-secret-2024';
        
        if (webhookUrl) {
            this.webhooks.push({
                id: 1,
                url: webhookUrl,
                events: ['sent', 'delivered', 'failed'],
                secret: webhookSecret,
                active: true,
                created_at: new Date().toISOString()
            });
            console.log('📡 Webhook configured:', webhookUrl);
        }
    }

    async trigger(event, data) {
        const activeWebhooks = this.webhooks.filter(w => w.active && w.events.includes(event));
        if (activeWebhooks.length === 0) return { success: false, message: 'No active webhooks' };

        const results = [];
        for (const webhook of activeWebhooks) {
            const result = await this.sendWebhook(webhook, event, data);
            results.push(result);
        }
        return { success: true, results };
    }

    async sendWebhook(webhook, event, data) {
        const payload = { event, timestamp: new Date().toISOString(), data };
        const signature = crypto.createHmac('sha256', webhook.secret).update(JSON.stringify(payload)).digest('hex');

        try {
            const response = await axios.post(webhook.url, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Webhook-Signature': signature,
                    'X-Webhook-Event': event
                },
                timeout: 5000
            });
            console.log(`✅ Webhook sent: ${event} (${response.status})`);
            return { success: true, status: response.status };
        } catch (error) {
            console.error(`❌ Webhook failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
}

module.exports = { WebhookManager };