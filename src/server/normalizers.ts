// ============================================================================
// AURA: API Telemetry Normalization Layer
// Translates volatile external JSON payloads into Immutable Canonical DTOs
// ============================================================================

import { 
    CanonicalEmail, 
    CanonicalCalendarEvent, 
    CanonicalDriveFile, 
    CanonicalTask,
    CanonicalGame,
    CanonicalOdds,
    UrgencyLevel,
    TaskStatus,
    SportsLeague,
    GameState,
    EventStatus
} from '../types/canonical';
import { resolveTeamAbbreviation } from './entity-resolution';

const LOG_PREFIX = '[AURA:NORMALIZER]';

// ============================================================================
// 1. Internal Defensive Utilities
// ============================================================================

/**
 * Safely decodes RFC 4648 URL-Safe Base64 strings commonly used in Google APIs.
 * Prevents Node.js Buffer crashes on malformed padding.
 */
function decodeUrlSafeBase64(data?: string | null): string {
    if (!data) return '';
    try {
        const standardBase64 = data.replace(/-/g, '+').replace(/_/g, '/');
        return Buffer.from(standardBase64, 'base64').toString('utf8');
    } catch {
        return '';
    }
}

/**
 * Ensures an ISO 8601 string is returned, degrading gracefully to current time on invalid inputs.
 */
