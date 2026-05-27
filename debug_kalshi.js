const crypto = require('crypto');

function testSign() {
    console.log("Testing signature generation...");
    const pem = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgI3/0xT3qD7wLQp2I
+O+5x0QJ/Fp4W9zXN+O3YJ5S6+WhRANCAARs3vK3+R0E0jT+Gg4Z9b2OQZ7UaT6+
5R4Z9r2OQZ7UaT6+5R4Z9r2OQZ7UaT6+5R4Z9r2OQZ7UaT6+5R4Z9g==
-----END PRIVATE KEY-----`; // just a fake key to test if syntax runs
    
    // Test
    try {
        const timestamp = "1716629000000";
        const method = "GET";
        const signPath = "/trade-api/v2/portfolio/balance";
        const message = `${timestamp}${method.toUpperCase()}${signPath}`;
        const sign = crypto.createSign('SHA256');
        sign.update(message);
        
        // This should throw if key is not RSA
        const sig = sign.sign({
            key: pem,
            padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
            saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST
        }, 'base64');
        console.log("Signature:", sig);
    } catch(e) {
        console.log("Expected error with fake key:", e.message);
    }
}
testSign();
