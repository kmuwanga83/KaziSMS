/**
 * East Africa Phone Number Validation
 * Supports Uganda, Kenya, Tanzania, Rwanda, Burundi
 */

const countryCodes = {
    '256': 'UG',  // Uganda
    '254': 'KE',  // Kenya
    '255': 'TZ',  // Tanzania
    '250': 'RW',  // Rwanda
    '257': 'BI'   // Burundi
};

function validatePhoneNumber(phone) {
    // Remove all non-digit characters
    let cleaned = phone.toString().replace(/\D/g, '');
    
    // Handle different formats
    if (cleaned.length === 9) {
        // Local format: 712345678 (missing leading zero)
        cleaned = '256' + cleaned;
    } else if (cleaned.length === 10 && cleaned.startsWith('0')) {
        // Local with leading zero: 0712345678
        cleaned = '256' + cleaned.substring(1);
    } else if (cleaned.length === 12 && cleaned.startsWith('256')) {
        // International format: 256712345678
        cleaned = cleaned;
    } else if (cleaned.length === 13 && cleaned.startsWith('2560')) {
        // International with extra zero: 2560712345678
        cleaned = '256' + cleaned.substring(4);
    }
    
    // Detect country code
    let countryCode = null;
    let remaining = cleaned;
    
    for (const code of Object.keys(countryCodes)) {
        if (cleaned.startsWith(code)) {
            countryCode = code;
            remaining = cleaned.substring(code.length);
            break;
        }
    }
    
    if (!countryCode) {
        return {
            valid: false,
            error: 'Could not detect country code. Use +256, +254, +255, +250, or +257'
        };
    }
    
    if (remaining.length < 7 || remaining.length > 12) {
        return {
            valid: false,
            error: `Phone must have 7-12 digits. Found ${remaining.length} digits`
        };
    }
    
    // Detect carrier
    let carrier = 'unknown';
    let carrierCode = '';
    
    if (countryCode === '256') {  // Uganda
        const prefix = remaining.substring(0, 2);
        carrierCode = prefix;
        
        if (['78', '79'].includes(prefix)) {
            carrier = 'MTN Uganda';
        } else if (['70', '75'].includes(prefix)) {
            carrier = 'Airtel Uganda';
        } else if (['77'].includes(prefix)) {
            carrier = 'Africell Uganda';
        } else if (['74', '76'].includes(prefix)) {
            carrier = 'MTN Uganda';
        } else if (['71', '72', '73'].includes(prefix)) {
            carrier = 'MTN Uganda';
        } else {
            carrier = 'MTN Uganda'; // Default for Uganda
        }
    } else if (countryCode === '254') {  // Kenya
        const prefix = remaining.substring(0, 1);
        carrierCode = prefix;
        
        if (prefix === '7') {
            carrier = 'Safaricom';
        } else if (prefix === '1') {
            carrier = 'Airtel Kenya';
        } else {
            carrier = 'Unknown';
        }
    } else if (countryCode === '255') {  // Tanzania
        const prefix = remaining.substring(0, 2);
        carrierCode = prefix;
        
        if (['68', '76'].includes(prefix)) {
            carrier = 'Vodacom Tanzania';
        } else if (['65', '67'].includes(prefix)) {
            carrier = 'Tigo Tanzania';
        } else if (['69'].includes(prefix)) {
            carrier = 'Airtel Tanzania';
        } else {
            carrier = 'Unknown';
        }
    } else if (countryCode === '250') {  // Rwanda
        carrier = 'MTN Rwanda';
        carrierCode = remaining.substring(0, 2);
    } else if (countryCode === '257') {  // Burundi
        carrier = 'Lycamobile Burundi';
        carrierCode = remaining.substring(0, 2);
    }
    
    return {
        valid: true,
        normalized: '+' + cleaned,
        countryCode: countryCode,
        country: countryCodes[countryCode],
        countryName: getCountryName(countryCode),
        subscriberNumber: remaining,
        carrier: carrier,
        carrierCode: carrierCode,
        original: phone,
        isValid: true
    };
}

function getCountryName(code) {
    const names = {
        '256': 'Uganda',
        '254': 'Kenya',
        '255': 'Tanzania',
        '250': 'Rwanda',
        '257': 'Burundi'
    };
    return names[code] || 'Unknown';
}

function formatPhoneForDisplay(phone) {
    const validation = validatePhoneNumber(phone);
    if (!validation.valid) return phone;
    
    const { countryCode, subscriberNumber } = validation;
    
    if (countryCode === '256') {
        // Format as 0XX XXX XXX
        return '0' + subscriberNumber.substring(0, 2) + ' ' + 
               subscriberNumber.substring(2, 5) + ' ' + 
               subscriberNumber.substring(5);
    }
    
    return validation.normalized;
}

function getCarrierInfo(phone) {
    const validation = validatePhoneNumber(phone);
    if (!validation.valid) {
        return { error: validation.error };
    }
    
    return {
        carrier: validation.carrier,
        country: validation.countryName,
        countryCode: validation.countryCode,
        prefix: validation.carrierCode
    };
}

module.exports = { 
    validatePhoneNumber, 
    formatPhoneForDisplay, 
    getCarrierInfo,
    countryCodes 
};