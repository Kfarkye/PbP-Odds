import crypto from 'crypto';

function testSign() {
    console.log("Testing signature generation...");
    
    // Generate a real test key
    const { privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' } // Test pkcs8
    });
    
    try {
        const timestamp = "1716629000000";
        const method = "GET";
        const signPath = "/trade-api/v2/portfolio/balance";
        const message = `${timestamp}${method.toUpperCase()}${signPath}`;
        
        console.log("Preimage:", message);
        
        const sign = crypto.createSign('SHA256');
        sign.update(message);
        
        const sig = sign.sign({
            key: privateKey,
            padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
            saltLength: crypto.constants.RSA_PSS_SALTLEN_MAX_SIGN
        }, 'base64');
        console.log("Signature:", sig.slice(0, 50) + '...');
    } catch(e: any) {
        console.log("Expected error with fake key:", e.message);
    }
}
testSign();
