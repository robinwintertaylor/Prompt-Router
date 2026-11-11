# Prompt-Router Dashboard UI (`public`)

## Overview
Client-side web dashboard and reporting interface. Renders real-time telemetry metrics, token savings HUD optics, live Server-Sent Events (SSE) completion feeds, provider arbitrage health monitors, dynamic model catalogs, and interactive routing simulation playgrounds.

## Interface
- `initApp()` `[public/app.js:initApp]` - Initializes the main optics HUD dashboard, binds event listeners, establishes SSE telemetry stream, and kicks off initial data fetching.
- `initTheme()` `[public/app.js:initTheme]`, `[public/reports.js:initTheme]` - Detects and applies dark/light theme from `localStorage` or browser preference (`prefers-color-scheme`).
- `initTelemetryStream()` `[public/app.js:initTelemetryStream]` - Opens an `EventSource` connection to `/api/telemetry/stream` for real-time request completion updates and metric counter pushes.
- `fetchMetrics()` `[public/app.js:fetchMetrics]` - Fetches aggregated cost savings, token totals, and duration statistics from `GET /api/metrics`.
- `fetchLogs()` `[public/app.js:fetchLogs]` - Retrieves recent request logs from `GET /api/logs`.
- `fetchSettings()` `[public/app.js:fetchSettings]` - Loads current API keys and routing configuration from `GET /api/settings`.
- `saveSettings()` `[public/app.js:saveSettings]` - Submits updated provider keys and default routing options to `POST /api/settings`.
- `fetchCatalog(page?: number)` `[public/app.js:fetchCatalog]` - Queries available models and live pricing rates from `GET /api/catalog` with search, tier, and provider filtering, plus pagination controls.
- `renderSubscriptions(subs)` `[public/app.js:renderSubscriptions]` - Renders real-time provider balances, free quotas, and status with an interactive Active Only vs. All Providers view mode toggle.
- `fetchSubscriptions()` `[public/app.js:fetchSubscriptions]` - Loads provider subscription statuses and remaining token quotas from `GET /api/subscriptions`.
- `runPromptTest()` `[public/app.js:runPromptTest]` - Sends interactive playground queries to `POST /api/test-route` to preview Jev evaluation and routing choices.
- `initFilters()` `[public/reports.js:initFilters]` - Configures multi-dimensional reporting filters (timeframe, provider, model, intent, client, search).
- `fetchReportData()` `[public/reports.js:fetchReportData]` - Requests aggregated reporting analytics from `GET /api/reports`.
- `initActions()` `[public/reports.js:initActions]` - Sets up reporting UI event handlers including CSV export navigation via `GET /api/reports?format=csv`.

## Invariants
- `[public/app.js:setInterval]` Operates a 6-second polling heartbeat as a fallback whenever the SSE connection is closed or reconnecting.
- `[public/app.js:initTheme]` Persists theme selection in `localStorage` key `'prompt_router_theme'`; defaults to dark theme when OS reports dark mode.

## Side Effects
- Mutates DOM elements across `index.html` and `reports.html`.
- Makes client-side HTTP `fetch()` requests and establishes persistent `EventSource` SSE streams to `/api/*` endpoints.
- Writes to browser `localStorage` for theme persistence.

## Verification
- Run: `npm test`
