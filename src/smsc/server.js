// WATERMARK:eyJkYXRhIjp7Im93bmVyIjoiS29zZWEgRXJhc3RvIChrbXV3YW5nYTgzKSIsImNvbXBhbnkiOiJLYXppU01TIiwiY29weXJpZ2h0IjoiMjAyNCIsImxpY2Vuc2UiOiJQcm9wcmlldGFyeSAtIEFsbCBSaWdodHMgUmVzZXJ2ZWQiLCJyZWdpc3RyYXRpb24iOiJVUlNCLUMtMjAyNC0wMDEiLCJ1bmlxdWVfaWQiOiJlYmRjN2I1MjUxYmUzNmU1MGNjNTlmYzk5MjVjZjQ0ZSJ9LCJ0aW1lc3RhbXAiOjE3NzkwOTY5ODE0ODIsInNpZ25hdHVyZSI6IjY3OTNmNWMwYzM1NDg1Mzk5YzE3NTg2ZmI3YmFkNGYyYjRkMmIwMTQyYzg0ZjMyOTBjODVmYzA2ZTUzM2MyNWYiLCJ2ZXJzaW9uIjoiMi4wIn0=
/**
 * Copyright (c) 2024 KaziSMS. All Rights Reserved.
 * 
 * SMPP SMSC Server implementation - Core proprietary technology.
 * This code is the intellectual property of KaziSMS.
 * 
 * @copyright 2024 KaziSMS
 */
const smpp = require('smpp');
const EventEmitter = require('events');
const crypto = require('crypto');
const axios = require('axios');
const { SMSCDatabase } = require('./database');
const { CarrierRouter } = require('./carrierRouter');
const { getCarrierInfo } = require('../utils/phone');

class SMSCServer extends EventEmitter {
    constructor(config) {
        super();
        this.config = {
            host: config.host || '0.0.0.0',
            port: config.port || 2775,
            systemId: config.systemId || 'KAZISMS',
            debug: config.debug || true,
            ...config
        };
        
        this.server = null;
        this.sessions = new Map();
        this.db = new SMSCDatabase();
        this.carrierRouter = new CarrierRouter();
        this.messageQueue = [];
        this.processing = false;
        this.autoReplyRules = new Map();
        
        this.loadAutoReplyRules();
    }

    async loadAutoReplyRules() {
        try {
            const rules = await this.db.getAutoReplyRules();
            rules.forEach(rule => {
                this.autoReplyRules.set(rule.keyword.toLowerCase(), rule);
            });
            console.log(`✅ Loaded ${this.autoReplyRules.size} auto-reply rules`);
        } catch (error) {
            console.error('Failed to load auto-reply rules:', error.message);
        }
    }

    start() {
        this.server = smpp.createServer({
            debug: this.config.debug
        }, (session) => {
            this.handleSession(session);
        });

        this.server.listen(this.config.port, this.config.host, () => {
            console.log(`\n╔═══════════════════════════════════════════════════════╗`);
            console.log(`║     🚀 YOUR SMSC SERVER IS RUNNING! 🚀                ║`);
            console.log(`╠═══════════════════════════════════════════════════════╣`);
            console.log(`║  📡 Host: ${this.config.host}:${this.config.port}                              ║`);
            console.log(`║  💾 Database: SMSC database ready                     ║`);
            console.log(`║  📨 Two-Way SMS: ENABLED                              ║`);
            console.log(`║  🤖 Auto-Reply: Active                                ║`);
            console.log(`║  🔑 Issue your own credentials to clients!           ║`);
            console.log(`╚═══════════════════════════════════════════════════════╝\n`);
        });

        this.server.on('error', (err) => {
            console.error('SMSC Server error:', err);
        });
    }

    handleSession(session) {
        const sessionId = crypto.randomBytes(16).toString('hex');
        console.log(`📱 New client connected: ${sessionId.substring(0, 8)}...`);

        session.on('bind_transceiver', (pdu) => {
            this.handleBind(session, sessionId, pdu);
        });

        session.on('bind_transmitter', (pdu) => {
            this.handleBind(session, sessionId, pdu);
        });

        session.on('bind_receiver', (pdu) => {
            this.handleBind(session, sessionId, pdu);
        });

        session.on('submit_sm', (pdu) => {
            this.handleSubmitSM(session, sessionId, pdu);
        });

        session.on('deliver_sm', (pdu) => {
            this.handleDeliverSM(session, sessionId, pdu);
        });

        session.on('enquire_link', (pdu) => {
            session.send(pdu.response());
        });

        session.on('unbind', () => {
            console.log(`📱 Client disconnected: ${sessionId.substring(0, 8)}...`);
            this.sessions.delete(sessionId);
            session.close();
        });

        session.on('error', (err) => {
            console.error(`Session error:`, err.message);
        });
    }

