import crypto from 'crypto';

const keyId = process.env.KALSHI_API_KEY_ID || process.env.KALSHI_KEY_ID || '';
const privateKey = process.env.KALSHI_PRIVATE_KEY || '';

async function main() {
    const timestamp = Date.now().toString();
    const cleanPath = '/markets';
    const method = 'GET';
    const signPath = '/trade-api/v2' + cleanPath;
    const message = `${timestamp}${method}${signPath}`;
    
    let pem = privateKey.trim();
    if (pem && !pem.includes('\n')) {
        const match = pem.match(/(-----BEGIN [A-Z ]+-----)(.*?)(-----END [A-Z ]+-----)/);
        if (match) {
            pem = `${match[1]}\n${match[2].match(/.{1,64}/g)?.join('\n')}\n${match[3]}`;
        }
    }

    try {
        const sign = crypto.createSign('SHA256');
        sign.update(message);
        const signature = sign.sign({
            key: pem,
            padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
            saltLength: 32
        }, 'base64');

        const baseUrl = 'https://api.elections.kalshi.com/trade-api/v2';
        const res = await fetch(`${baseUrl}/markets?limit=5&status=open`, {
            headers: {
                'Content-Type': 'application/json',
                'KALSHI-ACCESS-KEY': keyId,
                'KALSHI-ACCESS-TIMESTAMP': timestamp,
                'KALSHI-ACCESS-SIGNATURE': signature
            }
        });

        if (res.ok) {
            const data = await res.json();
            const markets = data?.markets || [];
            if (markets.length > 0) {
                // Let's look at one that has custom_strike
                const m = markets.find((x: any) => x.custom_strike && x.custom_strike["Associated Markets"]);
                if (m) {
                    const tickers = m.custom_strike["Associated Markets"].split(',');
                    console.log(`Found complex market: ${m.ticker}`);
                    console.log(`Found ${tickers.length} associated submarkets.`);
                    
                    // Let's query the first 5 submarkets
                    for (let i = 0; i < Math.min(5, tickers.length); i++) {
                        const ticker = tickers[i].trim();
                        const detailMsg = `${timestamp}GET/trade-api/v2/markets/${ticker}`;
                        const detailSign = crypto.createSign('SHA256');
                        detailSign.update(detailMsg);
                        const detailSig = detailSign.sign({
                            key: pem,
                            padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
                            saltLength: 32
                        }, 'base64');

                        const resRes = await fetch(`${baseUrl}/markets/${ticker}`, {
                            headers: {
                                'Content-Type': 'application/json',
                                'KALSHI-ACCESS-KEY': keyId,
                                'KALSHI-ACCESS-TIMESTAMP': timestamp,
                                'KALSHI-ACCESS-SIGNATURE': detailSig
                            }
                        });
                        
                        if (resRes.ok) {
                            const subD = await resRes.json();
                            const subM = subD.market || {};
                            console.log(`- Submarket [${ticker}]: Yes Ask = ${subM.yes_ask}, Yes Bid = ${subM.yes_bid}, Last Price = ${subM.last_price_dollars || subM.last_price}, Title = "${subM.title}"`);
                        } else {
                            console.log(`- Submarket [${ticker}] failed: ${resRes.status}`);
                        }
                    }
                } else {
                    console.log("No markets with custom_strike found.");
                }
            } else {
                console.log("No markets found.");
            }
        }
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}

main();
