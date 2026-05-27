import fs from 'fs';
import path from 'path';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import {
  fetchEspnNbaPlayerStatsForGame,
  fetchEspnScoreboardForDate,
  getEspnFetchConfig,
  getEspnFetchTelemetry,
  resetEspnFetchTelemetry,
  resolveEspnSport
} from '../server/sources/espn-backfill';

type BackfillMode = 'dry_run' | 'write';
type RunStatus = 'completed' | 'failed';

interface CliOptions {
  league: string;
  startDate: string;
  endDate: string;
  dryRun: boolean;
  limit?: number;
  source: string;
  confirmWide: boolean;
}

interface FirebaseAppletConfig {
  projectId?: string;
  firestoreDatabaseId?: string;
}

interface BackfillDateRange {
  start_date: string;
  end_date: string;
}

interface SportsBackfillReceipt {
  run_id: string;
  status: RunStatus;
  mode: BackfillMode;
  source: string;
  league: string;
  date_range: BackfillDateRange;
  started_at: string;
  completed_at: string;
  records_read: number;
  records_written: number;
  records_skipped: number;
  errors: string[];
  created_at: string;
  fetch_timeout_ms: number;
  fetch_retries: number;
  source_attempts: number;
  source_failures: number;
  retry_count: number;
  duration_ms: number;
  date_count_requested: number;
  dates_processed: number;
  event_count_seen: number;
  event_count_processed: number;
  write_batch_count: number;
  skipped_by_reason: Record<string, number>;
}

interface SportsSourceReceipt {
  run_id: string;
  receipt_mode: 'per_run_audit';
  fetch_type: 'scoreboard' | 'summary';
  source_key: string;
  source: string;
  league: string;
  url: string;
  fetched_at: string;
  status: 'success' | 'error';
  records_extracted: number;
  error: string | null;
}

interface SportsGameStagingDoc {
  id: string;
  source: string;
  source_game_id: string;
  league: string;
  season: number;
  date: string;
  requested_date: string;
  scheduled_at_utc: string | null;
  scheduled_date_utc: string | null;
  scheduled_date_local: string | null;
  scheduled_date_timezone: string;
  status: string;
  home_team: {
    id: string;
    name: string;
    abbreviation: string;
    logo_url: string | null;
  };
  away_team: {
    id: string;
    name: string;
    abbreviation: string;
    logo_url: string | null;
  };
  home_score: number | null;
  away_score: number | null;
  venue: string | null;
  source_url: string;
  fetched_at: string;
  raw_ref: string;
}

interface SportsTeamStagingDoc {
  id: string;
  source: string;
  league: string;
  source_team_id: string;
  name: string;
  abbreviation: string;
  logo_url: string | null;
  updated_at: string;
}

interface SportsPlayerStagingDoc {
  id: string;
  source: string;
  league: string;
  source_player_id: string;
  name: string;
  team_id: string;
  team_name: string;
  position: string | null;
  headshot_url: string | null;
  updated_at: string;
}

interface SportsPlayerGameLogStagingDoc {
  id: string;
  source: string;
  league: string;
  game_id: string;
  source_game_id: string;
  player_id: string;
  player_name: string;
  team_id: string;
  team_name: string;
  opponent_team_id: string;
  opponent_team_name: string;
  date: string;
  minutes: number | null;
  minutes_raw: string | null;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  steals: number | null;
  blocks: number | null;
  turnovers: number | null;
  field_goals_made: number | null;
  field_goals_attempted: number | null;
  three_points_made: number | null;
  three_points_attempted: number | null;
  free_throws_made: number | null;
  free_throws_attempted: number | null;
  source_url: string;
  fetched_at: string;
  raw_ref: string;
}

interface WriteDoc<T extends object> {
  id: string;
  data: T;
}

interface WriteDocsResult {
  writes: number;
  batches: number;
}

const MAX_RANGE_DAYS_WITHOUT_CONFIRM = 45;
const DEFAULT_WRITE_BATCH_SIZE = 250;
const MAX_FIRESTORE_BATCH_SIZE = 400;

