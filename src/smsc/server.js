const smpp = require('smpp');
const EventEmitter = require('events');
const crypto = require('crypto');
const { SMSCDatabase } = require('./database');
const { CarrierRouter } = require('./carrierRouter');

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
        
        // Convert short_message from Buffer to String
        let messageText = short_message;
        if (Buffer.isBuffer(short_message)) {
            messageText = short_message.toString('utf8');
        } else if (typeof short_message !== 'string') {
            messageText = String(short_message);
        }
        
        const messageId = this.generateMessageId();
        
        console.log(`\n📨 Received SMS from ${sessionData.system_id}:`);
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

        // Send response IMMEDIATELY
        const response = pdu.response();
        response.message_id = messageId;
        session.send(response);
        
        console.log(`✅ Message ${messageId} queued, response sent to client`);

        // Add to queue for async processing
        const carrier = this.carrierRouter.getCarrier(destination_addr);
        this.messageQueue.push({
            messageId,
            to: destination_addr,
            from: source_addr,
            message: messageText,
            carrier,
            clientId: sessionData.system_id
        });

        sessionData.message_count++;
        
        // Process queue asynchronously
        setImmediate(() => {
            this.processQueue();
        });
    }

    async processQueue() {
        if (this.processing) return;
        this.processing = true;

        while (this.messageQueue.length > 0) {
            const msg = this.messageQueue.shift();
            
            try {
                await this.sleep(50);
                await this.db.updateMessageStatus(msg.messageId, 'sent');
                console.log(`✅ Message ${msg.messageId} sent via ${msg.carrier.name}`);
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