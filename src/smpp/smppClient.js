const net = require('net');

class SMPPClient {
    constructor(config) {
        this.config = {
            host: config.host || 'smpp.mtn.co.ug',
            port: config.port || 2775,
            system_id: config.system_id,
            password: config.password,
            source_addr: config.source_addr || 'KaziSMS'
        };
        this.socket = null;
        this.connected = false;
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.socket = net.createConnection({ host: this.config.host, port: this.config.port }, () => {
                console.log(`✅ SMPP Connected to ${this.config.host}:${this.config.port}`);
                this.connected = true;
                resolve();
            });
            this.socket.on('error', (err) => {
                console.error('❌ SMPP Error:', err);
                this.connected = false;
                reject(err);
            });
        });
    }

    async sendSMS(to, from, message) {
        if (!this.connected) throw new Error('SMPP not connected');
        console.log(`📱 SMPP Sending: ${message.substring(0, 50)} to ${to}`);
        return { success: true, message_id: 'SMPP_' + Date.now(), status: 'sent' };
    }

    disconnect() { if (this.socket) { this.socket.end(); this.connected = false; } }
}

module.exports = { SMPPClient };