function parseBatchSize(): number {
  const raw = process.env.SPORTS_FIRESTORE_BATCH_SIZE;
  if (!raw) {
    return DEFAULT_WRITE_BATCH_SIZE;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_WRITE_BATCH_SIZE;
  }
  return Math.min(parsed, MAX_FIRESTORE_BATCH_SIZE);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    league: '',
    startDate: '',
    endDate: '',
    dryRun: false,
    source: 'espn',
    confirmWide: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--league':
        options.league = argv[i + 1] ?? '';
        i += 1;
        break;
      case '--start-date':
        options.startDate = argv[i + 1] ?? '';
        i += 1;
        break;
      case '--end-date':
        options.endDate = argv[i + 1] ?? '';
        i += 1;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--limit': {
        const raw = argv[i + 1];
        if (!raw) {
          throw new Error('--limit requires a numeric value');
        }
        const parsed = Number.parseInt(raw, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new Error('--limit must be a positive integer');
        }
        options.limit = parsed;
        i += 1;
        break;
      }
      case '--source':
        options.source = (argv[i + 1] ?? '').toLowerCase();
        i += 1;
        break;
      case '--confirm-wide':
        options.confirmWide = true;
        break;
      case '--help':
        printUsage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }

  if (!options.league) {
    throw new Error('Missing required --league');
  }
  if (!options.startDate) {
    throw new Error('Missing required --start-date');
  }
  if (!options.endDate) {
    throw new Error('Missing required --end-date');
  }
  if (options.source !== 'espn') {
    throw new Error(`Unsupported source '${options.source}'. Supported sources: espn`);
  }

  validateDateString(options.startDate, '--start-date');
  validateDateString(options.endDate, '--end-date');
  if (options.startDate > options.endDate) {
    throw new Error('--start-date must be less than or equal to --end-date');
  }
  const dateCount = getDateRange(options.startDate, options.endDate).length;
  if (dateCount > MAX_RANGE_DAYS_WITHOUT_CONFIRM && !options.confirmWide) {
    throw new Error(
      `Wide range (${dateCount} dates) blocked. Pass --confirm-wide to process more than ${MAX_RANGE_DAYS_WITHOUT_CONFIRM} dates.`
    );
  }

  return options;
}

function printUsage(): void {
  console.log(
    [
      'Usage: tsx src/jobs/backfill-sports.ts --league nba --start-date YYYY-MM-DD --end-date YYYY-MM-DD [options]',
      '',
      'Options:',
      '  --league <league>            Required (e.g. nba, nfl, mlb, nhl)',
      '  --start-date <YYYY-MM-DD>    Required',
      '  --end-date <YYYY-MM-DD>      Required',
      '  --source <source>            Optional, default espn',
      '  --limit <n>                  Optional max number of events/games processed across the run',
      `  --confirm-wide               Optional acknowledge ranges > ${MAX_RANGE_DAYS_WITHOUT_CONFIRM} dates`,
      '  --dry-run                    Optional, perform no staging writes'
    ].join('\n')
  );
}

function validateDateString(value: string, flag: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${flag} must be in YYYY-MM-DD format`);
  }
  const [yearRaw, monthRaw, dayRaw] = value.split('-');
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  const day = Number.parseInt(dayRaw, 10);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${flag} is not a valid date`);
  }
  const normalized = `${parsed.getUTCFullYear().toString().padStart(4, '0')}-${(parsed.getUTCMonth() + 1).toString().padStart(2, '0')}-${parsed.getUTCDate().toString().padStart(2, '0')}`;
  if (normalized !== value) {
    throw new Error(`${flag} is not a real calendar date`);
  }
}

function getDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);

  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function stableId(...parts: string[]): string {
  return parts
    .map((part) => part.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-'))
    .join('_');
}

function hashString(value: string): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 12);
}

function incrementCount(counter: Map<string, number>, key: string, by = 1): void {
  counter.set(key, (counter.get(key) ?? 0) + by);
}

function classifySkippedPlayerRow(message: string): string {
  if (message.includes('missing stats array')) {
    return 'player_missing_stats_array';
  }
  if (message.includes('missing player id or name')) {
    return 'player_missing_identity';
  }
  if (message.includes('no usable boxscore stats')) {
    return 'player_no_usable_boxscore_stats';
  }
  return 'player_other';
}

