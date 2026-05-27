const ESPN_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports';
const DEFAULT_SCOREBOARD_TIMEZONE = process.env.SPORTS_SCOREBOARD_TIMEZONE?.trim() || 'America/New_York';
const DEFAULT_FETCH_TIMEOUT_MS = 10000;
const DEFAULT_FETCH_RETRIES = 2;
const BACKOFF_BASE_MS = 250;
const BACKOFF_MAX_MS = 4000;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

type EspnFetchErrorType = 'http' | 'timeout' | 'network';

interface EspnFetchTelemetry {
  sourceAttempts: number;
  sourceFailures: number;
  retryCount: number;
}

const espnFetchTelemetry: EspnFetchTelemetry = {
  sourceAttempts: 0,
  sourceFailures: 0,
  retryCount: 0
};

const LEAGUE_TO_SPORT: Record<string, string> = {
  nba: 'basketball',
  wnba: 'basketball',
  nfl: 'football',
  mlb: 'baseball',
  nhl: 'hockey'
};

export interface EspnBackfillTeamSnapshot {
  id: string;
  name: string;
  abbreviation: string;
  logoUrl: string | null;
  score: number | null;
}

export interface EspnBackfillGame {
  eventId: string;
  season: number;
  date: string;
  requestedDate: string;
  scheduledAtUtc: string | null;
  scheduledDateUtc: string | null;
  scheduledDateLocal: string | null;
  scheduledDateTimezone: string;
  status: string;
  homeTeam: EspnBackfillTeamSnapshot;
  awayTeam: EspnBackfillTeamSnapshot;
  homeScore: number | null;
  awayScore: number | null;
  venue: string | null;
  sourceUrl: string;
  rawEvent: unknown;
}

export interface EspnBackfillBatch {
  source: 'espn';
  league: string;
  sport: string;
  date: string;
  url: string;
  games: EspnBackfillGame[];
  recordsExtracted: number;
}

export interface EspnBackfillPlayer {
  sourcePlayerId: string;
  name: string;
  teamId: string;
  teamName: string;
  position: string | null;
  headshotUrl: string | null;
}

export interface EspnBackfillPlayerGameLog {
  sourceGameId: string;
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  opponentTeamId: string;
  opponentTeamName: string;
  date: string;
  minutes: number | null;
  minutesRaw: string | null;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  steals: number | null;
  blocks: number | null;
  turnovers: number | null;
  fieldGoalsMade: number | null;
  fieldGoalsAttempted: number | null;
  threePointsMade: number | null;
  threePointsAttempted: number | null;
  freeThrowsMade: number | null;
  freeThrowsAttempted: number | null;
  sourceUrl: string;
  fetchedAt: string;
}

export interface EspnBackfillNbaPlayerBatch {
  source: 'espn';
  league: 'nba';
  sourceGameId: string;
  url: string;
  fetchedAt: string;
  players: EspnBackfillPlayer[];
  playerGameLogs: EspnBackfillPlayerGameLog[];
  skippedRows: string[];
  recordsExtracted: number;
}

interface FetchEspnScoreboardParams {
  league: string;
  date: string; // YYYY-MM-DD
  limit?: number;
}

interface FetchEspnNbaPlayerStatsParams {
  game: EspnBackfillGame;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function sourceTimeoutMs(): number {
  const configured = process.env.ESPN_FETCH_TIMEOUT_MS ?? process.env.SPORTS_SOURCE_TIMEOUT_MS;
  return parsePositiveInt(configured, DEFAULT_FETCH_TIMEOUT_MS);
}

function sourceRetryCount(): number {
  const configured = process.env.ESPN_FETCH_RETRIES ?? process.env.SPORTS_SOURCE_RETRIES;
  return parsePositiveInt(configured, DEFAULT_FETCH_RETRIES);
}

function sourcePathMetadata(rawUrl: string): { path: string; date: string | null; eventId: string | null } {
  try {
    const parsed = new URL(rawUrl);
    const rawDate = parsed.searchParams.get('dates');
    const eventId = parsed.searchParams.get('event');

    const date = rawDate && /^\d{8}$/.test(rawDate)
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
      : rawDate;

    return {
      path: parsed.pathname,
      date: date ?? null,
      eventId: eventId ?? null
    };
  } catch {
    return {
      path: 'invalid-url',
      date: null,
      eventId: null
    };
  }
}

function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue) {
    return null;
  }
  const trimmed = headerValue.trim();
  if (!trimmed) {
    return null;
  }

  const seconds = Number.parseInt(trimmed, 10);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const parsedDate = new Date(trimmed);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }
  return Math.max(0, parsedDate.getTime() - Date.now());
}

