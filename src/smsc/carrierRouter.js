class CarrierRouter {
    constructor() {
        this.mtnUganda = ['78', '79', '77', '74', '76'];
        this.airtelUganda = ['70', '75'];
        this.africellUganda = ['77'];
        
        this.carriers = {
            mtn_uganda: {
                name: 'MTN Uganda',
                country: 'UG',
                countryCode: '256',
                enabled: true
            },
            airtel_uganda: {
                name: 'Airtel Uganda',
                country: 'UG',
                countryCode: '256',
                enabled: true
            },
            africell_uganda: {
                name: 'Africell Uganda',
                country: 'UG',
                countryCode: '256',
                enabled: true
            },
            safaricom_kenya: {
                name: 'Safaricom',
                country: 'KE',
                countryCode: '254',
                enabled: true
            },
            vodacom_tanzania: {
                name: 'Vodacom Tanzania',
                country: 'TZ',
                countryCode: '255',
                enabled: true
            }
        };
    }

    getCarrier(phoneNumber) {
        const cleaned = phoneNumber.toString().replace(/\D/g, '');
        
        let number = cleaned;
        let countryCode = '';
        
        if (cleaned.startsWith('256')) {
            countryCode = '256';
            number = cleaned.substring(3);
        } else if (cleaned.startsWith('254')) {
            countryCode = '254';
            number = cleaned.substring(3);
        } else if (cleaned.startsWith('255')) {
            countryCode = '255';
            number = cleaned.substring(3);
        } else if (cleaned.startsWith('0')) {
            number = cleaned.substring(1);
            countryCode = '256';
        } else if (cleaned.length === 9) {
            countryCode = '256';
        }
        
        const prefix = number.substring(0, 2);
        
        if (countryCode === '256') {
            if (this.mtnUganda.includes(prefix)) {
                return this.carriers.mtn_uganda;
            }
            if (this.airtelUganda.includes(prefix)) {
                return this.carriers.airtel_uganda;
            }
            if (this.africellUganda.includes(prefix)) {
                return this.carriers.africell_uganda;
            }
            return this.carriers.mtn_uganda;
        }
        
        if (countryCode === '254') {
            return this.carriers.safaricom_kenya;
        }
        
        if (countryCode === '255') {
            return this.carriers.vodacom_tanzania;
        }
        
        return {
            name: 'Default Carrier',
            country: 'UG',
            countryCode: '256',
            enabled: true
        };
    }
}

module.exports = { CarrierRouter };