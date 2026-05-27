import { db } from '../firebase-admin';
import { BotState } from '../../types/botState';

interface RuleEvent {
  ruleId: string;
  timestamp: Date;
  eventType: 'STATE_CHANGE' | 'EVALUATED' | 'ERROR';
  details: string;
  oldState?: BotState;
  newState?: BotState;
}

export async function updateRuleAndLogEvent(
  ruleId: string,
  newRuleState: BotState,
  eventDetails: string,
  oldRuleState?: BotState
) {
  const batch = db.batch();

  // 1. Update the rule's status
  const ruleRef = db.collection('rules').doc(ruleId);
  batch.update(ruleRef, { state: newRuleState, lastEvaluatedAt: new Date() });

  // 2. Log the event to an audit ledger atomically
  const ruleEventRef = db.collection('rule_events').doc(); // Firestore generates ID
  const event: RuleEvent = {
    ruleId,
    timestamp: new Date(),
    eventType: 'STATE_CHANGE',
    details: eventDetails,
    oldState: oldRuleState,
    newState: newRuleState,
  };
  batch.set(ruleEventRef, event);

  // Commit both operations
  await batch.commit();
  console.log(`[RULE_UPDATER] Rule ${ruleId} state updated to ${newRuleState} and event logged.`);
}