function isRetryableHttpStatus(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status);
}

function isNonRetryableHttpStatus(status: number): boolean {
  return status >= 400 && status < 500 && status !== 429;
}

function computeBackoffMs(attempt: number): number {
  const exponent = Math.max(0, attempt - 1);
  const expDelay = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * (2 ** exponent));
  const jitter = Math.floor(Math.random() * BACKOFF_BASE_MS);
  return expDelay + jitter;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function safeLogFetchAttempt(params: {
  path: string;
  date: string | null;
  eventId: string | null;
  status: number | null;
  attempt: number;
  durationMs: number;
  willRetry: boolean;
  errorType: EspnFetchErrorType;
}): void {
  const logPayload = {
    source: 'espn',
    path: params.path,
    date: params.date,
    event_id: params.eventId,
    status: params.status,
    attempt: params.attempt,
    duration_ms: params.durationMs,
    will_retry: params.willRetry,
    error_type: params.errorType
  };
  console.warn(`[espn-fetch] ${JSON.stringify(logPayload)}`);
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

async function fetchJsonWithRetry(params: {
  url: string;
  requestName: string;
}): Promise<any> {
  const { url, requestName } = params;
  const timeoutMs = sourceTimeoutMs();
  const retries = sourceRetryCount();
  const maxAttempts = Math.max(1, retries + 1);
  const metadata = sourcePathMetadata(url);

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    espnFetchTelemetry.sourceAttempts += 1;
    if (attempt > 1) {
      espnFetchTelemetry.retryCount += 1;
    }

    const startedAt = Date.now();
    
    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Fetch timed out')), timeoutMs);
    });

    try {
      const response = await Promise.race([fetch(url), timeoutPromise]) as Response;
      if (!response.ok) {
        const status = response.status;
        const durationMs = Date.now() - startedAt;
        const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));

        const nonRetryable = isNonRetryableHttpStatus(status);
        const retryable = isRetryableHttpStatus(status);
        const canRetry = retryable && attempt < maxAttempts;

        safeLogFetchAttempt({
          ...metadata,
          status,
          attempt,
          durationMs,
          willRetry: canRetry,
          errorType: 'http'
        });

        if (nonRetryable || !canRetry) {
          espnFetchTelemetry.sourceFailures += 1;
          throw new Error(`${requestName} failed (${status}) for ${url}`);
        }

        const waitMs = retryAfterMs ?? computeBackoffMs(attempt);
        await sleep(waitMs);
        continue;
      }
      return await response.json();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith(`${requestName} failed (`)) {
        throw error;
      } else {
        const durationMs = Date.now() - startedAt;
        const timeout = isAbortError(error);
        const errorType: EspnFetchErrorType = timeout ? 'timeout' : 'network';
        const canRetry = attempt < maxAttempts;

        safeLogFetchAttempt({
          ...metadata,
          status: null,
          attempt,
          durationMs,
          willRetry: canRetry,
          errorType
        });

        if (!canRetry) {
          espnFetchTelemetry.sourceFailures += 1;
          lastError = timeout
            ? new Error(`${requestName} timed out after ${timeoutMs}ms for ${url}`)
            : new Error(`${requestName} failed due to network error for ${url}: ${(error as Error).message}`);
        } else {
          lastError = timeout
            ? new Error(`${requestName} timed out after ${timeoutMs}ms for ${url}`)
            : new Error(`${requestName} failed due to network error for ${url}: ${(error as Error).message}`);
          await sleep(computeBackoffMs(attempt));
          continue;
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError ?? new Error(`${requestName} failed for ${url}`);
}

export function getEspnFetchConfig(): { timeoutMs: number; retries: number } {
  return {
    timeoutMs: sourceTimeoutMs(),
    retries: sourceRetryCount()
  };
}

export function resetEspnFetchTelemetry(): void {
  espnFetchTelemetry.sourceAttempts = 0;
  espnFetchTelemetry.sourceFailures = 0;
  espnFetchTelemetry.retryCount = 0;
}

export function getEspnFetchTelemetry(): EspnFetchTelemetry {
  return {
    sourceAttempts: espnFetchTelemetry.sourceAttempts,
    sourceFailures: espnFetchTelemetry.sourceFailures,
    retryCount: espnFetchTelemetry.retryCount
  };
}

function toYyyymmdd(date: string): string {
  return date.replaceAll('-', '');
}

function parseScore(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function parseInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === '--') {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseMinutes(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === '--' || trimmed === 'DNP' || trimmed.startsWith('Did Not')) {
    return null;
  }
  return trimmed;
}

function parseMinutesToNumber(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const mmssMatch = value.match(/^(\d+):(\d{1,2})$/);
  if (mmssMatch) {
    const minutes = Number.parseInt(mmssMatch[1], 10);
    const seconds = Number.parseInt(mmssMatch[2], 10);
    if (Number.isNaN(minutes) || Number.isNaN(seconds)) {
      return null;
    }
    return Number((minutes + (seconds / 60)).toFixed(3));
  }

  const asNumber = Number.parseFloat(value);
  if (Number.isNaN(asNumber)) {
    return null;
  }
  return Number(asNumber.toFixed(3));
}

function normalizeStatKey(key: string): string {
  return key.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function buildStatIndex(keys: unknown[], labels: unknown[] = []): Map<string, number> {
  const index = new Map<string, number>();
  keys.forEach((rawKey, i) => {
    if (typeof rawKey !== 'string') {
      return;
    }
    index.set(normalizeStatKey(rawKey), i);
  });
  labels.forEach((rawLabel, i) => {
    if (typeof rawLabel !== 'string') {
      return;
    }
    index.set(normalizeStatKey(rawLabel), i);
  });
  return index;
}

function getStatValue(index: Map<string, number>, stats: unknown[], aliases: string[]): string | null {
  for (const alias of aliases) {
    const idx = index.get(normalizeStatKey(alias));
    if (idx === undefined) {
      continue;
    }
    const value = stats[idx];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    if (typeof value === 'string') {
      return value;
    }
  }
  return null;
}

function parseMadeAttempted(value: string | null): { made: number | null; attempted: number | null } {
  if (!value) {
    return { made: null, attempted: null };
  }
  const match = value.match(/(-?\d+)\s*-\s*(-?\d+)/);
  if (!match) {
    return { made: null, attempted: null };
  }
  const made = Number.parseInt(match[1], 10);
  const attempted = Number.parseInt(match[2], 10);
  return {
    made: Number.isNaN(made) ? null : made,
    attempted: Number.isNaN(attempted) ? null : attempted
  };
}

function getTeamName(candidate: any): string {
  return String(candidate?.team?.displayName ?? candidate?.team?.name ?? 'Unknown Team');
}

function getTeamId(candidate: any): string {
  return String(candidate?.team?.id ?? '');
}

function normalizeTeam(team: any, fallbackPrefix: string): EspnBackfillTeamSnapshot {
  return {
    id: String(team?.team?.id ?? `${fallbackPrefix}-unknown`),
    name: String(team?.team?.displayName ?? team?.team?.name ?? `${fallbackPrefix} Team`),
    abbreviation: String(team?.team?.abbreviation ?? fallbackPrefix.toUpperCase()),
    logoUrl: typeof team?.team?.logo === 'string' ? team.team.logo : null,
    score: parseScore(team?.score)
  };
}

function buildFallbackEventUrl(sport: string, league: string, eventId: string): string {
  return `https://www.espn.com/${sport}/${league}/game/_/gameId/${eventId}`;
}

function parseIsoDate(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().slice(0, 10);
}

function formatDateInTimezone(value: string | null, timeZone: string): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.formatToParts(parsed);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    if (!year || !month || !day) {
      return null;
    }
    return `${year}-${month}-${day}`;
  } catch {
    return null;
  }
}

