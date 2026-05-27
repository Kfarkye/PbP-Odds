import { db } from '../firebase-admin';

interface RuleFiringData {
  ruleId: string;
  gameId: string;
  firedAt: Date;
  decision: 'ALERT' | 'ORDER_PLACED' | 'NO_ACTION';
  details: any; // Specifics of the firing
}

export async function recordRuleFiring(firing: RuleFiringData) {
  const docId = `${firing.ruleId}_${firing.gameId}`; // Deterministic ID ensures idempotency
  const ruleFiringRef = db.collection('rule_firings').doc(docId);

  await ruleFiringRef.set(firing, { merge: true }); // UPSERT behavior
  console.log(`Rule firing recorded/updated: ${docId}`);
}
