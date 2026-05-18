// WATERMARK:eyJkYXRhIjp7Im93bmVyIjoiS29zZWEgRXJhc3RvIChrbXV3YW5nYTgzKSIsImNvbXBhbnkiOiJLYXppU01TIiwiY29weXJpZ2h0IjoiMjAyNCIsImxpY2Vuc2UiOiJQcm9wcmlldGFyeSAtIEFsbCBSaWdodHMgUmVzZXJ2ZWQiLCJyZWdpc3RyYXRpb24iOiJVUlNCLUMtMjAyNC0wMDEiLCJ1bmlxdWVfaWQiOiJlYmRjN2I1MjUxYmUzNmU1MGNjNTlmYzk5MjVjZjQ0ZSJ9LCJ0aW1lc3RhbXAiOjE3NzkwOTY5ODE1MTUsInNpZ25hdHVyZSI6IjQ5YmQ4OTUzZTU2NDJmYTI4NzQwMjZhZGViODhhMTgxZjkyZDMwMjRkOWRmOTllMTIxNDJkZTdkMjg2ZTE5MjUiLCJ2ZXJzaW9uIjoiMi4wIn0=
#!/usr/bin/env node

/**
 * KaziSMS Digital Watermark Generator
 * Embeds invisible watermarks in source code files
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Your unique watermark data
const WATERMARK_DATA = {
    owner: 'Kosea Erasto (kmuwanga83)',
    company: 'KaziSMS',
    copyright: '2024',
    license: 'Proprietary - All Rights Reserved',
    registration: 'URSB-C-2024-001',
    unique_id: crypto.randomBytes(16).toString('hex')
};

// Generate a unique watermark signature
function generateWatermark() {
    const timestamp = Date.now();
    const signature = crypto
        .createHmac('sha256', process.env.WATERMARK_SECRET || 'KaziSMS-Secret-Key-2024')
        .update(JSON.stringify(WATERMARK_DATA) + timestamp)
        .digest('hex');
    
    return {
        data: WATERMARK_DATA,
        timestamp: timestamp,
        signature: signature,
        version: '2.0'
    };
}

// Create invisible watermark as comment
function createInvisibleWatermark() {
    const watermark = generateWatermark();
    const encoded = Buffer.from(JSON.stringify(watermark)).toString('base64');
    
    // Multiple formats for different file types
    return {
        javascript: `// WATERMARK:${encoded}`,
        html: `<!-- WATERMARK:${encoded} -->`,
        json: `"__watermark__": "${encoded}"`,
        sql: `-- WATERMARK:${encoded}`,
        shell: `# WATERMARK:${encoded}`,
        env: `# WATERMARK:${encoded}`,
        markdown: `<!--- WATERMARK:${encoded} --->`
    };
}

// Check if watermark already exists
function hasWatermark(content, type) {
    const patterns = [
        /\/\/ WATERMARK:[A-Za-z0-9+\/=]+/,
        /<!-- WATERMARK:[A-Za-z0-9+\/=]+ -->/,
        /"__watermark__":\s*"[A-Za-z0-9+\/=]+"/,
        /-- WATERMARK:[A-Za-z0-9+\/=]+/,
        /# WATERMARK:[A-Za-z0-9+\/=]+/
    ];
    
    for (const pattern of patterns) {
        if (pattern.test(content)) {
            return true;
        }
    }
    return false;
}

// Add watermark to file
function addWatermark(filePath, type) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        
        if (hasWatermark(content)) {
            console.log(`⏭️  Skipping (already has watermark): ${filePath}`);
            return false;
        }
        
        const watermarks = createInvisibleWatermark();
        const watermark = watermarks[type] || watermarks.javascript;
        
        // Add watermark at the top of the file
        const newContent = watermark + '\n' + content;
        fs.writeFileSync(filePath, newContent, 'utf8');
        
        console.log(`✅ Watermarked: ${filePath}`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to watermark ${filePath}:`, error.message);
        return false;
    }
}

// Scan directory and watermark files
function watermarkDirectory(dir, extensions, type) {
    const files = fs.readdirSync(dir);
    let count = 0;
    
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
            // Skip node_modules and .git
            if (file !== 'node_modules' && file !== '.git') {
                count += watermarkDirectory(filePath, extensions, type);
            }
        } else if (extensions.some(ext => file.endsWith(ext))) {
            if (addWatermark(filePath, type)) {
                count++;
            }
        }
    }
    
    return count;
}

// Main execution
console.log('🔒 KaziSMS Digital Watermark Tool');
console.log('================================\n');

// Define file types and their extensions
const fileTypes = [
    { extensions: ['.js', '.mjs', '.cjs'], type: 'javascript' },
    { extensions: ['.html', '.htm'], type: 'html' },
    { extensions: ['.json'], type: 'json' },
    { extensions: ['.sql'], type: 'sql' },
    { extensions: ['.sh', '.bash'], type: 'shell' },
    { extensions: ['.env', '.env.example'], type: 'env' },
    { extensions: ['.md'], type: 'markdown' }
];

// Directories to watermark
const directories = [
    './src',
    './public',
    './config',
    './scripts',
    './deployments'
];

let totalCount = 0;

// Process all directories
for (const dir of directories) {
    if (fs.existsSync(dir)) {
        for (const fileType of fileTypes) {
            const count = watermarkDirectory(dir, fileType.extensions, fileType.type);
            totalCount += count;
        }
    }
}

console.log('\n================================');
console.log(`✅ Watermarked ${totalCount} files successfully!`);
console.log('🔒 KaziSMS code is now digitally watermarked.');
console.log('\n⚠️  Note: Watermarks are invisible and don\'t affect code execution.');