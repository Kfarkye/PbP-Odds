import { BotState, BotRule } from '../../types/botState';

export function transitionBotState(currentRule: BotRule, newCondition: {
  isEdgeActive?: boolean;
  isEdgeFaded?: boolean;
  isEdgeThin?: boolean;
  isUserPaused?: boolean;
  hasError?: boolean;
}): BotState {
  // Prioritize explicit user actions or critical errors
  if (newCondition.isUserPaused) {
    return BotState.PAUSED_BY_USER;
  }
  if (newCondition.hasError) {
    return BotState.ERROR;
  }

  switch (currentRule.state) {
    case BotState.ACTIVE:
      if (newCondition.isEdgeFaded) return BotState.FADED;
      if (newCondition.isEdgeThin) return BotState.THIN;
      // If still active and conditions are met, remain active
      if (newCondition.isEdgeActive) return BotState.ACTIVE;
      // Fallback if no specific active condition met, but not faded/thin
      return BotState.WATCH_ONLY; 

    case BotState.WATCH_ONLY:
      if (newCondition.isEdgeFaded) return BotState.FADED;
      if (newCondition.isEdgeThin) return BotState.THIN;
      if (newCondition.isEdgeActive) return BotState.ACTIVE; // Edge recovered
      return BotState.WATCH_ONLY; // Remain watching

    case BotState.FADED:
      // Manual Re-engagement: Once faded, requires user to re-engage
      // The UI would need to explicitly change state to ACTIVE/WATCH_ONLY
      return BotState.FADED; 

    case BotState.THIN:
      // Manual Re-engagement: Once thin, requires user to re-engage
      return BotState.THIN;

    case BotState.PAUSED_BY_USER:
      // User must explicitly unpause
      return BotState.PAUSED_BY_USER;

    case BotState.ERROR:
      // Error state requires manual intervention or specific recovery logic
      return BotState.ERROR;

    default:
      console.warn(`[STATE_MACHINE] Unknown state encountered: ${currentRule.state}. Defaulting to WATCH_ONLY.`);
      return BotState.WATCH_ONLY;
  }
}
