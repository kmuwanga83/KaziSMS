// src/credits/creditManager.js
const crypto = require('crypto');

class CreditManager {
    constructor(db) {
        this.db = db;
        this.initTables();
    }

    initTables() {
        // User credits table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS user_credits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT UNIQUE NOT NULL,
                phone_number TEXT UNIQUE NOT NULL,
                balance INTEGER DEFAULT 0,
                total_purchased INTEGER DEFAULT 0,
                total_used INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME
            )
        `);

        // Transactions table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                transaction_id TEXT UNIQUE NOT NULL,
                user_id TEXT,
                amount INTEGER,
                type TEXT,
                status TEXT,
                reference TEXT,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // SMS usage table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS sms_usage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id TEXT UNIQUE,
                user_id TEXT,
                to_number TEXT,
                message TEXT,
                cost INTEGER,
                status TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('✅ Credit manager tables ready');
    }

    async getUser(phoneNumber) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM user_credits WHERE phone_number = ?',
                [phoneNumber],
                (err, row) => {
                    if (err) reject(err);
                    else if (row) resolve(row);
                    else {
                        const userId = 'USER_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
                        this.db.run(
                            'INSERT INTO user_credits (user_id, phone_number, balance) VALUES (?, ?, ?)',
                            [userId, phoneNumber, 0],
                            (err2) => {
                                if (err2) reject(err2);
                                else resolve({ user_id: userId, phone_number: phoneNumber, balance: 0 });
                            }
                        );
                    }
                }
            );
        });
    }

    async getUserById(userId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM user_credits WHERE user_id = ?',
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    async addCredits(userId, amount, transactionId, description = 'Credit purchase') {
        return new Promise((resolve, reject) => {
            this.db.run(
                `UPDATE user_credits 
                 SET balance = balance + ?, total_purchased = total_purchased + ?, updated_at = CURRENT_TIMESTAMP
                 WHERE user_id = ?`,
                [amount, amount, userId],
                (err) => {
                    if (err) reject(err);
                    else {
                        this.db.run(
                            `INSERT INTO transactions (transaction_id, user_id, amount, type, status, description)
                             VALUES (?, ?, ?, ?, ?, ?)`,
                            [transactionId, userId, amount, 'purchase', 'completed', description],
                            (err2) => {
                                if (err2) reject(err2);
                                else {
                                    this.getUserById(userId).then(user => {
                                        resolve({ success: true, new_balance: user.balance });
                                    }).catch(reject);
                                }
                            }
                        );
                    }
                }
            );
        });
    }

    async deductCredits(userId, amount, messageId, toNumber, message) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT balance FROM user_credits WHERE user_id = ?',
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    if (!row || row.balance < amount) {
                        reject(new Error(`Insufficient credits. Need ${amount} UGX, have ${row?.balance || 0} UGX`));
                        return;
                    }
                    
                    this.db.run(
                        `UPDATE user_credits 
                         SET balance = balance - ?, total_used = total_used + ?, updated_at = CURRENT_TIMESTAMP
                         WHERE user_id = ?`,
                        [amount, amount, userId],
                        (err2) => {
                            if (err2) reject(err2);
                            else {
                                this.db.run(
                                    `INSERT INTO transactions (transaction_id, user_id, amount, type, status, reference, description)
                                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                                    [messageId, userId, amount, 'usage', 'completed', toNumber, `SMS to ${toNumber}`],
                                    (err3) => {
                                        if (err3) console.error('Transaction record error:', err3);
                                    }
                                );
                                
                                this.db.run(
                                    `INSERT INTO sms_usage (message_id, user_id, to_number, message, cost, status)
                                     VALUES (?, ?, ?, ?, ?, ?)`,
                                    [messageId, userId, toNumber, message.substring(0, 160), amount, 'sent'],
                                    (err3) => {
                                        if (err3) console.error('SMS usage record error:', err3);
                                    }
                                );
                                
                                this.getUserById(userId).then(user => {
                                    resolve({ 
                                        success: true, 
                                        new_balance: user.balance,
                                        cost: amount,
                                        message_id: messageId
                                    });
                                }).catch(reject);
                            }
                        }
                    );
                }
            );
        });
    }

    async getBalance(userId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT balance FROM user_credits WHERE user_id = ?',
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row ? row.balance : 0);
                }
            );
        });
    }

    async getUserStats(userId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT 
                    balance,
                    total_purchased,
                    total_used,
                    (SELECT COUNT(*) FROM sms_usage WHERE user_id = ?) as total_sms_sent
                 FROM user_credits WHERE user_id = ?`,
                [userId, userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row || { balance: 0, total_purchased: 0, total_used: 0, total_sms_sent: 0 });
                }
            );
        });
    }

    async getTransactionHistory(userId, limit = 50) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT * FROM transactions 
                 WHERE user_id = ? 
                 ORDER BY created_at DESC 
                 LIMIT ?`,
                [userId, limit],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
    }
}

module.exports = { CreditManager };