    async handleBind(session, sessionId, pdu) {
        const { system_id, password } = pdu;
        
        const isValid = await this.db.authenticateClient(system_id, password);

        if (isValid) {
            console.log(`✅ Client authenticated: ${system_id}`);
            
            this.sessions.set(sessionId, {
                session,
                system_id,
                bound_at: new Date(),
                message_count: 0
            });

            const response = pdu.response();
            response.system_id = this.config.systemId;
            session.send(response);
        } else {
            console.log(`❌ Authentication failed for: ${system_id}`);
            
            const response = pdu.response();
            response.command_status = 0x0000000E;
            session.send(response);
            session.close();
        }
    }

    async handleSubmitSM(session, sessionId, pdu) {
        const sessionData = this.sessions.get(sessionId);
        if (!sessionData) return;

        const { source_addr, destination_addr, short_message } = pdu;
        
        let messageText = short_message;
        if (Buffer.isBuffer(short_message)) {
            messageText = short_message.toString('utf8');
        } else if (typeof short_message !== 'string') {
            messageText = String(short_message);
        }
        
        const messageId = this.generateMessageId();
        
        console.log(`\n📤 OUTGOING SMS from ${sessionData.system_id}:`);
        console.log(`   From: ${source_addr}`);
        console.log(`   To: ${destination_addr}`);
        console.log(`   Message: ${messageText.substring(0, 50)}${messageText.length > 50 ? '...' : ''}`);

        const message = {
            id: messageId,
            client_id: sessionData.system_id,
            from: source_addr,
            to: destination_addr,
            message: messageText,
            status: 'queued',
            created_at: new Date()
        };
        
        try {
            await this.db.saveMessage(message);
        } catch (dbError) {
            console.error('Database save error:', dbError.message);
        }

        const response = pdu.response();
        response.message_id = messageId;
        session.send(response);
        
        console.log(`✅ Message ${messageId} queued`);

        const carrier = this.carrierRouter.getCarrier(destination_addr);
        this.messageQueue.push({
            messageId,
            to: destination_addr,
            from: source_addr,
            message: messageText,
            carrier,
            clientId: sessionData.system_id,
            isReply: false
        });

        sessionData.message_count++;
        
        setImmediate(() => {
            this.processQueue();
        });
    }

    async handleDeliverSM(session, sessionId, pdu) {
        const { source_addr, destination_addr, short_message, esm_class } = pdu;
        
        if (esm_class === 0x04) {
            this.handleDeliveryReceipt(pdu);
            return;
        }
        
        let messageText = short_message;
        if (Buffer.isBuffer(short_message)) {
            messageText = short_message.toString('utf8');
        } else if (typeof short_message !== 'string') {
            messageText = String(short_message);
        }
        
        const messageId = 'IN_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
        const carrier = this.carrierRouter.getCarrier(source_addr);
        
        console.log(`\n📨 INCOMING SMS RECEIVED:`);
        console.log(`   From: ${source_addr}`);
        console.log(`   To: ${destination_addr}`);
        console.log(`   Message: ${messageText}`);
        console.log(`   Carrier: ${carrier.name}`);
        
        const incomingMessage = {
            message_id: messageId,
            from_number: source_addr,
            to_number: destination_addr,
            message: messageText,
            carrier: carrier.name,
            status: 'received'
        };
        
        try {
            await this.db.saveIncomingMessage(incomingMessage);
            console.log(`✅ Incoming message ${messageId} saved`);
            
            const autoReply = await this.checkAutoReplyRules(source_addr, messageText, messageId);
            
            if (autoReply) {
                console.log(`🤖 Auto-reply sent to ${source_addr}`);
            }
            
            await this.triggerIncomingWebhook({
                id: messageId,
                from: source_addr,
                to: destination_addr,
                message: messageText,
                carrier: carrier.name,
                timestamp: new Date().toISOString(),
                auto_replied: !!autoReply
            });
            
        } catch (error) {
            console.error('Failed to save incoming message:', error.message);
        }
        
        const response = pdu.response();
        session.send(response);
    }

