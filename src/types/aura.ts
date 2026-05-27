// ============================================================================
// Aura App State Definitions
// Basic data interfaces and layout structures for our sports intelligence application.
// ============================================================================

/** Unique ID string */
export type CanonicalId = string;

/** ISO timestamp string */
export type Iso8601Timestamp = string;

/** Standard CSS Color string (hex or name) */
export type HexColor = string;

/** Standard web URL string */
export type UriString = string;

// ============================================================================
// Database Response States
// Tells us if the game query returned live data, schedule, or something else
// ============================================================================
export type ResolutionState = 
  | 'LIVE_DATA' 
  | 'NO_GAMES_SCHEDULED' 
  | 'OFF_SEASON' 
  | 'GROUNDING_FAULT'
  | 'DEPLOYED'
  | 'PENDING'
  | 'CONVERSATIONAL'
  | 'COLD_STORAGE_DATA'
  | 'HOT_MEMORY_DATA';

// ============================================================================
// Display Component Types
// Tells the renderer layout style to show
// ============================================================================
export type AuraArtifactType = 
  | 'SPORTS_ARTIFACT' 
  | 'WORK_ARTIFACT' 
  | 'MARKETS_ARTIFACT' 
  | 'SYSTEM_MESSAGE' 
  | 'TRUST_GATE_RECEIPT'
  | 'WAGERING_ARTIFACT'
  | 'WIN_PROBABILITY_ARTIFACT'
  | 'PLAYER_PROP_ARTIFACT'
  | 'GAME_SCHEDULE_ARTIFACT'
  | 'EMAIL_MIME_ARTIFACT'
  | 'YOUTUBE_MEDIA'
  | 'BETTING_ANALYSIS'
  | 'WORKSPACE_MUTATION_ARTIFACT'
  | 'DRIVE_DOC_ARTIFACT'
  | 'TEAM_PROFILE_ARTIFACT'
  | 'PLAYER_PROFILE_ARTIFACT'
  | 'LEAGUE_PROFILE_ARTIFACT'
  | 'GITHUB_CONNECTION_ARTIFACT';

// ============================================================================
// Main Card Data Format
// ============================================================================
export interface AuraArtifact<TPayload = any> {
  readonly id: CanonicalId;
  readonly type: AuraArtifactType;
  readonly resolution_state: ResolutionState;
  readonly context_summary?: string;
  readonly data?: TPayload; 
}

// ============================================================================
// Chat Message Interfaces
// ============================================================================
export interface AuraHistoryMessage {
  readonly role: 'user' | 'model';
  readonly content: string;
}

export interface AuraChatMessage {
  readonly id: CanonicalId;
  readonly role: 'user' | 'model';
  readonly content?: string;
  readonly artifacts?: readonly AuraArtifact[];
  readonly image?: UriString;
}

export interface AuraChatResponse {
  readonly artifacts: readonly AuraArtifact[];
}

// ============================================================================
// Sports & Betting Data Models
// ============================================================================

export interface WageringOdds {
  readonly provider: string;
  readonly details?: string;       // e.g. "Lakers -1.5"
  readonly overUnder?: number;     // e.g. 215.5
  readonly moneyline?: string;     // e.g. "+150"
}

export interface TeamState {
  readonly id: CanonicalId;
  readonly name: string;
  readonly abbreviation: string;
  readonly logo?: UriString;
  readonly score?: number;         
}

export interface LeagueContext {
  readonly teamAbbreviation: string;
  readonly groupName: string;      // e.g., 'Western Conference'
  readonly gamesBack: string | number;
  readonly streak: string;         // e.g., 'W4' or 'L2'
  readonly winPercent: string;     // e.g., '.650'
  readonly overallRecord: string;  // e.g., '45-22'
  readonly seed?: string | number;
}

export interface InjuredPlayer {
  readonly id: CanonicalId;
  readonly name: string;
  readonly position: string;
  readonly status: string;         // e.g., 'Questionable'
}

export interface TeamInjuries {
  readonly teamAbbreviation: string;
  readonly players: readonly InjuredPlayer[];
}

export interface SportsData {
  readonly game_id: CanonicalId;
  readonly status: string;         // e.g., 'STATUS_IN_PROGRESS'
  readonly short_status?: string;  // e.g., 'Q3 4:12'
  readonly home_team: TeamState;
  readonly away_team: TeamState;
  readonly venue?: string;
  readonly start_time: Iso8601Timestamp;
  
  readonly injuries?: readonly TeamInjuries[];
  readonly odds?: readonly WageringOdds[];
  readonly series_summary?: string;
  readonly game_notes?: string;
}

export interface SportsArtifactData {
  readonly events: readonly SportsData[];
  readonly league_context?: LeagueContext;
}

export interface WageringMarketData extends SportsData {
  readonly odds: readonly WageringOdds[];
}

// ============================================================================
// Helper Layout Blocks
// ============================================================================

export interface WinProbabilityDataUnit {
  readonly playId: CanonicalId;
  readonly homeWinPercentage: number;
  readonly awayWinPercentage: number;
  readonly playDescription?: string;
  readonly timestamp?: number;
}

export interface WinProbabilityArtifactData {
  readonly gameId: CanonicalId;
  readonly homeTeam: { 
    readonly name: string; 
    readonly abbreviation: string; 
    readonly color: HexColor; 
    readonly logo: UriString; 
  };
  readonly awayTeam: { 
    readonly name: string; 
    readonly abbreviation: string; 
    readonly color: HexColor; 
    readonly logo: UriString; 
  };
  readonly probabilities: readonly WinProbabilityDataUnit[];
}

export interface PlayerProp {
  readonly playerId: CanonicalId;
  readonly playerName: string;
  readonly headshot?: UriString;
  readonly teamAbbreviation: string;
  readonly teamColor?: HexColor;
  readonly statName: string;       // e.g. "Points"
  readonly currentValue: number;
  readonly propLine: number;       // e.g. 24.5
  readonly overPrice: string;      // e.g. "-110" or "MORE"
  readonly underPrice: string;     // e.g. "+105" or "LESS"
}

export interface PlayerPropArtifactData {
  readonly gameId: CanonicalId;
  readonly props: readonly PlayerProp[];
}
