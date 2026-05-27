// ============================================================================
// AURA: Enterprise Canonical Type Definitions
// Immutable Data Transfer Objects (DTOs) for the Orchestration Engine.
// ============================================================================

/** Semantic alias for ISO 8601 UTC timestamps (e.g., "2026-05-24T18:23:05Z") */
export type IsoTimestamp = string;

/** Semantic alias for YYYY-MM-DD date strings (e.g., "2026-05-24") */
export type DateString = string;

/** Semantic alias for globally unique identifiers */
export type CanonicalId = string;

/** Semantic alias for validated URIs/URLs */
export type Uri = string;

/** Extensible metadata dictionary for provider-specific payloads (prevents schema breaks) */
export type ProviderMetadata = Record<string, unknown>;

// ============================================================================
// 1. WORKSPACE & ENTERPRISE IDENTITY TYPES
// ============================================================================

export type UrgencyLevel = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';

export interface CanonicalEmail {
    readonly id: CanonicalId;
    readonly threadId?: CanonicalId;
    readonly subject: string;
    readonly sender: {
        readonly name: string;
        readonly email: string;
    };
    readonly body: string;
    readonly receivedAt: IsoTimestamp;
    readonly importance: UrgencyLevel;
    readonly extractedEntities: {
        readonly resolved_names: readonly string[];
        readonly action_items: readonly string[];
    };
    readonly metadata?: ProviderMetadata;
}

export type EventStatus = 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';

export interface CanonicalCalendarEvent {
    readonly id: CanonicalId;
    readonly summary: string;
    readonly description?: string | null;
    readonly startTime: IsoTimestamp;
    readonly endTime: IsoTimestamp;
    readonly isAllDay?: boolean;
    readonly organizer: string; // Email address
    readonly attendees: readonly string[];
    readonly location?: string | null;
    readonly conferenceUri?: Uri | null;
    readonly status?: EventStatus;
    readonly metadata?: ProviderMetadata;
}

export interface CanonicalDriveFile {
    readonly id: CanonicalId;
    readonly name: string;
    readonly mimeType: string;
    readonly sizeBytes: number;
    readonly owner: string;
    readonly lastModifiedBy: string;
    readonly lastModifiedAt?: IsoTimestamp;
    readonly viewUrl: Uri;
    readonly isShared?: boolean;
    readonly metadata?: ProviderMetadata;
}

export type TaskStatus = 'NEEDS_ACTION' | 'IN_PROGRESS' | 'COMPLETED' | 'DEFERRED';

export interface CanonicalTask {
    readonly id: CanonicalId;
    readonly title: string;
    readonly status: TaskStatus;
    readonly dueDate?: DateString | null;
    readonly notes?: string | null;
    readonly priority?: UrgencyLevel;
    readonly metadata?: ProviderMetadata;
}

// ============================================================================
// 2. QUANTITATIVE SPORTS TELEMETRY TYPES
// ============================================================================

export type SportsLeague = 'nba' | 'nfl' | 'mlb' | 'nhl' | 'epl' | 'mls' | 'wnba';
export type GameState = 'STATUS_SCHEDULED' | 'STATUS_IN_PROGRESS' | 'STATUS_HALFTIME' | 'STATUS_FINAL' | 'STATUS_POSTPONED' | 'STATUS_CANCELED';

export interface CanonicalTeam {
    readonly id: CanonicalId; // Upstream provider ID
    readonly name: string; // e.g., "Los Angeles Lakers"
    /** Deterministically resolved 3-letter canonical abbreviation (e.g., "LAL") */
    readonly abbreviation: string; 
    readonly location?: string;
    readonly logo?: Uri | null;
    readonly primaryColorHex?: string | null; // e.g., "#552583"
}

export interface CanonicalGame {
    readonly id: CanonicalId;
    readonly league: SportsLeague;
    readonly status: GameState;
    /** Human-readable status (e.g., "Final", "Q3 4:12", "Top 5th") */
    readonly shortStatus: string;
    readonly startTime: IsoTimestamp; 
    readonly venue?: string | null;
    readonly broadcastNetwork?: string | null;
    
    readonly homeTeam: CanonicalTeam;
    readonly awayTeam: CanonicalTeam;
    
    // Live State
    readonly homeScore?: number | null; 
    readonly awayScore?: number | null; 
    readonly currentPeriod?: number; // e.g., 3 (for 3rd Quarter)
    readonly clock?: string; // e.g., "10:45"
    readonly possession?: string; // Abbreviation of team currently with the ball
    
    readonly metadata?: ProviderMetadata;
}

// ============================================================================
// 3. FINANCIAL & BETTING MARKET TYPES
// ============================================================================

export type OddsProvider = 'kalshi' | 'draftkings' | 'fanduel' | 'pinnacle' | 'consensus' | string;

/**
 * Universal interface bridging traditional Sportsbook data with Prediction Market (Binary) data.
 */
export interface OddsValue {
    readonly provider: OddsProvider;
    readonly ticker?: string; // e.g., "KX-NBA-LAL-GSW" (For Kalshi)
    
    // Traditional Sportsbook
    readonly line?: string; // e.g., "+150", "-110", "-4.5", "O 218.5"
    readonly threshold?: number; // The exact numerical line (e.g., 218.5, -4.5)
    
    // Quantitative / Prediction Market
    readonly priceCents?: number; // Raw trading price execution
    readonly impliedProbability?: number; // 0.00 to 1.00 (e.g., 0.524)
    readonly americanOdds?: string; // Calculated or explicit (e.g., "+150")
    
    readonly lastUpdated?: IsoTimestamp;
}

/**
 * A unified ledger of active market pricing for a Canonical Game.
 */
export interface CanonicalOdds {
    readonly gameId: CanonicalId;
    readonly homeTeamAbbr: string;
    readonly awayTeamAbbr: string;
    
    readonly moneylineHome?: OddsValue;
    readonly moneylineAway?: OddsValue;
    
    readonly spreadHome?: OddsValue;
    readonly spreadAway?: OddsValue;
    
    readonly overUnder?: OddsValue;

    readonly metadata?: ProviderMetadata;
}
