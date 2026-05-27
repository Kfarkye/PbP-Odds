import { collection, query, where, getDocs, writeBatch, doc, limit } from 'firebase/firestore';

export async function migrateHistoricalDataToBigQuery(db: any) {
    console.log('[BigQueryMigrator] Starting migration job...');
    const now = Date.now();
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
    const cutoffThreshold = now - TWENTY_FOUR_HOURS_MS;
    
    try {
        // Evaluate in small batches to preserve quota
        const q = query(collection(db, 'sports_games_staging'), where('status', '==', 'STATUS_FINAL'), limit(25));
        const gamesSnap = await getDocs(q);
        console.log(`[BigQueryMigrator] Found ${gamesSnap.size} final games to evaluate for cold storage.`);

        const batch = writeBatch(db);
        let migratedCount = 0;

        for (const document of gamesSnap.docs) {
            const data = document.data();
            if (data.scheduled_at_utc) {
                const gameDate = new Date(data.scheduled_at_utc).getTime();
                if (gameDate < cutoffThreshold) {
                    const bqDocRef = doc(collection(db, 'bq_historical_games'), document.id);
                    batch.set(bqDocRef, data);

                    const logsQ = query(collection(db, 'sports_player_game_logs_staging'), where('game_id', '==', document.id));
                    const logsSnap = await getDocs(logsQ);
                    
                    logsSnap.forEach((logDoc) => {
                         const bqLogRef = doc(collection(db, 'bq_historical_logs'), logDoc.id);
                         batch.set(bqLogRef, logDoc.data());
                    });

                    migratedCount++;
                }
            }
        }

        if (migratedCount > 0) {
            await batch.commit();
            console.log(`[BigQueryMigrator] Successfully migrated ${migratedCount} games and their logs to cold storage.`);
        } else {
            console.log('[BigQueryMigrator] No games older than 24h found for migration.');
        }

    } catch (e) {
        console.error('[BigQueryMigrator] Error during migration:', e);
    }
}

