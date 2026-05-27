import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import fs from 'fs';
import { migrateHistoricalDataToBigQuery } from './src/server/jobs/bigquery-migrator';

async function run() {
    const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

    await migrateHistoricalDataToBigQuery(db);
    console.log('Migration Complete.');
    process.exit(0);
}

run().catch(console.error);