function safeIsoDate(dateStr?: string | number | null): string {
    if (!dateStr) return new Date().toISOString();
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

/**
 * Safely extracts numerical values, dropping NaNs to prevent mathematical propagation (Infinity).
 */
function safeParseFloat(val: unknown, fallback?: number): number | undefined {
    if (val === null || val === undefined) return fallback;
    const parsed = parseFloat(String(val).replace(/[^\d.-]/g, ''));
    return isNaN(parsed) ? fallback : parsed;
}

function safeParseInt(val: unknown, fallback?: number): number | undefined {
    if (val === null || val === undefined) return fallback;
    const parsed = parseInt(String(val).replace(/[^\d-]/g, ''), 10);
    return isNaN(parsed) ? fallback : parsed;
}

// ============================================================================
// 2. Google Workspace & Identity Normalizers
// ============================================================================

/**
 * Normalizes Raw Gmail Message JSON to CanonicalEmail
 */
export function normalizeGmailMessage(raw: Record<string, any>): CanonicalEmail | null {
    if (!raw || !raw.id) return null;

    const headers: Array<{ name: string; value: string }> = raw.payload?.headers || [];
    const getHeader = (key: string) => headers.find(h => h.name.toLowerCase() === key.toLowerCase())?.value;
    
    // Header Extraction
    const subject = getHeader('subject') || '(No Subject)';
    const senderRaw = getHeader('from') || 'Unknown Sender <unknown@domain.local>';
    const dateHeader = getHeader('date') || raw.internalDate;
    
    // Sender Parsing
    let name = senderRaw;
    let email = senderRaw;
    const match = senderRaw.match(/^(.*?)\s*<(.*?)>$/);
    if (match) {
        name = match[1].replace(/"/g, '').trim() || match[2].trim();
        email = match[2].trim();
    }

    // Body Extraction (Traverses multipart/alternative MIME structures)
    let body = raw.snippet || '';
    if (raw.payload?.parts) {
        const textPart = raw.payload.parts.find((p: any) => p.mimeType === 'text/plain');
        if (textPart?.body?.data) {
            body = decodeUrlSafeBase64(textPart.body.data);
        }
    } else if (raw.payload?.body?.data) {
        body = decodeUrlSafeBase64(raw.payload.body.data);
    }

    // Truncate payload to protect the LLM context window from memory exhaustion
    const maxBodyLen = 1500;
    const truncatedBody = body.length > maxBodyLen ? `${body.substring(0, maxBodyLen)}\n...[TRUNCATED]` : body;

    // Heuristic Urgency Evaluation
    let importance: UrgencyLevel = 'NORMAL';
    const lowerBody = truncatedBody.toLowerCase();
    if (/(urgent|asap|critical|action required|outage)/i.test(lowerBody) || /(urgent|action required)/i.test(subject.toLowerCase())) {
        importance = 'HIGH';
    }

    // Deterministic Action Item Extraction
    const actionItems: string[] = [];
    const lines = truncatedBody.split('\n');
    for (const line of lines) {
        if (/\b(todo|please|need to|action:|verify)\b/i.test(line)) {
            const cleanLine = line.replace(/^[>\-\s]+/, '').trim();
            if (cleanLine.length > 10 && actionItems.length < 3) actionItems.push(cleanLine);
        }
    }
    if (actionItems.length === 0) actionItems.push("Review thread context for implicit actions.");

    return {
        id: raw.id,
        threadId: raw.threadId,
        subject,
        sender: { name, email },
        body: truncatedBody.trim(),
        receivedAt: safeIsoDate(dateHeader),
        importance,
        extractedEntities: {
            resolved_names: [], // Hydrated downstream by NLP services
            action_items: actionItems
        }
    };
}

/**
 * Normalizes Raw Calendar Event JSON to CanonicalCalendarEvent
 */
export function normalizeCalendarEvent(raw: Record<string, any>): CanonicalCalendarEvent | null {
    if (!raw || !raw.id) return null;

    const attendees = (raw.attendees || []).map((a: any) => a.email).filter(Boolean);
    const summary = raw.summary || '(Untitled Event)';
    
    const isAllDay = !!(raw.start?.date && !raw.start?.dateTime);
    
    let status: EventStatus = 'CONFIRMED';
    if (raw.status === 'cancelled') status = 'CANCELLED';
    if (raw.status === 'tentative') status = 'TENTATIVE';

    return {
        id: raw.id,
        summary,
        description: raw.description || null,
        startTime: safeIsoDate(raw.start?.dateTime || raw.start?.date),
        endTime: safeIsoDate(raw.end?.dateTime || raw.end?.date),
        isAllDay,
        organizer: raw.organizer?.email || 'unknown@domain.local',
        attendees,
        location: raw.location || null,
        conferenceUri: raw.hangoutLink || null,
        status
    };
}

/**
 * Normalizes Raw Google Drive File JSON to CanonicalDriveFile
 */
export function normalizeDriveFile(raw: Record<string, any>): CanonicalDriveFile | null {
    if (!raw || !raw.id) return null;

    const ownerName = raw.owners?.[0]?.displayName || 'System';
    const lastModifier = raw.lastModifyingUser?.displayName || ownerName;

    return {
        id: raw.id,
        name: raw.name || 'Untitled Document',
        mimeType: raw.mimeType || 'application/octet-stream',
        sizeBytes: safeParseInt(raw.size, 0)!,
        owner: ownerName,
        lastModifiedBy: lastModifier,
        lastModifiedAt: safeIsoDate(raw.modifiedTime),
        viewUrl: raw.webViewLink || `https://drive.google.com/open?id=${raw.id}`,
        isShared: !!raw.shared
    };
}

/**
 * Normalizes Raw Google Task JSON to CanonicalTask
 */
export function normalizeTask(raw: Record<string, any>): CanonicalTask | null {
    if (!raw || !raw.id) return null;

    let status: TaskStatus = 'NEEDS_ACTION';
    if (raw.status === 'completed') status = 'COMPLETED';

    return {
        id: raw.id,
        title: raw.title || '(No Title)',
        status,
        dueDate: raw.due ? raw.due.split('T')[0] : null,
        notes: raw.notes || null
    };
}

// ============================================================================
// 3. Quantitative Sports Normalizers
// ============================================================================

/**
 * Normalizes Raw ESPN Sports Event to CanonicalGame with Disambiguated Entity Resolution
 */
export function normalizeEspnGame(raw: Record<string, any>): CanonicalGame | null {
    const comp = raw?.competitions?.[0];
    if (!comp || !comp.competitors) return null; // Protective structural discard

    const homeComp = comp.competitors.find((c: any) => c.homeAway === 'home');
    const awayComp = comp.competitors.find((c: any) => c.homeAway === 'away');
    if (!homeComp || !awayComp) return null;

    // Strict League Mapping
    const rawLeague = (comp.lg?.abbreviation || raw.season?.slug || 'nba').toLowerCase();
    const league: SportsLeague = ['nba', 'nfl', 'mlb', 'nhl', 'epl', 'mls', 'wnba'].includes(rawLeague) ? (rawLeague as SportsLeague) : 'nba';

    // Disambiguated Resolution (Prevents "Kings" from routing Sacramento in an NHL query)
    const homeAbbr = resolveTeamAbbreviation(homeComp.team?.displayName || homeComp.team?.name, { league });
    const awayAbbr = resolveTeamAbbreviation(awayComp.team?.displayName || awayComp.team?.name, { league });

    if (!homeAbbr || !awayAbbr) return null; // Drop events missing entity integrity

    // Status Mapping Matrix
    let canonicalStatus: GameState = 'STATUS_SCHEDULED';
    const rawState = comp.status?.type?.state;
    if (rawState === 'post') canonicalStatus = 'STATUS_FINAL';
    else if (rawState === 'in') canonicalStatus = 'STATUS_IN_PROGRESS';
    else if (comp.status?.type?.name === 'STATUS_HALFTIME') canonicalStatus = 'STATUS_HALFTIME';
    else if (comp.status?.type?.name === 'STATUS_POSTPONED') canonicalStatus = 'STATUS_POSTPONED';
    else if (comp.status?.type?.name === 'STATUS_CANCELED') canonicalStatus = 'STATUS_CANCELED';

    const isPreGame = canonicalStatus === 'STATUS_SCHEDULED' || canonicalStatus === 'STATUS_POSTPONED' || canonicalStatus === 'STATUS_CANCELED';

    return {
        id: raw.id,
        league,
        status: canonicalStatus,
        shortStatus: comp.status?.type?.shortDetail || 'TBD',
        startTime: safeIsoDate(raw.date),
        venue: comp.venue?.fullName || null,
        broadcastNetwork: comp.broadcasts?.[0]?.names?.[0] || null,
        
        homeTeam: {
            id: homeComp.team?.id || `home_${homeAbbr}`,
            name: homeComp.team?.displayName || homeComp.team?.name || 'Home Team',
            abbreviation: homeAbbr,
            logo: homeComp.team?.logo || null,
            primaryColorHex: homeComp.team?.color ? `#${homeComp.team.color}` : null
        },
        awayTeam: {
            id: awayComp.team?.id || `away_${awayAbbr}`,
            name: awayComp.team?.displayName || awayComp.team?.name || 'Away Team',
            abbreviation: awayAbbr,
            logo: awayComp.team?.logo || null,
            primaryColorHex: awayComp.team?.color ? `#${awayComp.team.color}` : null
        },
        
        homeScore: isPreGame ? null : safeParseInt(homeComp.score),
        awayScore: isPreGame ? null : safeParseInt(awayComp.score),
        clock: comp.status?.displayClock || undefined,
        currentPeriod: safeParseInt(comp.status?.period),
        possession: comp.situation?.possession ? resolveTeamAbbreviation(comp.situation.possession) : undefined
    };
}

// ============================================================================
// 4. Financial Market Normalizers
// ============================================================================

/**
 * Normalizes Traditional Sportsbook Odds to CanonicalOdds
 */
export function normalizeDraftKingsOdds(rawGameId: string, homeAbbr: string, awayAbbr: string, rawOdds: Record<string, any>): CanonicalOdds | null {
    if (!rawOdds) return null;

    const provider = (rawOdds.provider?.name || rawOdds.provider || 'draftkings').toLowerCase();
    
    let spreadH: number | undefined;
    let spreadA: number | undefined;

    // Advanced Regex parsing for compressed detail strings (e.g. "LAL -4.5")
    if (rawOdds.details) {
        const detailsStr = String(rawOdds.details).trim();
        const match = detailsStr.match(/^([A-Za-z0-9\s]+)\s+([+-]?\d*(?:\.\d+)?)$/);
        
        if (match) {
            const favAbbr = resolveTeamAbbreviation(match[1], { fallbackToInput: false });
            const spreadVal = safeParseFloat(match[2]);
            
            if (spreadVal !== undefined) {
                if (favAbbr === homeAbbr) {
                    spreadH = spreadVal;
                    spreadA = -spreadVal;
                } else if (favAbbr === awayAbbr) {
                    spreadA = spreadVal;
                    spreadH = -spreadVal;
                }
            }
        }
    }

    const mlHomeRaw = rawOdds.homeMoneyLine ?? rawOdds.moneyline?.home ?? rawOdds.home_ml;
    const mlAwayRaw = rawOdds.awayMoneyLine ?? rawOdds.moneyline?.away ?? rawOdds.away_ml;
    const ouRaw = rawOdds.overUnder ?? rawOdds.total?.over;

    return {
        gameId: rawGameId,
        homeTeamAbbr: homeAbbr,
        awayTeamAbbr: awayAbbr,
        moneylineHome: mlHomeRaw ? { 
            provider, 
            line: String(mlHomeRaw), 
            americanOdds: String(mlHomeRaw) 
        } : undefined,
        moneylineAway: mlAwayRaw ? { 
            provider, 
            line: String(mlAwayRaw), 
            americanOdds: String(mlAwayRaw) 
        } : undefined,
        spreadHome: spreadH !== undefined ? { 
            provider, 
            line: spreadH > 0 ? `+${spreadH}` : `${spreadH}`, 
            threshold: spreadH 
        } : undefined,
        spreadAway: spreadA !== undefined ? { 
            provider, 
            line: spreadA > 0 ? `+${spreadA}` : `${spreadA}`, 
            threshold: spreadA 
        } : undefined,
        overUnder: ouRaw ? { 
            provider, 
            line: `O/U ${ouRaw}`, 
            threshold: safeParseFloat(ouRaw) 
        } : undefined
    };
}

/**
 * Normalizes Quantitative Prediction Market pricing to CanonicalOdds
 */
export function normalizeKalshiOdds(rawGameId: string, homeAbbr: string, awayAbbr: string, rawMarket: Record<string, any>): CanonicalOdds | null {
    if (!rawMarket || (!rawMarket.yes_ask_dollars && !rawMarket.implied_probability)) return null;

    // Extract probability cleanly (handles Kalshi's varying formats of cents vs dollars vs percentages)
    let yesProb = safeParseFloat(rawMarket.yes_ask_dollars);
    if (yesProb === undefined && rawMarket.implied_probability !== undefined) {
        yesProb = safeParseFloat(rawMarket.implied_probability, 0)! / 100;
    }
    
    if (yesProb === undefined || isNaN(yesProb)) return null;
    
    // Mathematical Clamping & Defense to prevent Infinity Generation in American Odds
    const clampedYes = Math.max(0.001, Math.min(yesProb, 0.999)); 
    const clampedNo = 1 - clampedYes;

    const calculateAmericanOdds = (prob: number): string => {
        const p = prob * 100;
        return p >= 50 
            ? `-${Math.round((p / (100 - p)) * 100)}`
            : `+${Math.round(((100 - p) / p) * 100)}`;
    };

    const homeLine = calculateAmericanOdds(clampedYes);
    const awayLine = calculateAmericanOdds(clampedNo);

    return {
        gameId: rawGameId,
        homeTeamAbbr: homeAbbr,
        awayTeamAbbr: awayAbbr,
        moneylineHome: { 
            provider: 'kalshi', 
            ticker: rawMarket.ticker || undefined,
            line: homeLine,
            priceCents: Math.round(clampedYes * 100), 
            impliedProbability: Number(clampedYes.toFixed(4)),
            americanOdds: homeLine
        },
        moneylineAway: { 
            provider: 'kalshi', 
            ticker: rawMarket.ticker || undefined,
            line: awayLine,
            priceCents: Math.round(clampedNo * 100), 
            impliedProbability: Number(clampedNo.toFixed(4)),
            americanOdds: awayLine
        }
    };
}
