// WATERMARK:eyJkYXRhIjp7Im93bmVyIjoiS29zZWEgRXJhc3RvIChrbXV3YW5nYTgzKSIsImNvbXBhbnkiOiJLYXppU01TIiwiY29weXJpZ2h0IjoiMjAyNCIsImxpY2Vuc2UiOiJQcm9wcmlldGFyeSAtIEFsbCBSaWdodHMgUmVzZXJ2ZWQiLCJyZWdpc3RyYXRpb24iOiJVUlNCLUMtMjAyNC0wMDEiLCJ1bmlxdWVfaWQiOiJlYmRjN2I1MjUxYmUzNmU1MGNjNTlmYzk5MjVjZjQ0ZSJ9LCJ0aW1lc3RhbXAiOjE3NzkwOTY5ODE0NzksInNpZ25hdHVyZSI6IjMxM2IwMzBhNTVhMTU4OWYwMzg5NmEyYWI3NzU3OGZjMWUwNDA1ZmM0ZDJlMTFiNWYzZDI1OTdmNGRjYzlkOGUiLCJ2ZXJzaW9uIjoiMi4wIn0=
const express = require('express');
const { SMSCDatabase } = require('./database');

const router = express.Router();
const db = new SMSCDatabase();

router.post('/clients', async (req, res) => {
    const { system_id, password, name, initial_balance } = req.body;
    
    if (!system_id || !password) {
        return res.status(400).json({
            success: false,
            error: 'system_id and password are required'
        });
    }
    
    try {
        const client = await db.createClient(system_id, password, name, initial_balance || 1000);
        res.json({
            success: true,
            client: {
                system_id: client.system_id,
                name: name || system_id,
                balance: initial_balance || 1000,
                smpp_host: process.env.SMSC_HOST || 'localhost',
                smpp_port: 2775
            },
            message: 'Client created successfully! They can now connect using SMPP'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/clients', async (req, res) => {
    try {
        const clients = await db.getAllClients();
        res.json({ success: true, clients });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/clients/:systemId/balance', async (req, res) => {
    const { systemId } = req.params;
    try {
        const balance = await db.getClientBalance(systemId);
        res.json({ success: true, system_id: systemId, balance });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/stats', async (req, res) => {
    try {
        const stats = await db.getStats();
        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;