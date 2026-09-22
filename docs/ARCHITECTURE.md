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

4. **Dynamic Model Resolution Across Unified Catalog**:
   - Jev evaluates the task requirements (intent, cognitive difficulty 1-5, and reasoning needs).
   - The decision engine (`src/router.ts`) evaluates the synchronized catalog (540+ models across OpenRouter, Mammouth AI, and Azure AI Foundry) to pick the best model matching those requirements.
   - Once the model is selected, the router resolves which provider hosts that model (Azure AI Foundry, Mammouth, or OpenRouter) and dispatches the call with automatic failover.

5. **Streaming & Accounting Pipeline**:
   - If `stream: true`, the gateway initiates a Server-Sent Events (`text/event-stream`) connection to the client and immediately pipes upstream chunks.
   - The chunk stream is concurrently monitored to extract token usage or estimate token count.
   - Upon completion, financial metrics are calculated using the aggregator's live token pricing (stored in `models_catalog`) and recorded in SQLite.

---

## 3. Database Schema (`prompt_router.db`)

Managed via Node 24's native `node:sqlite` (`DatabaseSync`):

```sql
CREATE TABLE models_catalog (
  id TEXT PRIMARY KEY,
  name TEXT,
  description TEXT,
  provider TEXT,
  prompt_price REAL DEFAULT 0.0,
  completion_price REAL DEFAULT 0.0,
  context_length INTEGER DEFAULT 0,
  supports_reasoning BOOLEAN DEFAULT 0,
  tier TEXT DEFAULT 'balanced',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

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

---

## 4. Multi-Turn Session Continuity & Cache Affinity Architecture

When IDE clients (Cursor, Claude Code, Goose, Cline) engage in iterative software engineering, conversations rapidly accumulate 20,000 to 120,000 tokens of context (file reads, compiler outputs, terminal logs, and unified diffs).

### A. The Cache Thrashing Dilemma
All major frontier LLM providers implement **KV Prompt Caching**:
- **Anthropic Claude 3.5 Sonnet**: $3.00/M base prompt input $\rightarrow$ **$0.30/M cached input** (90% discount).
- **DeepSeek R1 / V3**: $0.55/M base prompt input $\rightarrow$ **$0.07/M cached input** (87% discount).
- **OpenAI GPT-4o**: $2.50/M base prompt input $\rightarrow$ **$1.25/M cached input** (50% discount).

If a router switches models mid-thread (e.g. from Claude Sonnet to Gemini Flash for a simple follow-up, then back to Claude), it incurs two major penalties:
1. **Cache Invalidation**: The prompt cache on the primary model is invalidated.
2. **Context Ingestion Overhead**: Re-evaluating 80k uncached tokens on an alternative model ($0.012–$0.035) plus re-populating the cache on the anchor model ($3.75/M cache write) costs **10x more** than simply paying for 80k cached tokens on the incumbent anchor model ($0.024).

### B. Session Fingerprinting Engine
Prompt-Router tracks conversational threads through deterministic identification:
1. **Client Session Headers**: Explicit `X-Session-ID`, `Session-ID`, or `Conversation-ID` headers sent by IDE agents.
2. **Root Conversation Hashing**: If headers are omitted, the router computes a SHA-256 fingerprint from the immutable conversation root:
   $$\text{Seed} = \text{System Prompt} \parallel \text{First User Message}$$
   $$\text{Session ID} = \text{SHA256}(\text{Seed})[0..16]$$

### C. Hysteresis Decision Rules
Within `src/router.ts`, Prompt-Router balances model specialization against cache economics:
- **Short Contexts ($< 12{,}000$ tokens)**: Jev routes dynamically across all 540+ catalog models without restriction.
- **Large Contexts ($\ge 12{,}000$ tokens or turn $\ge 2$ with $\ge 6{,}000$ tokens)**: The router enforces **Sticky Anchor Affinity**, routing to the incumbent model to maintain the 75%–90% prompt cache discount.
- **Hysteresis Override**: Affinity is broken *only* if Jev evaluates a definitive need for extended chain-of-thought reasoning ($\text{needs\_reasoner} \ge 0.70$), in which case the router intentionally transfers the context to DeepSeek R1.

### D. In-Band Threads vs Out-of-Band Satellite Tasks
Prompt-Router differentiates between:
- **In-Band Thread Turns**: Multi-turn coding conversations that carry the full repository context. These remain anchored.
- **Out-of-Band Satellite Tasks**: Standalone queries (git commit message generation, documentation lookup, single-line completions). Because they carry only a few hundred tokens of context, Jev freely dispatches them to ultra-cheap models (Gemini 2.5 Flash, GPT-4o-mini) without touching the main thread's cache.

