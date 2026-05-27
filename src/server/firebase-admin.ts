import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export function getDb() {
  if (getApps().length === 0) {
    initializeApp({
      credential: applicationDefault(),
      // Allow fallback for local development if needed
      projectId: process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829'
    });
  }
  return getFirestore();
}

export const db = getDb();