function mapToObject(counter: Map<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of counter.entries()) {
    out[key] = value;
  }
  return out;
}

function loadFirebaseConfig(): FirebaseAppletConfig {
  const configPath = process.env.FIREBASE_APPLET_CONFIG_PATH
    ? path.resolve(process.cwd(), process.env.FIREBASE_APPLET_CONFIG_PATH)
    : path.resolve(process.cwd(), 'firebase-applet-config.json');

  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8')) as FirebaseAppletConfig;
  } catch (error) {
    throw new Error(`Failed to parse Firebase config at ${configPath}: ${(error as Error).message}`);
  }
}

function initFirestoreClient(config: FirebaseAppletConfig): Firestore {
  const app = getApps()[0] ?? initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || config.projectId
  });

  if (config.firestoreDatabaseId) {
    return getFirestore(app, config.firestoreDatabaseId);
  }
  return getFirestore(app);
}

function buildRunId(options: CliOptions, startedAt: string): string {
  const startCompact = options.startDate.replaceAll('-', '');
  const endCompact = options.endDate.replaceAll('-', '');
  const timePart = startedAt.replace(/[:.]/g, '-');
  return stableId('sports', options.source, options.league, `${startCompact}-${endCompact}`, timePart);
}

function toGameDoc(params: {
  source: string;
  league: string;
  sourceReceiptId: string;
  fetchedAt: string;
  game: Awaited<ReturnType<typeof fetchEspnScoreboardForDate>>['games'][number];
}): SportsGameStagingDoc {
  const { source, league, sourceReceiptId, fetchedAt, game } = params;
  const gameId = stableId(source, league, game.eventId);
  return {
    id: gameId,
    source,
    source_game_id: game.eventId,
    league,
    season: game.season,
    date: game.date,
    requested_date: game.requestedDate,
    scheduled_at_utc: game.scheduledAtUtc,
    scheduled_date_utc: game.scheduledDateUtc,
    scheduled_date_local: game.scheduledDateLocal,
    scheduled_date_timezone: game.scheduledDateTimezone,
    status: game.status,
    home_team: {
      id: game.homeTeam.id,
      name: game.homeTeam.name,
      abbreviation: game.homeTeam.abbreviation,
      logo_url: game.homeTeam.logoUrl
    },
    away_team: {
      id: game.awayTeam.id,
      name: game.awayTeam.name,
      abbreviation: game.awayTeam.abbreviation,
      logo_url: game.awayTeam.logoUrl
    },
    home_score: game.homeScore,
    away_score: game.awayScore,
    venue: game.venue,
    source_url: game.sourceUrl,
    fetched_at: fetchedAt,
    raw_ref: `sports_sources_staging/${sourceReceiptId}`
  };
}

function toTeamDoc(params: {
  source: string;
  league: string;
  fetchedAt: string;
  team: Awaited<ReturnType<typeof fetchEspnScoreboardForDate>>['games'][number]['homeTeam'];
}): SportsTeamStagingDoc {
  const { source, league, fetchedAt, team } = params;
  return {
    id: stableId(source, league, team.id),
    source,
    league,
    source_team_id: team.id,
    name: team.name,
    abbreviation: team.abbreviation,
    logo_url: team.logoUrl,
    updated_at: fetchedAt
  };
}

function toPlayerDoc(params: {
  source: string;
  league: string;
  fetchedAt: string;
  player: Awaited<ReturnType<typeof fetchEspnNbaPlayerStatsForGame>>['players'][number];
}): SportsPlayerStagingDoc {
  const { source, league, fetchedAt, player } = params;
  return {
    id: `${source}_${league}_${player.sourcePlayerId}`,
    source,
    league,
    source_player_id: player.sourcePlayerId,
    name: player.name,
    team_id: player.teamId,
    team_name: player.teamName,
    position: player.position,
    headshot_url: player.headshotUrl,
    updated_at: fetchedAt
  };
}