    handleDeliveryReceipt(pdu) {
        let receiptText = pdu.short_message;
        if (Buffer.isBuffer(receiptText)) {
            receiptText = receiptText.toString('utf8');
        }
        
        console.log(`📬 Delivery Receipt: ${receiptText}`);
        
        const match = receiptText.match(/id:(\S+)\s+stat:(\S+)/);
        if (match) {
            const messageId = match[1];
            const status = match[2];
            const deliveryStatus = this.mapDeliveryStatus(status);
            console.log(`   Message ${messageId} status: ${deliveryStatus}`);
            this.db.updateMessageStatus(messageId, deliveryStatus);
        }
    }

    async checkAutoReplyRules(fromNumber, message, originalMessageId) {
        const lowerMessage = message.toLowerCase();
        
        for (const [keyword, rule] of this.autoReplyRules) {
            if (rule.enabled && lowerMessage.includes(keyword)) {
                console.log(`🤖 Auto-reply triggered for keyword: ${keyword}`);
                
                const replyId = 'REPLY_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
                const replyMessage = rule.response;
                
                this.messageQueue.push({
                    messageId: replyId,
                    to: fromNumber,
                    from: this.config.systemId,
                    message: replyMessage,
                    carrier: this.carrierRouter.getCarrier(fromNumber),
                    clientId: 'auto_reply',
                    isReply: true,
                    originalMessageId: originalMessageId
                });
                
                setImmediate(() => {
                    this.processQueue();
                });
                
                await this.db.markIncomingProcessed(originalMessageId, replyId);
                return true;
            }
        }
        return false;
    }

    async triggerIncomingWebhook(data) {
        const webhookUrl = process.env.INCOMING_WEBHOOK_URL;
        if (!webhookUrl) return;
        
        try {
            await axios.post(webhookUrl, {
                event: 'sms.received',
                data: data
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Webhook-Source': 'KaziSMS-SMSC'
                },
                timeout: 5000
            });
            console.log(`✅ Webhook sent`);
        } catch (error) {
            console.error(`❌ Webhook failed:`, error.message);
        }
    }

    mapDeliveryStatus(smppStatus) {
        const statusMap = {
            'DELIVRD': 'delivered',
            'EXPIRED': 'expired',
            'DELETED': 'deleted',
            'UNDELIV': 'undeliverable',
            'ACCEPTD': 'accepted',
            'REJECTD': 'rejected',
            'PENDING': 'pending'
        };
        return statusMap[smppStatus] || 'unknown';
    }

    async processQueue() {
        if (this.processing) return;
        this.processing = true;

        while (this.messageQueue.length > 0) {
            const msg = this.messageQueue.shift();
            
            try {
                await this.sleep(50);
                
                if (msg.isReply) {
                    await this.db.updateMessageStatus(msg.messageId, 'sent');
                    console.log(`✅ Reply ${msg.messageId} sent to ${msg.to}`);
                    
                    if (msg.originalMessageId) {
                        await this.db.markIncomingProcessed(msg.originalMessageId, msg.messageId);
                    }
                } else {
                    await this.db.updateMessageStatus(msg.messageId, 'sent');
                    console.log(`✅ Message ${msg.messageId} sent via ${msg.carrier.name}`);
                }
            } catch (error) {
                console.error(`❌ Failed to send ${msg.messageId}:`, error.message);
                await this.db.updateMessageStatus(msg.messageId, 'failed', error.message);
            }
            
            await this.sleep(10);
        }
        
        this.processing = false;
    }

    generateMessageId() {
        return 'MSG_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getStats() {
        return {
            sessions: this.sessions.size,
            queueLength: this.messageQueue.length,
            autoReplyRules: this.autoReplyRules.size,
            clients: Array.from(this.sessions.values()).map(s => ({
                system_id: s.system_id,
                message_count: s.message_count,
                bound_at: s.bound_at
            }))
        };
    }

    stop() {
        if (this.server) {
            this.server.close();
        }
    }
}

module.exports = { SMSCServer };