const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

// Critical files to obfuscate
const criticalFiles = [
    'src/credits/creditManager.js',
    'src/payment/flutterwave.js',
    'src/smsc/server.js'
];

criticalFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const obfuscated = JavaScriptObfuscator.obfuscate(content, {
        compact: true,
        controlFlowFlattening: true,
        deadCodeInjection: true,
        debugProtection: true,
        disableConsoleOutput: true,
        stringArray: true,
        stringArrayEncoding: ['rc4'],
        transformObjectKeys: true
    });
    
    const outputFile = file.replace('.js', '.protected.js');
    fs.writeFileSync(outputFile, obfuscated.getObfuscatedCode());
    console.log(`Obfuscated: ${file} -> ${outputFile}`);
});