function toPlayerGameLogDoc(params: {
  source: string;
  league: string;
  sourceReceiptId: string;
  log: Awaited<ReturnType<typeof fetchEspnNbaPlayerStatsForGame>>['playerGameLogs'][number];
}): SportsPlayerGameLogStagingDoc {
  const { source, league, sourceReceiptId, log } = params;
  return {
    id: `${source}_${league}_${log.sourceGameId}_${log.playerId}`,
    source,
    league,
    game_id: `${source}_${league}_${log.sourceGameId}`,
    source_game_id: log.sourceGameId,
    player_id: log.playerId,
    player_name: log.playerName,
    team_id: log.teamId,
    team_name: log.teamName,
    opponent_team_id: log.opponentTeamId,
    opponent_team_name: log.opponentTeamName,
    date: log.date,
    minutes: log.minutes,
    minutes_raw: log.minutesRaw,
    points: log.points,
    rebounds: log.rebounds,
    assists: log.assists,
    steals: log.steals,
    blocks: log.blocks,
    turnovers: log.turnovers,
    field_goals_made: log.fieldGoalsMade,
    field_goals_attempted: log.fieldGoalsAttempted,
    three_points_made: log.threePointsMade,
    three_points_attempted: log.threePointsAttempted,
    free_throws_made: log.freeThrowsMade,
    free_throws_attempted: log.freeThrowsAttempted,
    source_url: log.sourceUrl,
    fetched_at: log.fetchedAt,
    raw_ref: `sports_sources_staging/${sourceReceiptId}`
  };
}

async function writeDocs<T extends object>(
  db: Firestore,
  collectionName: string,
  docs: Array<WriteDoc<T>>,
  chunkSize = DEFAULT_WRITE_BATCH_SIZE
): Promise<WriteDocsResult> {
  let writes = 0;
  let batches = 0;
  for (let i = 0; i < docs.length; i += chunkSize) {
    const slice = docs.slice(i, i + chunkSize);
    const batch = db.batch();
    for (const doc of slice) {
      batch.set(db.collection(collectionName).doc(doc.id), doc.data as object, { merge: true });
      writes += 1;
    }
    await batch.commit();
    batches += 1;
  }
  return { writes, batches };
}

