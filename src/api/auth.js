const crypto = require('crypto');

class AuthManager {
    constructor() {
        this.apiKeys = new Map();
    }

    generateApiKey() {
        return 'kaz_' + crypto.randomBytes(32).toString('hex');
    }

    async createApiKey(name, userId = 'default', permissions = ['send_sms', 'view_messages']) {
        const apiKey = this.generateApiKey();
        const apiKeyData = {
            id: Date.now().toString(),
            name,
            api_key: apiKey,
            user_id: userId,
            permissions,
            created_at: new Date().toISOString(),
            active: true,
            monthly_limit: 10000,
            used_count: 0
        };
        this.apiKeys.set(apiKey, apiKeyData);
        console.log(`🔑 API Key created: ${name}`);
        return apiKeyData;
    }

    validateApiKey(apiKey) {
        const keyData = this.apiKeys.get(apiKey);
        if (!keyData) return { valid: false, error: 'Invalid API key' };
        if (!keyData.active) return { valid: false, error: 'API key inactive' };
        
        keyData.last_used = new Date().toISOString();
        keyData.used_count++;
        return { valid: true, data: keyData };
    }
}

const authenticate = (authManager) => {
    return async (req, res, next) => {
        const apiKey = req.headers['x-api-key'] || req.query.api_key;
        if (!apiKey) {
            return res.status(401).json({ success: false, error: { code: 'MISSING_API_KEY', message: 'API key required' } });
        }
        const validation = authManager.validateApiKey(apiKey);
        if (!validation.valid) {
            return res.status(401).json({ success: false, error: { code: 'INVALID_API_KEY', message: validation.error } });
        }
        req.apiKeyData = validation.data;
        next();
    };
};

module.exports = { AuthManager, authenticate };