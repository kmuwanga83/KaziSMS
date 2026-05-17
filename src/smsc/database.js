const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

class SMSCDatabase {
    constructor() {
        this.dbPath = path.join(__dirname, '../../smsc.db');
        this.db = new sqlite3.Database(this.dbPath);
        this.init();
    }

    init() {
        this.db.serialize(() => {
            this.db.run(`
                CREATE TABLE IF NOT EXISTS clients (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    system_id TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL,
                    name TEXT,
                    balance INTEGER DEFAULT 0,
                    rate_per_sms INTEGER DEFAULT 50,
                    active BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_used DATETIME
                )
            `);

            this.db.run(`
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    message_id TEXT UNIQUE NOT NULL,
                    client_id TEXT,
                    from_number TEXT,
                    to_number TEXT,
                    message TEXT,
                    status TEXT,
                    carrier TEXT,
                    cost INTEGER,
                    error TEXT,
                    created_at DATETIME,
                    delivered_at DATETIME
                )
            `);

            this.createDefaultClient();
        });
    }

    createDefaultClient() {
        const defaultSystemId = process.env.DEFAULT_SYSTEM_ID || 'kazisys_admin';
        const defaultPassword = bcrypt.hashSync(process.env.DEFAULT_PASSWORD || 'admin123', 10);
        
        this.db.run(`
            INSERT OR IGNORE INTO clients (system_id, password, name, balance)
            VALUES (?, ?, ?, ?)
        `, [defaultSystemId, defaultPassword, 'Admin Client', 100000]);
        
        console.log('✅ Default client created:');
        console.log(`   System ID: ${defaultSystemId}`);
        console.log(`   Password: ${process.env.DEFAULT_PASSWORD || 'admin123'}`);
        console.log(`   Balance: 100,000 credits`);
    }

    authenticateClient(systemId, password) {
        return new Promise((resolve) => {
            this.db.get(
                'SELECT * FROM clients WHERE system_id = ? AND active = 1',
                [systemId],
                (err, row) => {
                    if (err || !row) {
                        resolve(false);
                        return;
                    }
                    
                    const isValid = bcrypt.compareSync(password, row.password);
                    if (isValid) {
                        this.db.run(
                            'UPDATE clients SET last_used = CURRENT_TIMESTAMP WHERE system_id = ?',
                            [systemId]
                        );
                    }
                    resolve(isValid);
                }
            );
        });
    }

    createClient(systemId, password, name, initialBalance = 1000) {
        const hashedPassword = bcrypt.hashSync(password, 10);
        
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO clients (system_id, password, name, balance)
                 VALUES (?, ?, ?, ?)`,
                [systemId, hashedPassword, name, initialBalance],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID, system_id: systemId });
                }
            );
        });
    }

    saveMessage(message) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO messages (message_id, client_id, from_number, to_number, message, status, cost, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [message.id, message.client_id, message.from, message.to, message.message, message.status, message.cost || 50, message.created_at],
                (err) => {
                    if (err) reject(err);
                    else resolve(message.id);
                }
            );
        });
    }

    updateMessageStatus(messageId, status, error = null) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `UPDATE messages SET status = ?, delivered_at = CURRENT_TIMESTAMP, error = ?
                 WHERE message_id = ?`,
                [status, error, messageId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    getClientBalance(systemId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT balance FROM clients WHERE system_id = ?',
                [systemId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row ? row.balance : 0);
                }
            );
        });
    }

    getAllClients() {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT id, system_id, name, balance, active, created_at, last_used FROM clients',
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    getStats() {
        return new Promise((resolve, reject) => {
            this.db.get(`
                SELECT 
                    COUNT(*) as total_messages,
                    SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as delivered,
                    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                    SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as queued
                FROM messages
            `, (err, row) => {
                if (err) reject(err);
                else resolve(row || { total_messages: 0, delivered: 0, failed: 0, queued: 0 });
            });
        });
    }
}

module.exports = { SMSCDatabase };