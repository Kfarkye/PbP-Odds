import { db } from '../firebase-admin';
import { Trend } from '../../types/trend';
import { FieldPath } from 'firebase-admin/firestore';

const FIRESTORE_IN_LIMIT = 30;

export async function fetchTrendsByIds(trendIds: string[]): Promise<Map<string, Trend>> {
  const trendsMap = new Map<string, Trend>();
  if (trendIds.length === 0) return trendsMap;

  // Deduplicate before chunking
  const uniqueTrendIds = Array.from(new Set(trendIds));
  const chunks: string[][] = [];
  
  for (let i = 0; i < uniqueTrendIds.length; i += FIRESTORE_IN_LIMIT) {
    chunks.push(uniqueTrendIds.slice(i, i + FIRESTORE_IN_LIMIT));
  }

  const queryPromises = chunks.map(chunk =>
    db.collection('trends').where(FieldPath.documentId(), 'in', chunk).get()
  );

  const snapshots = await Promise.all(queryPromises);

  snapshots.forEach(snapshot => {
    snapshot.forEach(doc => {
      trendsMap.set(doc.id, { id: doc.id, ...doc.data() } as Trend);
    });
  });

  console.log(`Fetched ${trendsMap.size} trends in chunks.`);
  return trendsMap;
}