function extractEventUrl(event: any, sport: string, league: string): string {
  const links = Array.isArray(event?.links) ? event.links : [];
  const href = links.find((link: any) => typeof link?.href === 'string')?.href;
  if (href) {
    return href;
  }
  return buildFallbackEventUrl(sport, league, String(event?.id ?? 'unknown'));
}

export function resolveEspnSport(league: string): string | null {
  const normalized = league.toLowerCase();
  return LEAGUE_TO_SPORT[normalized] ?? null;
}

function resolveOpponentContext(params: {
  teamId: string;
  competitors: any[];
  fallbackGame: EspnBackfillGame;
}): { opponentTeamId: string; opponentTeamName: string } {
  const { teamId, competitors, fallbackGame } = params;
  const mapped = competitors.map((competitor) => ({
    teamId: getTeamId(competitor),
    teamName: getTeamName(competitor)
  })).filter((team) => team.teamId.length > 0);

  const fromSummary = mapped.find((team) => team.teamId !== teamId);
  if (fromSummary) {
    return {
      opponentTeamId: fromSummary.teamId,
      opponentTeamName: fromSummary.teamName
    };
  }

  if (fallbackGame.homeTeam.id === teamId) {
    return {
      opponentTeamId: fallbackGame.awayTeam.id,
      opponentTeamName: fallbackGame.awayTeam.name
    };
  }
  return {
    opponentTeamId: fallbackGame.homeTeam.id,
    opponentTeamName: fallbackGame.homeTeam.name
  };
}

