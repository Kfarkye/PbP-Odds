const fs = require('fs');
const crypto = require('crypto');

const API_KEY_ID = process.env.KALSHI_KEY_ID;
const PRIVATE_KEY = process.env.KALSHI_PRIVATE_KEY;

if(!API_KEY_ID || !PRIVATE_KEY) {
	console.error('Please set KALSHI_KEY_ID and KALSHI_PRIVATE_KEY env vars');
	process.exit(1);
}

const method = "GET";
const path = "/trade-api/v2/portfolio/balance";
const timestamp = Date.now().toString();

const message = timestamp + method + path;

const sign = crypto.createSign('SHA256');
sign.update(message);
const signature = sign.sign({
    key: PRIVATE_KEY,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_MAX_SIGN
}, 'base64');

fetch('https://api.elections.kalshi.com/trade-api/v2/portfolio/balance', {
    headers: {
        'KALSHI-ACCESS-KEY': API_KEY_ID,
        'KALSHI-ACCESS-TIMESTAMP': timestamp,
        'KALSHI-ACCESS-SIGNATURE': signature
    }
}).then(r => r.text()).then(t => console.log(t)).catch(console.error);

