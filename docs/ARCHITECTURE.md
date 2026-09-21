# Architecture Specification

## 1. System Overview

Prompt-Router is a local or cloud-deployable reverse proxy designed to sit between developer user interfaces (IDEs, coding agents, CLI tools) and upstream LLM providers (Mammouth AI and OpenRouter).

It intercepts standard OpenAI API calls (`POST /v1/chat/completions`), extracts conversation context, and invokes a non-autoregressive decision model (**TypeSafe Jev System One**) to evaluate cognitive difficulty, task category, and reasoning requirements in ~120ms. Based on calibrated probabilistic outputs, it forwards the request to the optimal model and streams the completion back with zero perceived latency while recording full financial optics into an embedded SQLite database.

```
+-------------------------------------------------------------------------+
|                           DEVELOPER CLIENTS                             |
|          Goose Agent · Claude Code · Cursor · VS Code · Anti-Gravity    |
+------------------------------------+------------------------------------+
                                     |
                                     | POST /v1/chat/completions
                                     v
+-------------------------------------------------------------------------+
|                         PROMPT-ROUTER GATEWAY                           |
|                                                                         |
|  +--------------------+   +-----------------------+   +---------------+ |
|  | Context Extractor  |-->| Jev System One Client |-->| Decision      | |
|  | & Sanitizer        |   | (~120ms parallel)     |   | Router Matrix | |
|  +--------------------+   +-----------------------+   +-------+-------+ |
|                                                               |         |
|  +--------------------+   +-----------------------+           |         |
|  | SSE Streaming      |<--| Financial Accounting  |<----------+         |
|  | & Usage Collector  |   | & SQLite Ledger       |                     |
|  +--------------------+   +-----------------------+                     |
+------------------------------------+------------------------------------+
                                     |
                  +------------------+------------------+
                  |                                     |
                  v                                     v
+----------------------------------+   +----------------------------------+
|           MAMMOUTH AI            |   |           OPENROUTER             |
|   Claude 3.5 · GPT-4o · Gemini   |   |   DeepSeek R1 · Specialist LLMs  |
+----------------------------------+   +----------------------------------+
```

---

## 2. Request Lifecycle

1. **Client Request**:
   - The developer tool issues an HTTP `POST` to `/v1/chat/completions` (or `/chat/completions`).
   - The incoming request may be streaming (`stream: true`) or synchronous (`stream: false`).
   - The client identifier is automatically detected from HTTP headers (`User-Agent`, `X-OpenRouter-Title`, or custom headers).

2. **State Preparation**:
   - The router extracts recent context from the `messages` array:
     - Extracts the system prompt (if present) to maintain operational rules.
     - Extracts the last user message turn (the active prompt).
     - Retains up to the last 5 turns to establish conversational trajectory.
     - Censors or summarizes heavy media/attachments into concise text tokens to prevent exceeding Jev's context window.

3. **Jev Parallel Evaluation**:
   - The compiled state is dispatched to `POST https://api.typesafe.ai/v1/systemone`.
   - In a single parallel forward pass (70–150ms), Jev evaluates three orthogonal questions:
     - `intent` (Choice): Determines task capability domain.
     - `complexity` (Score 1–5): Evaluates cognitive load.
     - `needs_reasoner` (Noul 0–1): Evaluates need for chain-of-thought models.
   - If Jev is unreachable or `TYPESAFE_API_KEY` is omitted, the router executes an internal heuristic classifier with zero latency penalty.

4. **Target Model & Provider Selection**:
   - The decision engine (`src/router.ts`) selects the optimal model using the active strategy (`cost_optimized`, `performance_optimized`, or `balanced`).
   - Provider priority is checked:
     - If Mammouth AI supports the model and has an active key, it is selected as primary.
     - Otherwise, OpenRouter is selected.
     - Seamless automatic failover is performed if the primary provider returns 4xx/5xx or times out.

5. **Streaming & Accounting Pipeline**:
   - If `stream: true`, the gateway initiates a Server-Sent Events (`text/event-stream`) connection to the client and immediately pipes upstream chunks.
   - The chunk stream is concurrently monitored to extract token usage or estimate token count.
   - Upon completion, exact financial metrics are calculated (Actual Spend, Benchmark Claude Cost, Benchmark GPT-4o Cost, Net Savings) and recorded in SQLite.

---

## 3. Database Schema (`prompt_router.db`)

Managed via Node 24's native `node:sqlite` (`DatabaseSync`):

```sql
CREATE TABLE requests_log (
  id TEXT PRIMARY KEY,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  client_agent TEXT,
  model_requested TEXT,
  model_routed TEXT,
  provider_used TEXT,
  jev_intent TEXT,
  jev_complexity REAL,
  jev_confidence REAL,
  jev_needs_reasoner REAL,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  jev_duration_ms INTEGER DEFAULT 0,
  cost_jev REAL DEFAULT 0.0,
  cost_actual REAL DEFAULT 0.0,
  cost_if_claude REAL DEFAULT 0.0,
  cost_if_gpt4o REAL DEFAULT 0.0,
  savings_vs_claude REAL DEFAULT 0.0,
  prompt_preview TEXT
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```
