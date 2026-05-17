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
        cleaned = '256' + cleaned;
    } else if (cleaned.length === 10 && cleaned.startsWith('0')) {
        cleaned = '256' + cleaned.substring(1);
    } else if (cleaned.length === 12 && cleaned.startsWith('256')) {
        cleaned = cleaned;
    } else if (cleaned.length === 13 && cleaned.startsWith('2560')) {
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
    if (countryCode === '256') {
        const prefix = remaining.substring(0, 2);
        if (['78', '79'].includes(prefix)) carrier = 'MTN Uganda';
        else if (['70', '75'].includes(prefix)) carrier = 'Airtel Uganda';
        else if (['77'].includes(prefix)) carrier = 'Africell Uganda';
        else if (['74', '76'].includes(prefix)) carrier = 'MTN Uganda';
    } else if (countryCode === '254') {
        const prefix = remaining.substring(0, 1);
        if (prefix === '7') carrier = 'Safaricom';
        else if (prefix === '1') carrier = 'Airtel Kenya';
    } else if (countryCode === '255') {
        const prefix = remaining.substring(0, 2);
        if (['68', '76'].includes(prefix)) carrier = 'Vodacom';
        else if (['65', '67'].includes(prefix)) carrier = 'Tigo';
        else if (['69'].includes(prefix)) carrier = 'Airtel Tanzania';
    }
    
    return {
        valid: true,
        normalized: '+' + cleaned,
        countryCode: countryCode,
        country: countryCodes[countryCode],
        subscriberNumber: remaining,
        carrier: carrier,
        original: phone
    };
}

module.exports = { validatePhoneNumber, countryCodes };