function mergeNullableNumber(current: number | null, incoming: number | null): number | null {
  if (incoming === null || Number.isNaN(incoming)) {
    return current;
  }
  if (current === null || Number.isNaN(current)) {
    return incoming;
  }
  return current;
}

function mergeNullableString(current: string | null, incoming: string | null): string | null {
  if (incoming && incoming.trim()) {
    return incoming;
  }
  return current;
}

export async function fetchEspnScoreboardForDate(params: FetchEspnScoreboardParams): Promise<EspnBackfillBatch> {
  const league = params.league.toLowerCase();
  const sport = resolveEspnSport(league);
  if (!sport) {
    throw new Error(`Unsupported league '${params.league}'. Add a league mapping before running this source.`);
  }

  const yyyymmdd = toYyyymmdd(params.date);
  const query = new URLSearchParams({ dates: yyyymmdd, limit: String(params.limit ?? 1000) });
  const url = `${ESPN_BASE_URL}/${sport}/${league}/scoreboard?${query.toString()}`;

  const payload = await fetchJsonWithRetry({
    url,
    requestName: 'ESPN scoreboard request'
  }) as any;
  const events = Array.isArray(payload?.events) ? payload.events : [];

  const games: EspnBackfillGame[] = events.map((event: any) => {
    const competition = event?.competitions?.[0];
    const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
    const homeCompetitor = competitors.find((competitor: any) => competitor?.homeAway === 'home') ?? competitors[0];
    const awayCompetitor = competitors.find((competitor: any) => competitor?.homeAway === 'away') ?? competitors[1];

    const homeTeam = normalizeTeam(homeCompetitor, 'home');
    const awayTeam = normalizeTeam(awayCompetitor, 'away');
    const scheduledAtUtc = typeof event?.date === 'string' ? event.date : null;
    const scheduledDateUtc = parseIsoDate(scheduledAtUtc);
    const scheduledDateLocal = formatDateInTimezone(scheduledAtUtc, DEFAULT_SCOREBOARD_TIMEZONE);
    const eventDate = scheduledDateLocal ?? scheduledDateUtc ?? params.date;
    const status = String(
      competition?.status?.type?.name ??
      competition?.status?.type?.state ??
      event?.status?.type?.name ??
      'UNKNOWN'
    );
    const season = Number(
      event?.season?.year ??
      eventDate.slice(0, 4)
    );

    return {
      eventId: String(event?.id ?? ''),
      season: Number.isNaN(season) ? Number(params.date.slice(0, 4)) : season,
      date: eventDate,
      requestedDate: params.date,
      scheduledAtUtc,
      scheduledDateUtc,
      scheduledDateLocal,
      scheduledDateTimezone: DEFAULT_SCOREBOARD_TIMEZONE,
      status,
      homeTeam,
      awayTeam,
      homeScore: homeTeam.score,
      awayScore: awayTeam.score,
      venue: typeof competition?.venue?.fullName === 'string' ? competition.venue.fullName : null,
      sourceUrl: extractEventUrl(event, sport, league),
      rawEvent: event
    } satisfies EspnBackfillGame;
  }).filter((game: EspnBackfillGame) => game.eventId.length > 0);

  return {
    source: 'espn',
    league,
    sport,
    date: params.date,
    url,
    games,
    recordsExtracted: games.length
  };
}

