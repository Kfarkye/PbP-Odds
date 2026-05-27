# AURA: System Architecture Blueprint

This document specifies the high-level architecture of AURA's AI-native sports intelligence pipeline and database schema.

## 1. Core Paradigm: The "Software Factory"
AURA separates *ingestion* from *response generation*. Unlike a standard AI chatbot wrapper that pulls data on every single user request (which introduces latency and hallucination), AURA ingests high-frequency sports data into strict schemas within **Firebase Firestore**. The LLM layer acts exclusively as a *reasoning engine* querying a highly structured database, rather than functioning as a direct data-retrieval layer. At Google scale, this paradigm heavily utilizes **Gemini Context Caching** for the Resolver layer to handle millions of queries without parallel recalculating costs.

## 2. Infrastructure Tiers

### A. The Staging Memory (Firestore DB)
The backbone of AURA is the unified state machine held in Firestore. It is designed to act as the single source of truth for sports data.

* **`sports_games_staging`**: Tracks game schedules, real-time scoreboard status, and final outcomes.
* **`sports_teams_staging`**: Holds canonical team metadata (Names, Abbreviations, Logos).
* **`sports_players_staging`**: Canonical player registry mapping external Source IDs to AURA IDs, including headshots and team associations.
* **`sports_player_game_logs_staging`**: The high-fidelity ledger of boxscore permutations. Fuses betting lines, daily performance (minutes, points, rebounds, steals).
* **`sports_sources_staging`**: Tracks API endpoints pinged, timestamps, and request statuses to provide an audit trail for the `SourceReceiptCard`.
* **`sports_backfill_runs`**: Operational control ledger tracking data ingestion runs, start/end dates, total records read, skipped, and written.

### B. The Engine (Node.js/Express)
The engine runs a custom orchestrator layer using `express` and `@google/genai` to manage inbound user requests against the database state.

* **API Layer & Gateway Endpoint (`/api/chat`)**: Receives direct user queries, invokes specific tool delegates (e.g., `delegate_sports_query`, `get_win_probability`), and formulates the response constraint object. Scaled horizontally via **Google Cloud Run** to dynamically allocate instances during traffic spikes (e.g., Sunday NFL bursts).
* **DB Real-Time Event Layer (`queries` collection)**: Moving beyond naive polling, the engine utilizes native **Firestore push streams (`onSnapshot`)** and **Eventarc / Cloud Functions**. Client sessions push intents into `queries` with a `pending` state, instantly triggering serverless functions or active Node listeners to process and resolve with `completed`.
* **Tool Delegators (Resolver Core)**: Specialized scripts (like `handler` integrations inside `/server`) translate specific AI tool requests into tight, direct Firestore queries, validating the object state (Live vs. Final).

### C. Client & Artifact Renderers (React/Vite)
* Uses `feed_cards` collection and direct API responses to render interactive UI components.
* Follows the **Artifact Contract**: Every API response consists of verified objects parsed into Interactive Cards (e.g., `LiveGameCard`, `BettingAngleCard`).

## 3. The Object Resolution Flow (Example User Query)

1. **User asks:** *"How did Jalen Brunson do yesterday?"*
2. **Gateway:** Matches intent via Gemini 3.5 tool-calling (`delegate_sports_query: { date: "YYYYMMDD", team: "Knicks" }`).
3. **Resolver Core:** Instead of hallucinating, the resolver looks strictly in `sports_games_staging` where `date == "YYYYMMDD"` and team is "Knicks". It pulls the `game_id`.
4. **Data Aggregation:** The resolver pulls `sports_player_game_logs_staging` matching the `game_id` and player "Jalen Brunson".
5. **Output Compilation:** The stats, along with cryptographic proofs from `sports_sources_staging`, are assembled into a rigid JSON structure representing the `Artifact`.
6. **Delivery:** The Artifact is served to the Client, rendering an interactive, zero-hallucination *BaselineCard*.

## 4. Operational Maintenance & Cron Jobs
* Periodic jobs synchronize market data (like Kalshi lines) and sports baseline feeds (like ESPN) directly into the Staging collections. Managed via **Cloud Scheduler**, preventing overload and managing backpressure during massive backfills.
* The Cron Generator invokes high-level analysis routines to push editorial updates and betting suggestions to the `feed_cards` table based on structural changes in the staging tables.

## 5. Google-Scale Optimization & Resilience
While the current architecture cleanly handles data separation, "Google-Scale" throughput mandates the following active operational enhancements to ensure infinite horizontal scale without overriding the core Firestore Resolver logic:

* **Cold Storage Offloading (BigQuery Integration):** To prevent Firestore read/write costs from ballooning, `sports_games_staging` and `sports_player_game_logs_staging` aggressively migrate historical, finalized data (games that are `STATUS_FINAL` > 24 hours) into **BigQuery**. The Resolver Core dynamically routes historical player history queries to BigQuery, reserving Firestore exclusively for high-velocity "Hot" data (Live games, today's schedules).
* **Edge Caching for Artifacts (Cloud CDN):** Artifacts that are identical for every user (e.g., a `BaselineCard` summarizing a completed World Series game) are aggressively cached at the edge via Google Cloud CDN with long TTLs. This completely bypasses the Engine and Firestore for universally requested static records.
* **Pub/Sub Stream Ingestion for Live Ticks:** For ultra-low latency live game states (e.g., pitch-by-pitch updates), ESPN data adapters broadcast via **Google Cloud Pub/Sub**, allowing the server to push real-time WebSocket updates directly to clients holding active `LiveGameCard` artifacts, bypassing Firestore write-locks for intermediate micro-states.
* **Distributed Sharding on Staging Memory:** Extremely high-traffic staging tables (like `sports_sources_staging`) utilize distributed counters and sharded document structures to avoid Firestore's 1-write-per-second-per-document soft limit when tracking aggressive backfill telemetry.
