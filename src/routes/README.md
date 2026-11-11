# Prompt-Router Routes

## Overview
Express HTTP route handlers and Server-Sent Events (SSE) endpoints. Implements the OpenAI-compatible Chat Completions and Models API specifications, serves telemetry and metrics for the real-time HUD dashboard, and exposes management APIs for system settings, model catalog synchronization, and subscriptions.

## Interface
- `handleChatCompletions(req: Request, res: Response)` `[src/routes/completions.ts:handleChatCompletions]` - Handles `POST /v1/chat/completions` and `POST /chat/completions`; classifies intent, selects optimal routes, executes completions, and streams or returns responses.
- `recordAndBroadcastRequest(entry: any)` `[src/routes/completions.ts:recordAndBroadcastRequest]` - Persists completion logs to SQLite, updates provider token usage, and broadcasts live SSE events.
- `detectClientAgent(req: Request): string` `[src/routes/completions.ts:detectClientAgent]` - Inspects incoming request headers and payload structure to identify developer clients (`goose`, `claude-code`, `cursor`, `vscode`, `anti-gravity`, etc.).
- `extractSessionId(req: Request, messages: any[]): string` `[src/routes/completions.ts:extractSessionId]` - Extracts header-based conversation ID or computes a 16-character SHA-256 session hash for break-even cache affinity.
- `handleListModels(req: Request, res: Response)` `[src/routes/models.ts:handleListModels]` - Handles `GET /v1/models` and `GET /models`, returning available models in OpenAI format.
- `handleGetModel(req: Request, res: Response)` `[src/routes/models.ts:handleGetModel]` - Handles `GET /v1/models/:model` and `GET /v1/models/:vendor/:model` for client model availability verification.
- `getFormattedMetrics()` `[src/routes/api.ts:getFormattedMetrics]` - Compiles high-level usage metrics, financial savings summaries, breakdown maps, and subscription states.
- `handleGetMetrics(req: Request, res: Response)` `[src/routes/api.ts:handleGetMetrics]` - Handles `GET /api/metrics`.
- `handleTelemetryStream(req: Request, res: Response)` `[src/routes/api.ts:handleTelemetryStream]` - Handles `GET /api/telemetry/stream` SSE stream with initial state and heartbeat pings.
- `handleGetArbitrage(req: Request, res: Response)` `[src/routes/api.ts:handleGetArbitrage]` - Handles `GET /api/arbitrage` returning real-time provider health metrics.
- `handleTestRoute(req: Request, res: Response)` `[src/routes/api.ts:handleTestRoute]` - Handles `POST /api/test-route` to evaluate and simulate routing for a given test prompt.
- `handleGetLogs(req: Request, res: Response)` `[src/routes/api.ts:handleGetLogs]` - Handles `GET /api/logs` with pagination and filtering.
- `handleGetLogDetail(req: Request, res: Response)` `[src/routes/api.ts:handleGetLogDetail]` - Handles `GET /api/logs/:id`.
- `handleGetReports(req: Request, res: Response)` `[src/routes/api.ts:handleGetReports]` - Handles `GET /api/reports` for multi-dimensional analytics.
- `handleGetSettings(req: Request, res: Response)` `[src/routes/api.ts:handleGetSettings]` - Handles `GET /api/settings`.
- `handleUpdateSettings(req: Request, res: Response)` `[src/routes/api.ts:handleUpdateSettings]` - Handles `POST /api/settings` and triggers provider subscription re-sync.
- `handleGetCatalog(req: Request, res: Response)` `[src/routes/api.ts:handleGetCatalog]` - Handles `GET /api/catalog` with search and tier filters.
- `handleSyncCatalog(req: Request, res: Response)` `[src/routes/api.ts:handleSyncCatalog]` - Handles `POST /api/catalog/sync`.
- `handleGetSubscriptions(req: Request, res: Response)` `[src/routes/api.ts:handleGetSubscriptions]` - Handles `GET /api/subscriptions`.
- `handleUpdateSubscription(req: Request, res: Response)` `[src/routes/api.ts:handleUpdateSubscription]` - Handles `POST /api/subscriptions/update`.
- `handleSyncSubscriptions(req: Request, res: Response)` `[src/routes/api.ts:handleSyncSubscriptions]` - Handles `POST /api/subscriptions/sync`.

## Invariants
- `[src/routes/completions.ts:requestedModel]` Defaults `model` parameter to `'auto'` when omitted or set to `'prompt-router'`.
- `[src/routes/completions.ts:isStream]` Streams SSE chunks (`chat.completion.chunk`) if `body.stream` is `true`, otherwise returns a complete JSON object (`chat.completion`).
- `[src/routes/completions.ts:handleUnconfiguredMockStream]` If target provider credentials are not configured, returns an informative demo completion explaining Jev evaluation and routing decisions rather than crashing.
- `[src/routes/api.ts:handleTelemetryStream:pingInterval]` Emits a `: ping\n\n` SSE comment every 15 seconds to prevent reverse proxy connection termination.

## Side Effects
- `[src/routes/completions.ts:recordAndBroadcastRequest]` Inserts execution audit records into SQLite `requests_log` table.
- `[src/routes/api.ts:handleTelemetryStream]` Establishes long-lived SSE connections and pushes state events to connected HTTP clients.
- `[src/routes/api.ts:handleUpdateSettings]` Persists updated credentials and settings in SQLite `settings` table and triggers background credential probes.

## Verification
- Run: `npm test`