export async function fetchEspnNbaPlayerStatsForGame(
  params: FetchEspnNbaPlayerStatsParams
): Promise<EspnBackfillNbaPlayerBatch> {
  const { game } = params;
  const fetchedAt = new Date().toISOString();
  const url = `${ESPN_BASE_URL}/basketball/nba/summary?event=${game.eventId}`;
  const payload = await fetchJsonWithRetry({
    url,
    requestName: `ESPN summary request for game ${game.eventId}`
  }) as any;
  const competitors = Array.isArray(payload?.header?.competitions?.[0]?.competitors)
    ? payload.header.competitions[0].competitors
    : [];

  const boxscoreTeams = Array.isArray(payload?.boxscore?.players) ? payload.boxscore.players : [];
  const players = new Map<string, EspnBackfillPlayer>();
  const playerGameLogs = new Map<string, EspnBackfillPlayerGameLog>();
  const skippedRows: string[] = [];

  for (const teamBox of boxscoreTeams) {
    const teamId = String(teamBox?.team?.id ?? '');
    const teamName = String(teamBox?.team?.displayName ?? teamBox?.team?.name ?? 'Unknown Team');
    const opponent = resolveOpponentContext({ teamId, competitors, fallbackGame: game });
    const statGroups = Array.isArray(teamBox?.statistics) ? teamBox.statistics : [];

    for (const statGroup of statGroups) {
      const groupKeys = Array.isArray(statGroup?.keys) ? statGroup.keys : [];
      const groupLabels = Array.isArray(statGroup?.labels) ? statGroup.labels : [];
      const statIndex = buildStatIndex(groupKeys, groupLabels);
      const athletes = Array.isArray(statGroup?.athletes) ? statGroup.athletes : [];

      for (const athleteRow of athletes) {
        const sourcePlayerId = String(athleteRow?.athlete?.id ?? '');
        const playerName = String(
          athleteRow?.athlete?.displayName ??
          athleteRow?.athlete?.shortName ??
          ''
        ).trim();
        if (!sourcePlayerId || !playerName) {
          skippedRows.push(`[${game.eventId}] skipped athlete row with missing player id or name`);
          continue;
        }

        const stats = Array.isArray(athleteRow?.stats) ? athleteRow.stats : [];
        if (stats.length === 0) {
          skippedRows.push(`[${game.eventId}] ${sourcePlayerId} ${playerName}: missing stats array`);
          continue;
        }

        const minutesRaw = parseMinutes(getStatValue(statIndex, stats, ['MIN', 'MINS', 'MINUTES']));
        const minutes = parseMinutesToNumber(minutesRaw);
        const fgPair = parseMadeAttempted(getStatValue(statIndex, stats, [
          'FG',
          'fieldGoalsMade-fieldGoalsAttempted'
        ]));
        const threePair = parseMadeAttempted(getStatValue(statIndex, stats, [
          '3PT',
          '3P',
          'threePointFieldGoalsMade-threePointFieldGoalsAttempted'
        ]));
        const ftPair = parseMadeAttempted(getStatValue(statIndex, stats, [
          'FT',
          'freeThrowsMade-freeThrowsAttempted'
        ]));

        const fieldGoalsMade = fgPair.made ?? parseInteger(getStatValue(statIndex, stats, ['FGM']));
        const fieldGoalsAttempted = fgPair.attempted ?? parseInteger(getStatValue(statIndex, stats, ['FGA']));
        const threePointsMade = threePair.made ?? parseInteger(getStatValue(statIndex, stats, ['FG3M', '3PM', '3PTM']));
        const threePointsAttempted = threePair.attempted ?? parseInteger(getStatValue(statIndex, stats, ['FG3A', '3PA', '3PTA']));
        const freeThrowsMade = ftPair.made ?? parseInteger(getStatValue(statIndex, stats, ['FTM']));
        const freeThrowsAttempted = ftPair.attempted ?? parseInteger(getStatValue(statIndex, stats, ['FTA']));

        const points = parseInteger(getStatValue(statIndex, stats, ['PTS', 'POINTS', 'points']));
        const rebounds = parseInteger(getStatValue(statIndex, stats, ['REB', 'TRB', 'REBOUNDS', 'rebounds']));
        const assists = parseInteger(getStatValue(statIndex, stats, ['AST', 'ASSISTS', 'assists']));
        const steals = parseInteger(getStatValue(statIndex, stats, ['STL', 'STEALS', 'steals']));
        const blocks = parseInteger(getStatValue(statIndex, stats, ['BLK', 'BLOCKS', 'blocks']));
        const turnovers = parseInteger(getStatValue(statIndex, stats, ['TO', 'TOV', 'TURNOVERS', 'turnovers']));

        const hasAnyStat = [
          minutes,
          points,
          rebounds,
          assists,
          steals,
          blocks,
          turnovers,
          fieldGoalsMade,
          fieldGoalsAttempted,
          threePointsMade,
          threePointsAttempted,
          freeThrowsMade,
          freeThrowsAttempted
        ].some((value) => value !== null);

        if (!hasAnyStat) {
          skippedRows.push(`[${game.eventId}] ${sourcePlayerId} ${playerName}: no usable boxscore stats`);
          continue;
        }

        players.set(sourcePlayerId, {
          sourcePlayerId,
          name: playerName,
          teamId,
          teamName,
          position: athleteRow?.athlete?.position?.abbreviation ?? null,
          headshotUrl: athleteRow?.athlete?.headshot?.href ?? null
        });

        const nextLog: EspnBackfillPlayerGameLog = {
          sourceGameId: game.eventId,
          playerId: sourcePlayerId,
          playerName,
          teamId,
          teamName,
          opponentTeamId: opponent.opponentTeamId,
          opponentTeamName: opponent.opponentTeamName,
          date: game.date,
          minutes,
          minutesRaw,
          points,
          rebounds,
          assists,
          steals,
          blocks,
          turnovers,
          fieldGoalsMade,
          fieldGoalsAttempted,
          threePointsMade,
          threePointsAttempted,
          freeThrowsMade,
          freeThrowsAttempted,
          sourceUrl: game.sourceUrl || url,
          fetchedAt
        };

        const existingLog = playerGameLogs.get(sourcePlayerId);
        if (!existingLog) {
          playerGameLogs.set(sourcePlayerId, nextLog);
          continue;
        }

        playerGameLogs.set(sourcePlayerId, {
          ...existingLog,
          minutes: mergeNullableNumber(existingLog.minutes, nextLog.minutes),
          minutesRaw: mergeNullableString(existingLog.minutesRaw, nextLog.minutesRaw),
          points: mergeNullableNumber(existingLog.points, nextLog.points),
          rebounds: mergeNullableNumber(existingLog.rebounds, nextLog.rebounds),
          assists: mergeNullableNumber(existingLog.assists, nextLog.assists),
          steals: mergeNullableNumber(existingLog.steals, nextLog.steals),
          blocks: mergeNullableNumber(existingLog.blocks, nextLog.blocks),
          turnovers: mergeNullableNumber(existingLog.turnovers, nextLog.turnovers),
          fieldGoalsMade: mergeNullableNumber(existingLog.fieldGoalsMade, nextLog.fieldGoalsMade),
          fieldGoalsAttempted: mergeNullableNumber(existingLog.fieldGoalsAttempted, nextLog.fieldGoalsAttempted),
          threePointsMade: mergeNullableNumber(existingLog.threePointsMade, nextLog.threePointsMade),
          threePointsAttempted: mergeNullableNumber(existingLog.threePointsAttempted, nextLog.threePointsAttempted),
          freeThrowsMade: mergeNullableNumber(existingLog.freeThrowsMade, nextLog.freeThrowsMade),
          freeThrowsAttempted: mergeNullableNumber(existingLog.freeThrowsAttempted, nextLog.freeThrowsAttempted)
        });
      }
    }
  }

  const mergedLogs = Array.from(playerGameLogs.values());

  return {
    source: 'espn',
    league: 'nba',
    sourceGameId: game.eventId,
    url,
    fetchedAt,
    players: Array.from(players.values()),
    playerGameLogs: mergedLogs,
    skippedRows,
    recordsExtracted: mergedLogs.length
  };
}
