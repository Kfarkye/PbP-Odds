let dbDisabledUntil = 0;
let dbDisabledReason: string | null = null;

/**
 * Returns the current database disabled reason if active, otherwise null.
 */
export function getDbDisabledReason(): string | null {
    if (Date.now() < dbDisabledUntil) {
        return dbDisabledReason;
    }
    return null;
}

/**
 * Checks if the database is currently disabled due to circuit breaker cooldown.
 */
export function isDbDisabled(): boolean {
    return Date.now() < dbDisabledUntil;
}

/**
 * Reports a Firestore error to the circuit breaker.
 * If the error represents a quota limit exceeded/exhaustion, it trips the beaker.
 */
export function reportDbError(err: any, context: string = 'General') {
    const errMsg = err?.message || String(err);
    const errCode = err?.code || '';
    const isQuotaExceeded = errCode === 'resource-exhausted' || 
                            errMsg.includes('Quota exceeded') ||
                            errMsg.includes('quota metric') ||
                            errMsg.includes('Quota limit exceeded');

    if (isQuotaExceeded) {
        // Break circuit for 15 minutes to avoid hitting depleted collections
        dbDisabledUntil = Date.now() + 15 * 60 * 1000;
        dbDisabledReason = `Quota exceeded fallback active (${context})`;
        console.warn(`[CIRCUIT BREAKER] Tripped at [${context}] due to Firestore quota exhaustion. Backing off database queries for 15 minutes. Error details: ${errMsg}`);
    } else if (errMsg.includes('Missing or insufficient permissions') || errCode === 'permission-denied' || errMsg.includes('permission-denied')) {
        // Structurally blocked due to Firebase permissions. Disable DB queries for 24 hours to avoid error clutter.
        dbDisabledUntil = Date.now() + 24 * 60 * 60 * 1000;
        dbDisabledReason = `Permissions blocked (${context})`;
        console.info(`[AURA DATABASE] Gracefully bypassing Firestore queries for 24 hours due to unauthenticated / permission constraints at [${context}]. Falling back entirely to high-performance real-time API adapters.`);
    } else {
        // Less critical database errors trigger a brief 10 second delay
        dbDisabledUntil = Date.now() + 10 * 1000;
        dbDisabledReason = `Transient failure (${context})`;
        console.warn(`[CIRCUIT BREAKER] Short cooldown at [${context}] due to transient DB error: ${errMsg}`);
    }
}

/**
 * Resets the circuit breaker state (useful if billing was enabled or databases reset).
 */
export function resetBreaker() {
    dbDisabledUntil = 0;
    dbDisabledReason = null;
    console.log('[CIRCUIT BREAKER] Reset successfully.');
}