async function run(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const mode: BackfillMode = options.dryRun ? 'dry_run' : 'write';
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  const runId = buildRunId(options, startedAt);
  const dates = getDateRange(options.startDate, options.endDate);
  const fetchConfig = getEspnFetchConfig();
  resetEspnFetchTelemetry();

  if (dates.length > MAX_RANGE_DAYS_WITHOUT_CONFIRM && options.confirmWide) {
    console.warn(
      `[sports-backfill] wide range confirmed: ${dates.length} dates (${options.startDate} -> ${options.endDate})`
    );
  }

  const errors: string[] = [];
  const sourceReceipts: Array<WriteDoc<SportsSourceReceipt>> = [];
  const gameDocs: Array<WriteDoc<SportsGameStagingDoc>> = [];
  const teamDocs = new Map<string, WriteDoc<SportsTeamStagingDoc>>();
  const playerDocs = new Map<string, WriteDoc<SportsPlayerStagingDoc>>();
  const playerGameLogDocs = new Map<string, WriteDoc<SportsPlayerGameLogStagingDoc>>();
  const skippedPlayerRows: string[] = [];
  const skippedByReason = new Map<string, number>();

  const seenGameIds = new Set<string>();
  let recordsRead = 0;
  let recordsSkipped = 0;
  let stopByLimit = false;
  const maxGames = options.limit;
  let datesProcessed = 0;
  let eventCountSeen = 0;
  let eventCountProcessed = 0;

  for (const date of dates) {
    if (stopByLimit) {
      break;
    }

    const remainingLimit = maxGames ? maxGames - gameDocs.length : undefined;
    if (typeof remainingLimit === 'number' && remainingLimit <= 0) {
      stopByLimit = true;
      break;
    }

    datesProcessed += 1;

    const fetchedAt = new Date().toISOString();
    const sourceKey = stableId(options.source, options.league, 'scoreboard', date);
    const sourceReceiptId = `${runId}_${sourceKey}_${hashString(`${runId}_${sourceKey}`)}`;

    try {
      const batch = await fetchEspnScoreboardForDate({
        league: options.league,
        date,
        limit: remainingLimit
      });
      recordsRead += batch.recordsExtracted;
      eventCountSeen += batch.games.length;

      const cappedGames = typeof remainingLimit === 'number'
        ? batch.games.slice(0, remainingLimit)
        : batch.games;
      eventCountProcessed += cappedGames.length;
      const overflowCount = batch.games.length - cappedGames.length;
      if (overflowCount > 0) {
        recordsSkipped += overflowCount;
        incrementCount(skippedByReason, 'event_overflow_limit', overflowCount);
      }

      for (const game of cappedGames) {
        const gameDoc = toGameDoc({
          source: options.source,
          league: options.league,
          sourceReceiptId,
          fetchedAt,
          game
        });

        if (seenGameIds.has(gameDoc.id)) {
          recordsSkipped += 1;
          incrementCount(skippedByReason, 'duplicate_game_in_run');
          continue;
        }
        seenGameIds.add(gameDoc.id);
        gameDocs.push({ id: gameDoc.id, data: gameDoc });

        const homeTeam = toTeamDoc({
          source: options.source,
          league: options.league,
          fetchedAt,
          team: game.homeTeam
        });
        const awayTeam = toTeamDoc({
          source: options.source,
          league: options.league,
          fetchedAt,
          team: game.awayTeam
        });

        teamDocs.set(homeTeam.id, { id: homeTeam.id, data: homeTeam });
        teamDocs.set(awayTeam.id, { id: awayTeam.id, data: awayTeam });
      }

      sourceReceipts.push({
        id: sourceReceiptId,
        data: {
          run_id: runId,
          receipt_mode: 'per_run_audit',
          fetch_type: 'scoreboard',
          source_key: sourceKey,
          source: options.source,
          league: options.league,
          url: batch.url,
          fetched_at: fetchedAt,
          status: 'success',
          records_extracted: batch.recordsExtracted,
          error: null
        }
      });

      if (options.league === 'nba') {
        for (const game of cappedGames) {
          const summarySourceKey = stableId(options.source, options.league, 'summary', game.eventId);
          const summarySourceReceiptId = `${runId}_${summarySourceKey}_${hashString(`${runId}_${summarySourceKey}`)}`;

          try {
            const playerBatch = await fetchEspnNbaPlayerStatsForGame({ game });
            recordsRead += playerBatch.recordsExtracted;

            sourceReceipts.push({
              id: summarySourceReceiptId,
              data: {
                run_id: runId,
                receipt_mode: 'per_run_audit',
                fetch_type: 'summary',
                source_key: summarySourceKey,
                source: options.source,
                league: options.league,
                url: playerBatch.url,
                fetched_at: playerBatch.fetchedAt,
                status: 'success',
                records_extracted: playerBatch.recordsExtracted,
                error: null
              }
            });

            for (const skippedRow of playerBatch.skippedRows) {
              skippedPlayerRows.push(skippedRow);
              recordsSkipped += 1;
              incrementCount(skippedByReason, classifySkippedPlayerRow(skippedRow));
            }

            for (const player of playerBatch.players) {
              const playerDoc = toPlayerDoc({
                source: options.source,
                league: options.league,
                fetchedAt: playerBatch.fetchedAt,
                player
              });
              playerDocs.set(playerDoc.id, { id: playerDoc.id, data: playerDoc });
            }

            for (const log of playerBatch.playerGameLogs) {
              const logDoc = toPlayerGameLogDoc({
                source: options.source,
                league: options.league,
                sourceReceiptId: summarySourceReceiptId,
                log
              });

              if (playerGameLogDocs.has(logDoc.id)) {
                recordsSkipped += 1;
                incrementCount(skippedByReason, 'duplicate_player_log_in_run');
                continue;
              }
              playerGameLogDocs.set(logDoc.id, { id: logDoc.id, data: logDoc });
            }
          } catch (error) {
            const message = `[summary ${game.eventId}] ${(error as Error).message}`;
            errors.push(message);
            incrementCount(skippedByReason, 'summary_fetch_error');
            sourceReceipts.push({
              id: summarySourceReceiptId,
              data: {
                run_id: runId,
                receipt_mode: 'per_run_audit',
                fetch_type: 'summary',
                source_key: summarySourceKey,
                source: options.source,
                league: options.league,
                url: `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${game.eventId}`,
                fetched_at: new Date().toISOString(),
                status: 'error',
                records_extracted: 0,
                error: message
              }
            });
          }

          await sleep(120);
        }
      }
    } catch (error) {
      const message = `[${date}] ${(error as Error).message}`;
      errors.push(message);
      incrementCount(skippedByReason, 'scoreboard_fetch_error');
      const sport = resolveEspnSport(options.league) ?? 'basketball';
      sourceReceipts.push({
        id: sourceReceiptId,
        data: {
          run_id: runId,
          receipt_mode: 'per_run_audit',
          fetch_type: 'scoreboard',
          source_key: sourceKey,
          source: options.source,
          league: options.league,
          url: `https://site.api.espn.com/apis/site/v2/sports/${sport}/${options.league}/scoreboard?dates=${date.replaceAll('-', '')}`,
          fetched_at: fetchedAt,
          status: 'error',
          records_extracted: 0,
          error: message
        }
      });
    }

    await sleep(250);
  }

  const playerLogsMessage = options.league === 'nba'
    ? 'player logs extracted from ESPN summary where available.'
    : 'player logs not implemented for this source yet.';
  const completedAt = new Date().toISOString();
  const completedAtMs = Date.now();
  const runDurationMs = completedAtMs - startedAtMs;
  const fetchTelemetry = getEspnFetchTelemetry();

  const fillRateSummary = (() => {
    const logs = Array.from(playerGameLogDocs.values()).map((doc) => doc.data);
    let withPoints = 0;
    let withRebounds = 0;
    let withAssists = 0;
    let withMinutes = 0;
    let withFg = 0;
    let withThreePt = 0;
    let withFt = 0;
    for (const log of logs) {
      if (log.points !== null) {
        withPoints += 1;
      }
      if (log.rebounds !== null) {
        withRebounds += 1;
      }
      if (log.assists !== null) {
        withAssists += 1;
      }
      if (log.minutes !== null) {
        withMinutes += 1;
      }
      if (log.field_goals_made !== null && log.field_goals_attempted !== null) {
        withFg += 1;
      }
      if (log.three_points_made !== null && log.three_points_attempted !== null) {
        withThreePt += 1;
      }
      if (log.free_throws_made !== null && log.free_throws_attempted !== null) {
        withFt += 1;
      }
    }
    return {
      total_player_logs: logs.length,
      with_points: withPoints,
      with_rebounds: withRebounds,
      with_assists: withAssists,
      with_minutes: withMinutes,
      with_fg_parsed: withFg,
      with_3pt_parsed: withThreePt,
      with_ft_parsed: withFt
    };
  })();

  let recordsWritten = 0;
  let writeBatchCount = 0;
  const writeErrors = [...errors];
  if (mode === 'write') {
    try {
      const firebaseConfig = loadFirebaseConfig();
      const db = initFirestoreClient(firebaseConfig);
      const batchSize = parseBatchSize();

      const sourceReceiptWrites = await writeDocs(db, 'sports_sources_staging', sourceReceipts, batchSize);
      const gameWrites = await writeDocs(db, 'sports_games_staging', gameDocs, batchSize);
      const teamWrites = await writeDocs(db, 'sports_teams_staging', Array.from(teamDocs.values()), batchSize);
      const playerWrites = await writeDocs(db, 'sports_players_staging', Array.from(playerDocs.values()), batchSize);
      const playerLogWrites = await writeDocs(db, 'sports_player_game_logs_staging', Array.from(playerGameLogDocs.values()), batchSize);

      recordsWritten += sourceReceiptWrites.writes;
      recordsWritten += gameWrites.writes;
      recordsWritten += teamWrites.writes;
      recordsWritten += playerWrites.writes;
      recordsWritten += playerLogWrites.writes;
      writeBatchCount += sourceReceiptWrites.batches;
      writeBatchCount += gameWrites.batches;
      writeBatchCount += teamWrites.batches;
      writeBatchCount += playerWrites.batches;
      writeBatchCount += playerLogWrites.batches;

      const totalRecordsWritten = recordsWritten + 1;
      const totalWriteBatchCount = writeBatchCount + 1;

      const receipt: SportsBackfillReceipt = {
        run_id: runId,
        status: writeErrors.length > 0 ? 'failed' : 'completed',
        mode,
        source: options.source,
        league: options.league,
        date_range: {
          start_date: options.startDate,
          end_date: options.endDate
        },
        started_at: startedAt,
        completed_at: completedAt,
        records_read: recordsRead,
        records_written: totalRecordsWritten,
        records_skipped: recordsSkipped,
        errors: writeErrors,
        created_at: startedAt,
        fetch_timeout_ms: fetchConfig.timeoutMs,
        fetch_retries: fetchConfig.retries,
        source_attempts: fetchTelemetry.sourceAttempts,
        source_failures: fetchTelemetry.sourceFailures,
        retry_count: fetchTelemetry.retryCount,
        duration_ms: runDurationMs,
        date_count_requested: dates.length,
        dates_processed: datesProcessed,
        event_count_seen: eventCountSeen,
        event_count_processed: eventCountProcessed,
        write_batch_count: totalWriteBatchCount,
        skipped_by_reason: mapToObject(skippedByReason)
      };

      await db.collection('sports_backfill_runs').doc(runId).set(receipt, { merge: true });
      recordsWritten = totalRecordsWritten;
      writeBatchCount = totalWriteBatchCount;

      console.log(JSON.stringify({
        receipt,
        simulated_documents: {
          games_found: gameDocs.length,
          teams_simulated: teamDocs.size,
          players_simulated: playerDocs.size,
          player_logs_simulated: playerGameLogDocs.size
        },
        data_quality: fillRateSummary,
        source_receipts_for_run: sourceReceipts.length,
        skipped_player_rows_count: skippedPlayerRows.length,
        skipped_player_rows: skippedPlayerRows.slice(0, 50),
        skipped_by_reason: mapToObject(skippedByReason),
        notes: [playerLogsMessage]
      }, null, 2));
      return;
    } catch (error) {
      writeErrors.push(`[write] ${(error as Error).message}`);
    }
  }

  const dryRunReceipt: SportsBackfillReceipt = {
    run_id: runId,
    status: writeErrors.length > 0 ? 'failed' : 'completed',
    mode,
    source: options.source,
    league: options.league,
    date_range: {
      start_date: options.startDate,
      end_date: options.endDate
    },
    started_at: startedAt,
    completed_at: completedAt,
    records_read: recordsRead,
    records_written: recordsWritten,
    records_skipped: recordsSkipped,
    errors: writeErrors,
    created_at: startedAt,
    fetch_timeout_ms: fetchConfig.timeoutMs,
    fetch_retries: fetchConfig.retries,
    source_attempts: fetchTelemetry.sourceAttempts,
    source_failures: fetchTelemetry.sourceFailures,
    retry_count: fetchTelemetry.retryCount,
    duration_ms: runDurationMs,
    date_count_requested: dates.length,
    dates_processed: datesProcessed,
    event_count_seen: eventCountSeen,
    event_count_processed: eventCountProcessed,
    write_batch_count: writeBatchCount,
    skipped_by_reason: mapToObject(skippedByReason)
  };

  console.log(JSON.stringify({
    receipt: dryRunReceipt,
    simulated_documents: {
      games_found: gameDocs.length,
      teams_simulated: teamDocs.size,
      players_simulated: playerDocs.size,
      player_logs_simulated: playerGameLogDocs.size,
      source_receipts_simulated: sourceReceipts.length
    },
    data_quality: fillRateSummary,
    source_receipts_for_run: sourceReceipts.length,
    skipped_player_rows_count: skippedPlayerRows.length,
    skipped_player_rows: skippedPlayerRows.slice(0, 50),
    skipped_by_reason: mapToObject(skippedByReason),
    notes: [playerLogsMessage]
  }, null, 2));

  if (writeErrors.length > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error('[sports-backfill-fatal]', (error as Error).message);
  process.exit(1);
});
