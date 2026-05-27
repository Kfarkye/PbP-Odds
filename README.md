<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/038c1bef-69af-45e5-8e6e-2fe3ae9ffb2b

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Preflight Checks

Run these before deployment:

```bash
npm install
npm run build
npm run lint
npm run typecheck
```

## Deployment Target

This repository is set up for a Node.js server runtime and is best deployed to Cloud Run.

### Required Runtime Environment Variables

- `GEMINI_API_KEY` (required)
- `PUBLIC_DOMAIN` (required for strict OIDC audience validation; set to your Cloud Run/custom domain)
- `CRON_SECRET` (required only if you enable emergency fallback auth for cron endpoint)
- `INDEXNOW_KEY` (optional)
- `GOOGLE_APPLICATION_CREDENTIALS` (optional, only used for the MCP deploy-helper path in `src/server/mcp-generator.ts`)

### Cron Endpoint Authentication

`/api/cron/trigger-feed-publish` now requires one of:

1. A valid Google OIDC bearer token whose `aud` matches the service URL/domain.
2. A fallback shared secret via `x-cron-secret` header (or bearer token) matching `CRON_SECRET`.

Recommended production setup is Cloud Scheduler with OIDC:

```bash
gcloud scheduler jobs create http aura-feed-publish \
  --project gen-lang-client-0281999829 \
  --location us-central1 \
  --schedule "*/15 * * * *" \
  --uri "https://YOUR_SERVICE_DOMAIN/api/cron/trigger-feed-publish" \
  --http-method POST \
  --oidc-service-account-email "aura-scheduler-sa@gen-lang-client-0281999829.iam.gserviceaccount.com" \
  --oidc-token-audience "https://YOUR_SERVICE_DOMAIN"
```

### Least-Privilege Cloud Run Runtime Service Account

Create a dedicated runtime service account and grant only secret access required by the app:

```bash
gcloud iam service-accounts create aura-runtime-sa \
  --project gen-lang-client-0281999829 \
  --display-name "Aura Runtime Service Account"

gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --project gen-lang-client-0281999829 \
  --member "serviceAccount:aura-runtime-sa@gen-lang-client-0281999829.iam.gserviceaccount.com" \
  --role "roles/secretmanager.secretAccessor"

gcloud run services update aura-workspace-v2-fresh \
  --project gen-lang-client-0281999829 \
  --region us-central1 \
  --service-account "aura-runtime-sa@gen-lang-client-0281999829.iam.gserviceaccount.com"
```

### Cloud Run Build/Run Notes

- Build command: `npm run build`
- Start command: `npm run start`
- Production output: `dist/`
- Production container: `Dockerfile`

## Sports Backfill

### Purpose

`src/jobs/backfill-sports.ts` creates a backend-only memory staging layer for historical sports data in Firestore. This is designed for future baseline cards and grounding receipts.

This job is intentionally **not wired** to:
- homepage cards
- chat responses
- betting cards

For `nba` + `espn`, the job also extracts player box score logs from ESPN game summaries into staging.

### Staging Collections

The backfill writes only to staging collections:
- `sports_backfill_runs`
- `sports_games_staging`
- `sports_teams_staging`
- `sports_players_staging`
- `sports_player_game_logs_staging`
- `sports_sources_staging`

### Dry-Run Command

```bash
npm run backfill:sports:dry-run
```

Dry-run mode simulates writes and prints a run receipt. It does not write games/teams/players/player logs.

### Write Command

```bash
npm run backfill:sports -- --league nba --start-date 2026-05-20 --end-date 2026-05-23 --source espn --limit 50
```

### Safe One-Day Write (recommended smoke test)

```bash
npm run backfill:sports -- --league nba --start-date 2026-05-23 --end-date 2026-05-23 --source espn --limit 10
```

### Wider Historical Write (requires explicit confirmation)

```bash
npm run backfill:sports -- --league nba --start-date 2026-03-01 --end-date 2026-05-24 --source espn --limit 200 --confirm-wide
```

`--limit` means **maximum number of events/games processed across the whole run**. It is not a document count limit.

### Environment Variables

- `GOOGLE_APPLICATION_CREDENTIALS` (optional; path to service account credentials)
- `FIREBASE_PROJECT_ID` (optional override for project selection)
- `GOOGLE_CLOUD_PROJECT` (optional override for project selection)
- `FIREBASE_APPLET_CONFIG_PATH` (optional path override for `firebase-applet-config.json`)
- `ESPN_FETCH_TIMEOUT_MS` (optional; default `10000`)
- `ESPN_FETCH_RETRIES` (optional; default `2`)
- `SPORTS_SCOREBOARD_TIMEZONE` (optional; defaults to `America/New_York` for date bucketing)
- `SPORTS_FIRESTORE_BATCH_SIZE` (optional; capped at `400`, default `250`)

### Date + Type Semantics

- `sports_games_staging.date` and `sports_player_game_logs_staging.date` use scoreboard-local date bucketing (`SPORTS_SCOREBOARD_TIMEZONE`) to avoid UTC boundary misses.
- Raw event timestamp is preserved as `scheduled_at_utc` on game documents, with derived `scheduled_date_utc` and `scheduled_date_local`.
- `minutes` is normalized to a numeric value (decimal minutes), with original raw value preserved as `minutes_raw`.

### Receipt Model and Growth

- `sports_backfill_runs` and `sports_sources_staging` are **per-run audit receipts by design**.
- Source receipt docs include `run_id`, `receipt_mode: "per_run_audit"`, `fetch_type`, and `source_key`.
- Core staging records (`sports_games_staging`, `sports_teams_staging`, `sports_players_staging`, `sports_player_game_logs_staging`) remain idempotent through stable IDs + merge upserts.

### Safety Notes

- Wide date ranges (>45 dates) are blocked unless `--confirm-wide` is passed.
- ESPN fetches use timeout + retries + exponential backoff with jitter for retryable failures (`429`, `500`, `502`, `503`, `504`, network, timeout).
- Do not wire staging collections directly into homepage/cards/chat/feed yet; this layer is intentionally backend-only.
- Local macOS `npm run build` can fail due to a Rollup binary code-signature/optional dependency issue. Cloud Run Linux source builds can still pass.

### Firestore Inspection

1. Open Firestore in GCP console for project `gen-lang-client-0281999829`.
2. Use database `ai-studio-038c1bef-69af-45e5-8e6e-2fe3ae9ffb2b`.
3. Inspect `sports_backfill_runs` first, then `sports_sources_staging`, `sports_games_staging`, and `sports_teams_staging`.
