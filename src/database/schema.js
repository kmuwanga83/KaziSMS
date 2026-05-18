const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../../kazisms.db');
const db = new sqlite3.Database(dbPath);

const initDatabase = () => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Outgoing messages table
            db.run(`CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id TEXT UNIQUE NOT NULL,
                to_number TEXT NOT NULL,
                from_number TEXT,
                message TEXT NOT NULL,
                status TEXT DEFAULT 'queued',
                carrier TEXT,
                country TEXT,
                cost INTEGER DEFAULT 50,
                parts INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                delivered_at DATETIME,
                is_reply BOOLEAN DEFAULT 0,
                reply_to_message_id TEXT
            )`, (err) => {
                if (err) console.error('Messages table error:', err.message);
                else console.log('✅ Messages table ready');
            });

            // Incoming messages table (for two-way SMS)
            db.run(`CREATE TABLE IF NOT EXISTS incoming_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id TEXT UNIQUE NOT NULL,
                from_number TEXT NOT NULL,
                to_number TEXT NOT NULL,
                message TEXT NOT NULL,
                carrier TEXT,
                status TEXT DEFAULT 'received',
                processed BOOLEAN DEFAULT 0,
                replied_to BOOLEAN DEFAULT 0,
                reply_message_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) console.error('Incoming messages table error:', err.message);
                else console.log('✅ Incoming messages table ready');
            });

            // Auto-reply rules table
            db.run(`CREATE TABLE IF NOT EXISTS auto_reply_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                keyword TEXT NOT NULL,
                response TEXT NOT NULL,
                enabled BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) console.error('Auto-reply rules table error:', err.message);
                else console.log('✅ Auto-reply rules table ready');
            });

            resolve();
        });
    });
};

const dbHelpers = {
    // ============ OUTGOING MESSAGES ============
    saveMessage: (message) => {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare(`INSERT INTO messages 
                (message_id, to_number, from_number, message, status, carrier, country, cost, parts, is_reply, reply_to_message_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            stmt.run(
                message.message_id,
                message.to_number,
                message.from_number,
                message.message,
                message.status || 'queued',
                message.carrier,
                message.country,
                message.cost || 50,
                message.parts || 1,
                message.is_reply || 0,
                message.reply_to_message_id || null,
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID, message_id: message.message_id });
                }
            );
            stmt.finalize();
        });
    },
    
    getAllMessages: (limit = 100) => {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM messages ORDER BY created_at DESC LIMIT ?', [limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },
    
    getMessage: (messageId) => {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM messages WHERE message_id = ?', [messageId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },

    updateMessageStatus: (messageId, status, deliveredAt = null, error = null) => {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare(`
                UPDATE messages 
                SET status = ?, delivered_at = ?, error = ?
                WHERE message_id = ?
            `);
            stmt.run(status, deliveredAt, error, messageId, function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
            stmt.finalize();
        });
    },

    // ============ INCOMING MESSAGES (Two-Way SMS) ============
    saveIncomingMessage: (message) => {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare(`INSERT INTO incoming_messages 
                (message_id, from_number, to_number, message, carrier, status)
                VALUES (?, ?, ?, ?, ?, ?)`);
            stmt.run(
                message.message_id,
                message.from_number,
                message.to_number,
                message.message,
                message.carrier || 'unknown',
                message.status || 'received',
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID, message_id: message.message_id });
                }
            );
            stmt.finalize();
        });
    },
    
    getIncomingMessages: (limit = 100, processed = null) => {
        return new Promise((resolve, reject) => {
            let query = 'SELECT * FROM incoming_messages ORDER BY created_at DESC LIMIT ?';
            let params = [limit];
            
            if (processed !== null) {
                query = 'SELECT * FROM incoming_messages WHERE processed = ? ORDER BY created_at DESC LIMIT ?';
                params = [processed ? 1 : 0, limit];
            }
            
            db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },
    
    getIncomingMessage: (messageId) => {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM incoming_messages WHERE message_id = ?', [messageId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },
    
    markIncomingProcessed: (messageId, replyMessageId = null) => {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare(`
                UPDATE incoming_messages 
                SET processed = 1, replied_to = ?, reply_message_id = ?
                WHERE message_id = ?
            `);
            stmt.run(replyMessageId ? 1 : 0, replyMessageId, messageId, function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
            stmt.finalize();
        });
    },

    getUnprocessedIncomingMessages: (limit = 50) => {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM incoming_messages WHERE processed = 0 ORDER BY created_at ASC LIMIT ?', [limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    // ============ AUTO-REPLY RULES ============
    saveAutoReplyRule: (rule) => {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare(`INSERT INTO auto_reply_rules (keyword, response, enabled)
                VALUES (?, ?, ?)`);
            stmt.run(rule.keyword.toLowerCase(), rule.response, rule.enabled ? 1 : 0, function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, ...rule });
            });
            stmt.finalize();
        });
    },
    
    getAutoReplyRules: (enabledOnly = true) => {
        return new Promise((resolve, reject) => {
            let query = 'SELECT * FROM auto_reply_rules';
            let params = [];
            
            if (enabledOnly) {
                query += ' WHERE enabled = 1';
            }
            
            query += ' ORDER BY created_at ASC';
            
            db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },
    
    getAutoReplyRule: (keyword) => {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM auto_reply_rules WHERE keyword = ? AND enabled = 1', [keyword.toLowerCase()], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },
    
    deleteAutoReplyRule: (id) => {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM auto_reply_rules WHERE id = ?', [id], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    },

    updateAutoReplyRule: (id, updates) => {
        return new Promise((resolve, reject) => {
            const fields = [];
            const values = [];
            
            if (updates.keyword) {
                fields.push('keyword = ?');
                values.push(updates.keyword.toLowerCase());
            }
            if (updates.response) {
                fields.push('response = ?');
                values.push(updates.response);
            }
            if (updates.enabled !== undefined) {
                fields.push('enabled = ?');
                values.push(updates.enabled ? 1 : 0);
            }
            
            if (fields.length === 0) {
                reject(new Error('No updates provided'));
                return;
            }
            
            values.push(id);
            const query = `UPDATE auto_reply_rules SET ${fields.join(', ')} WHERE id = ?`;
            
            db.run(query, values, function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    },

    // ============ STATISTICS ============
    getConversationStats: (phoneNumber = null) => {
        return new Promise((resolve, reject) => {
            let query = `
                SELECT 
                    (SELECT COUNT(*) FROM messages) as total_outgoing,
                    (SELECT COUNT(*) FROM incoming_messages) as total_incoming,
                    (SELECT COUNT(*) FROM messages WHERE status = 'delivered') as delivered,
                    (SELECT COUNT(*) FROM incoming_messages WHERE processed = 1) as replied_to
            `;
            
            db.get(query, [], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },

    getConversationHistory: (phoneNumber, limit = 50) => {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    'outgoing' as direction,
                    message_id,
                    to_number as to_number,
                    from_number as from_number,
                    message,
                    status,
                    created_at
                FROM messages 
                WHERE to_number = ? OR from_number = ?
                
                UNION ALL
                
                SELECT 
                    'incoming' as direction,
                    message_id,
                    from_number as to_number,
                    to_number as from_number,
                    message,
                    status,
                    created_at
                FROM incoming_messages 
                WHERE from_number = ? OR to_number = ?
                
                ORDER BY created_at DESC
                LIMIT ?
            `;
            
            db.all(query, [phoneNumber, phoneNumber, phoneNumber, phoneNumber, limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
};

module.exports = { initDatabase, dbHelpers, db };