# Prompt-Router Core (`src`)

## Overview
Core engine of Prompt-Router. Coordinates non-autoregressive prompt evaluation via TypeSafe Jev System One, executes break-even cache affinity routing for multi-turn sessions, queries dynamic model catalogs, tracks provider health and arbitrage, manages local subscriptions, and serves an Express gateway with real-time SSE telemetry.

## Interface
- `config` `[src/config.ts:config]` - Global application configuration parsed from environment variables.
- `RouterConfig` `[src/config.ts:RouterConfig]` - Interface defining all server, credential, and routing options.
- `initDatabase()` `[src/db.ts:initDatabase]` - Initializes SQLite schema (`requests_log`, `settings`, `models_catalog`, `subscriptions`) with WAL mode, configurable `DB_PATH`, and automated self-healing against stale/mismatched WAL files.
- `openDatabaseWithRecovery()` `[src/db.ts:openDatabaseWithRecovery]` - Self-healing database connection factory that runs early integrity checks and recovers from corrupted WAL/SHM auxiliary files.
- `logRequest(entry: any)` `[src/db.ts:logRequest]` - Inserts an audit record into `requests_log`.
- `getMetrics()` `[src/db.ts:getMetrics]` - Computes aggregated metrics and breakdowns across all logged requests.
- `getSetting(key: string, defaultValue?: string): string` `[src/db.ts:getSetting]` - Reads a configuration setting from SQLite, falling back to provided default.
- `setSetting(key: string, value: string)` `[src/db.ts:setSetting]` - Persists a configuration setting to SQLite.
- `getDetailedReport(filters: ReportFilters)` `[src/db.ts:getDetailedReport]` - Generates filtered and paginated reporting dataset.
- `evaluateWithJev(messages: any[]): Promise<JevEvaluation>` `[src/jev.ts:evaluateWithJev]` - Evaluates message history using TypeSafe Jev System One SDK or local heuristic fallback.
- `extractStateFromMessages(messages: any[])` `[src/jev.ts:extractStateFromMessages]` - Formats multi-turn message history into concise state context for Jev classification.
- `JevEvaluation` `[src/jev.ts:JevEvaluation]` - Result contract containing intent, complexity score, reasoning probability, and timing.
- `selectOptimalModel(requestedModel: string, jev: JevEvaluation, strategy?: string, sessionId?: string, contextTokens?: number)` `[src/router.ts:selectOptimalModel]` - Evaluates candidate models, subscription availability, and break-even cache affinity economics to select the winning route.
- `getSubscriptionProviderForModel(model: string)` `[src/router.ts:getSubscriptionProviderForModel]` - Resolves whether a given model slug maps to an active subscription provider (`claude_subscription`, `codex_subscription`, `mistral_vibe`, `gemini_cli`, etc.).
- `executeRoutedCompletion(body: any, jev: JevEvaluation, stream?: boolean, sessionId?: string, contextTokens?: number)` `[src/router.ts:executeRoutedCompletion]` - Executes completion dispatch across direct vendors, subscriptions, and aggregators with automated fallback chains.
- `calculateCosts(modelName: string, promptTokens: number, completionTokens: number, jevInputTokens?: number, isSubscription?: boolean): CostCalculation` `[src/pricing.ts:calculateCosts]` - Calculates actual token costs and computes savings relative to frontier baselines.
- `syncCatalog(): Promise<{ count: number; error?: string }>` `[src/catalog.ts:syncCatalog]` - Fetches models and pricing from OpenRouter, Mammouth, NVIDIA NIM, and Mistral AI with cross-vendor model matching, saving to SQLite.
- `loadCatalogFromDb()` `[src/catalog.ts:loadCatalogFromDb]` - Loads the cached model catalog from SQLite into high-speed memory cache.
- `recordProviderPerformance(provider, latencyMs, success, errorMessage)` `[src/arbitrage.ts:recordProviderPerformance]` - Records latency and health samples, detecting budget exceedances.
- `getArbitrageStatus()` `[src/arbitrage.ts:getArbitrageStatus]` - Evaluates health status and routing recommendations between aggregators.
- `broadcastTelemetry(event: string, data: any)` `[src/telemetry.ts:broadcastTelemetry]` - Pushes live SSE updates to connected dashboard clients.
- `initSubscriptionsTable()` `[src/subscriptions.ts:initSubscriptionsTable]` - Seeds default subscriptions (including NVIDIA NIM, ACP bridges, and aggregators) and tracks usage windows.
- `probeSubscriptionCredentials()` `[src/subscriptions.ts:probeSubscriptionCredentials]` - Tests connectivity for configured provider keys and CLI tools.
- Subdirectories:
  - [Providers](./providers/README.md) - Outbound vendor adapters, aggregators, and ACP CLI bridges.
  - [Routes](./routes/README.md) - Express HTTP endpoints and SSE streaming handlers.

## Invariants
- `[src/db.ts:db]` Configures SQLite with `PRAGMA journal_mode = WAL;` and `PRAGMA busy_timeout = 5000;` to prevent database locks under high concurrency.
- `[src/jev.ts:evaluateWithJev]` Gracefully falls back to sub-5ms local heuristic evaluation (`runHeuristicEvaluation`) if `TYPESAFE_API_KEY` is absent or the TypeSafe API times out.
- `[src/router.ts:selectOptimalModel]` Preserves anchor model cache affinity on active multi-turn sessions with `>= 4,000` context tokens when the expected cost of switching (uncached turn + TTL rebuild risk) exceeds warm cache reads.
- `[src/router.ts:executeRoutedCompletion]` Cascades failed requests through direct credentials -> subscriptions -> primary aggregator -> fallback aggregator.
- `[src/catalog.ts:classifyModelTier]` Deterministically maps models into one of four tiers: `fast_cheap`, `frontier_reasoning`, `frontier_coding`, or `balanced`.

## Side Effects
- `[src/db.ts:db]` Reads and writes SQLite database file `prompt_router.db` on disk.
- `[src/catalog.ts:syncCatalog]` Makes outbound HTTPS requests to OpenRouter and NVIDIA NIM APIs to refresh catalog pricing.
- `[src/index.ts:app.listen]` Binds and listens on local TCP port (`config.port`, default 4000).

## Verification
- Run: `npm test`
