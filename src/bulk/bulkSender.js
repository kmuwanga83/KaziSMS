// WATERMARK:eyJkYXRhIjp7Im93bmVyIjoiS29zZWEgRXJhc3RvIChrbXV3YW5nYTgzKSIsImNvbXBhbnkiOiJLYXppU01TIiwiY29weXJpZ2h0IjoiMjAyNCIsImxpY2Vuc2UiOiJQcm9wcmlldGFyeSAtIEFsbCBSaWdodHMgUmVzZXJ2ZWQiLCJyZWdpc3RyYXRpb24iOiJVUlNCLUMtMjAyNC0wMDEiLCJ1bmlxdWVfaWQiOiJlYmRjN2I1MjUxYmUzNmU1MGNjNTlmYzk5MjVjZjQ0ZSJ9LCJ0aW1lc3RhbXAiOjE3NzkwOTY5ODE0NjAsInNpZ25hdHVyZSI6ImI5ODhiZTk2MDJhYWZhN2NkZjg1ODg4MDI2M2Q4ODFhMDllMjY4MTI3MTRlODE0OGQ0OWFiZjNmMDczYjY0NTUiLCJ2ZXJzaW9uIjoiMi4wIn0=
const { validatePhoneNumber } = require('../utils/phone');

class BulkSender {
    constructor() {
        this.batches = new Map();
    }

    async createBatch(name, recipients, message, from = 'KaziSMS') {
        const batchId = 'BATCH_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        
        const batch = {
            id: batchId,
            name,
            total: recipients.length,
            sent: 0,
            failed: 0,
            status: 'processing',
            recipients: [],
            created_at: new Date().toISOString(),
            from,
            message
        };

        for (const recipient of recipients) {
            const validation = validatePhoneNumber(recipient);
            batch.recipients.push({
                to: recipient,
                normalized: validation.valid ? validation.normalized : null,
                carrier: validation.valid ? validation.carrier : 'unknown',
                valid: validation.valid,
                error: validation.valid ? null : validation.error,
                status: 'pending'
            });
        }

        this.batches.set(batchId, batch);
        this.processBatch(batchId);
        return batch;
    }

    async processBatch(batchId) {
        const batch = this.batches.get(batchId);
        if (!batch) return;

        for (const recipient of batch.recipients) {
            if (!recipient.valid) {
                recipient.status = 'failed';
                batch.failed++;
                continue;
            }
            recipient.status = 'sent';
            batch.sent++;
            await this.sleep(100);
        }

        batch.status = 'completed';
        batch.completed_at = new Date().toISOString();
        console.log(`✅ Bulk batch ${batchId} completed: ${batch.sent} sent, ${batch.failed} failed`);
    }

    sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    getBatchStatus(batchId) { return this.batches.get(batchId) || null; }
    getAllBatches() { return Array.from(this.batches.values()); }
}

module.exports = { BulkSender };