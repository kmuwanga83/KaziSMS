const fs = require('fs');
const path = require('path');

function extractWatermark(content) {
    const patterns = [
        /\/\/ WATERMARK:([A-Za-z0-9+\/=]+)/,
        /<!-- WATERMARK:([A-Za-z0-9+\/=]+) -->/,
        /"__watermark__":\s*"([A-Za-z0-9+\/=]+)"/,
        /-- WATERMARK:([A-Za-z0-9+\/=]+)/,
        /# WATERMARK:([A-Za-z0-9+\/=]+)/
    ];
    
    for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) {
            return match[1];
        }
    }
    return null;
}

function verifyWatermark(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const watermark = extractWatermark(content);
        
        if (!watermark) {
            return { hasWatermark: false, file: filePath };
        }
        
        return {
            hasWatermark: true,
            file: filePath
        };
    } catch (error) {
        return { hasWatermark: false, file: filePath, error: error.message };
    }
}

function scanDirectory(dir) {
    if (!fs.existsSync(dir)) return [];
    
    const results = [];
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
            if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
                results.push(...scanDirectory(filePath));
            }
        } else if (file.endsWith('.js') || file.endsWith('.html') || file.endsWith('.json')) {
            results.push(verifyWatermark(filePath));
        }
    }
    
    return results;
}

console.log('🔍 KaziSMS Watermark Verification');
console.log('=================================\n');

const directories = ['./src', './public', './config'];
let watermarked = 0;
let missing = 0;

for (const dir of directories) {
    if (fs.existsSync(dir)) {
        const results = scanDirectory(dir);
        watermarked += results.filter(r => r.hasWatermark).length;
        missing += results.filter(r => !r.hasWatermark).length;
        
        results.forEach(r => {
            if (!r.hasWatermark) {
                console.log(`⚠️  Missing watermark: ${r.file}`);
            }
        });
    }
}

console.log('\n=================================');
console.log(`✅ Watermarked files: ${watermarked}`);
console.log(`⚠️  Missing watermark: ${missing}`);
console.log(`🔒 Total files checked: ${watermarked + missing}`);

if (missing === 0) {
    console.log('\n🎉 All files are properly watermarked!');
} else {
    console.log('\n⚠️ Some files are missing watermarks. Run: node scripts/watermark.js');
}