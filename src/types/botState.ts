export enum BotState {
  ACTIVE = 'ACTIVE',
  WATCH_ONLY = 'WATCH_ONLY',
  FADED = 'FADED',
  THIN = 'THIN',
  PAUSED_BY_USER = 'PAUSED_BY_USER',
  ERROR = 'ERROR'
}

export interface BotRule {
  id: string;
  name: string;
  state: BotState;
  lastEvaluatedAt: Date;
  trend_id: string;
  // Metadata for snapshotting at creation
  hit_rate_at_pin?: number;
}
