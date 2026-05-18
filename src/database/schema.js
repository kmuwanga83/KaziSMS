const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../../kazisms.db');
const db = new sqlite3.Database(dbPath);

const initDatabase = () => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
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
                delivered_at DATETIME
            )`, (err) => {
                if (err) reject(err);
                else {
                    console.log('✅ Messages table ready');
                    resolve();
                }
            });
        });
    });
};

const dbHelpers = {
    saveMessage: (message) => {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare(`INSERT INTO messages 
                (message_id, to_number, from_number, message, status, carrier, country, cost, parts)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
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
    }
};

module.exports = { initDatabase, dbHelpers };
// Add at the end of src/database/schema.js
module.exports = { initDatabase, dbHelpers, db };