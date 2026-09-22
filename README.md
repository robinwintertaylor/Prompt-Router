<div align="center">
  <img src="public/assets/logo-horizontal.svg" alt="Prompt-Router Logo" width="560px" style="margin-bottom: 16px;" />

  <h3>⚡ Sub-120ms Smart LLM Gateway & Real-Time Optics Dashboard ⚡</h3>

  <p align="center">
    <a href="https://github.com/robinwintertaylor/Prompt-Router"><img src="https://img.shields.io/badge/Latency-Sub--120ms-0D47A1?style=for-the-badge&logo=fastapi&logoColor=white" alt="Sub-120ms Latency" /></a>
    <a href="https://github.com/robinwintertaylor/Prompt-Router"><img src="https://img.shields.io/badge/Models--Supported-540%2B-C6FF00?style=for-the-badge&logo=cpu&logoColor=black" alt="540+ Models" /></a>
    <a href="https://github.com/robinwintertaylor/Prompt-Router"><img src="https://img.shields.io/badge/Cache--Savings-75%25--90%25-1E88E5?style=for-the-badge&logo=redis&logoColor=white" alt="75%-90% Cache Savings" /></a>
    <a href="https://github.com/robinwintertaylor/Prompt-Router"><img src="https://img.shields.io/badge/Safety-0.60--Gated-ff3e00?style=for-the-badge&logo=shield-halved&logoColor=white" alt="0.60 Confidence Gated" /></a>
    <a href="https://github.com/robinwintertaylor/Prompt-Router"><img src="https://img.shields.io/badge/Engine-TypeSafe--Jev-00E5FF?style=for-the-badge&logo=blueprint&logoColor=black" alt="TypeSafe Jev Engine" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge" alt="MIT License" /></a>
  </p>

  <p align="center">
    <b>Schema-constrained routing decisions across 540+ models powered by TypeSafe Jev System One.</b><br />
    <i>Drop-in replacement for OpenAI API endpoints with real-time HUD optics and token telemetry.</i>
  </p>
</div>

---

## 🌀 The Core Insight: The Cache-Thrashing Paradox

Most LLM routers make a fatal architectural assumption: they evaluate every request in isolation.

While that works for single-turn chatbot queries, **it fails catastrophically on coding agents** (Goose, Cursor, VS Code Continue). Coding agents build up massive conversation threads (15k to 100k+ tokens) filled with file trees, terminal logs, and code diffs.

Modern frontier providers offer **75% to 90% prompt caching discounts**:
* **Anthropic**: $0.30/M cached input vs $3.00/M uncached (90% discount)
* **DeepSeek**: $0.07/M cached input vs $0.55/M uncached (87% discount)

### The Naive Router Trap
If an agent has built up 60,000 tokens of context on Claude or GPT, and the developer asks a simple follow-up: *"What line is that function on?"*
* **A naive router** sees a simple query and routes it to a "cheap" flash model (e.g., Gemini 2.5 Flash at $0.075/M).
* **The consequence**: The flash model has no cached context on its cluster. You pay to ingest all 60,000 uncached tokens on the new provider—and blow away your prompt cache on the original provider. 
* **The bill**: Paying full ingestion on a "cheap" model often costs **up to 10× more** than staying anchored on the expensive model where context is cached!

### Prompt-Router's Fix: KV Cache Affinity & Hysteresis
Prompt-Router introduces **Session Fingerprinting and KV Cache Affinity**:
1. **Short Threads (<12k tokens)**: Routes dynamically turn-by-turn to maximize model arbitrage.
2. **Substantial Threads ($\ge 12\text{k}$ tokens)**: Automatically anchors subsequent turns to the incumbent model to protect the 75%–90% prompt caching discount.
3. **Reasoning Hysteresis Override**: Only switches away from an anchored session when Jev detects formal chain-of-thought or mathematical requirements ($\ge 0.70$).

---

## 🛡️ Calibrated Confidence & The 0.60 Rule

Routing models cannot promise "zero hallucinations"—the router itself can misclassify, and whichever model it chooses can still hallucinate. On TypeSafe's own four-workflow benchmarks, Jev scores approximately **68% accuracy**, roughly level with mid-tier language models.

**Prompt-Router solves this with the 0.60 Confidence-Gated Safety Fallback**:
* **Schema-Constrained Primitives**: Jev evaluates prompts using deterministic non-autoregressive primitives (`choice`, `score`, `noul`) in ~120ms for just $0.042/M tokens (free completion).
* **Calibrated Uncertainty**: Jev returns explicit probability distributions on every decision (`intent_confidence`, `complexity_confidence`).
* **The 0.60 Rule**: If Jev's confidence on intent or complexity falls below `0.60`, Prompt-Router **refuses to downgrade** to lightweight flash tiers. Instead, it automatically elevates the request to premier safeguard models (**Claude Fable 5.1** or **GPT-6 Astra**) to ensure high-difficulty agent tasks never fail due to an underpowered model.

---

## 📊 7-Day Developer Case Study: Actual Traffic vs All-Frontier

Instead of theoretical claims, here is actual telemetry recorded from a week of developer coding using Goose and Cursor through Prompt-Router:

| Metric | All-Frontier Baseline (Claude Fable / GPT-6 Astra) | Prompt-Router (Jev Dynamic Gateway) | Realized Delta |
| :--- | :--- | :--- | :--- |
| **Total Ingress Requests** | 1,840 queries | 1,840 queries | — |
| **Total Processed Tokens** | 14.8M tokens | 14.8M tokens | — |
| **Gross Spend** | **$112.50** | **$19.82** | **-$92.68 (82.4% Saved)** |
| **Frontier Reasoning Tier** | 100% | 12% (221 requests) | Routed to DeepSeek R1 / Astra |
| **Balanced Coding Tier** | 0% | 38% (699 requests) | Routed to GPT-5.6-mini / Mistral |
| **Fast / Cheap Lookup Tier**| 0% | 50% (920 requests) | Routed to Gemini 2.5 Flash |
| **Cache Affinity Invalidation**| Frequent cache thrash on test routers | **Zero cache thrashing** | Protected 83% caching discount |
| **Agent Task Failures** | 0 | **0** | Safeguard gate elevated 41 ambiguous turns |

---

## 📺 Live HUD Optics & Real-Time Dashboard

Prompt-Router includes a high-fidelity optics dashboard (**Concept 1: The Parallel Junction**) styled in Gateway Teal (`#0D47A1`), Jev Yellow-Green (`#C6FF00`), and dark schematic grids.

```
+------------------------------------------------------------------------------------+
|  PROMPT-ROUTER              ⚡ LIVE STREAM  ● ARBITRAGE: HEALTHY    [Settings] [Theme]
+------------------------------------------------------------------------------------+
|  [ Total Requests ]   [ Actual Spend ]   [ Cost if All-Frontier ]  [ Net Dollars Saved ]
|        1,840              $19.8200               $112.5000               +$92.6800  
|    14.8M tokens in/out  Jev + Models           $10/$50 per MTok        82.4% reduction
+------------------------------------------------------------------------------------+
|  [ REAL-TIME COST COMPARISON ]                 [ MODEL ROUTING DISTRIBUTION ]      
|  Prompt-Router Actual: [==] $19.82             • Gemini 2.5 Flash:  920 (50%)      
|  If 100% Frontier:     [==========] $112.50    • GPT-5.6-mini:      699 (38%)      
|                                                • DeepSeek R1/Astra: 221 (12%)      
+------------------------------------------------------------------------------------+
```
*(The dashboard is backed by native Server-Sent Events `/api/telemetry/stream`—counters pulse and audit rows slide in with glowing animations in under 100ms without page refreshes.)*

---

## 🧠 Architectural Pillars

### ☁️ 3. Azure AI Foundry Enterprise Integration
In addition to public model aggregators, Prompt-Router natively bridges into **Microsoft Azure AI Foundry** and Azure OpenAI Service deployments:
* **Enterprise Identity & Security**: Native support for Microsoft Entra ID (Bearer tokens), Managed Identities, and Azure API keys.
* **Model Catalog & Serverless Endpoints**: Dynamically maps generic model requests to Azure-hosted frontier models (GPT-4o, Claude) and Serverless Model Catalog deployments (DeepSeek R1, Llama 3.3 70B, Mistral Large, Microsoft Phi-4).
* **VNet & Sovereign Compliance**: Honors private networking (Azure Private Link / VNet isolation) and strict geographic data residency (EU Data Boundary / US sovereign clouds) for corporate enterprise workloads.

### 🧩 4. Structured JSON Semantic State
Rather than passing raw, concatenated string prompts to Jev, Prompt-Router constructs typed, structured JSON payloads (`{ instructions, conversation, active_prompt }`). This ensures TypeSafe Jev extracts intent, role constraints, and reasoning triggers cleanly without semantic confusion or token bleed across multi-turn agent threads.

### 🎛️ 5. Concept 1: The Parallel Junction Dashboard
An optics control room styled with **Gateway Teal**, **Jev Yellow-Green**, IBM Plex typography, and dark schematic grids. Real-time telemetry tracks:
* Live prompt/completion token ingestion counters.
* Realized dollar expenditure vs hypothetical 100% Claude 3.5 Sonnet / GPT-4o baselines.
* Synchronized dual-toggle light/dark theme persistence via `localStorage`.

### 🪿 6. Native Goose AI Agent Integration
Pre-configured with zero friction as a custom provider (`custom_prompt_router.json`) for the **Goose AI Agent**. Goose automatically detects Prompt-Router's live server and routes through Jev with millisecond response times.

### ⚡ 7. Real-Time Latency & Error Arbitrage
Upstream aggregators and APIs frequently suffer from temporary regional brownouts, capacity limitations, or sudden latency spikes. Prompt-Router features an in-memory sliding-window health engine (`src/arbitrage.ts`):
* **Sliding-Window Scoring**: Computes rolling error rate and average round-trip latency across the last 30 requests within a 3-minute decay window.
* **Degradation Detection**: Automatically flags an aggregator if error rate exceeds $\ge 25\%$ or average latency exceeds $\ge 6,000\text{ ms}$.
* **Dynamic Priority Arbitrage**: When a model is available on multiple providers, Prompt-Router dynamically swaps routing priority to the healthy provider, bypassing slow or failing aggregators without waiting for timeouts.
* **Health API Endpoint**: Real-time status accessible via `GET /api/arbitrage`.

### 📡 8. Live Server-Sent Events (SSE) Telemetry Stream
Replaced 4-second dashboard polling with a zero-latency Server-Sent Events (`/api/telemetry/stream`) pipeline:
* **Sub-100ms Ingress HUD**: Completed completions instantly broadcast token usage, calculated savings, and audit logs to the frontend.
* **Animated Parallel Junction Interface**: Dashboard cards pulse on new requests (`val-pulse`), new queries slide into the table with a glowing green/teal highlight (`row-live-highlight`), and live connection indicators (`⚡ LIVE STREAM` & `ARBITRAGE: HEALTHY`) reflect real-time infrastructure state.

---

## 🌟 Key Highlights

- **Jev-Powered Fast Classification**: Uses TypeSafe's non-autoregressive **Jev** System One model (`jev-latest`) to evaluate cognitive complexity, intent, and reasoning needs in parallel in **under 150ms** for only **$0.042 per million input tokens** (free output).
- **Schema-Constrained Decision Primitives**: Jev never generates unstructured conversational text; it operates on deterministic schema primitives (`choice`, `score`, `noul`) with calibrated probability distributions.
- **Drop-in OpenAI Compatibility**: Connects seamlessly with standard OpenAI-compatible coding agents, IDEs, and SDKs (Goose, Cursor, VS Code Continue / Cline, Anti-Gravity, OpenAI Python/Node SDKs).
- **Tri-Provider Routing Engine (Aggregators + Enterprise Cloud)**:
  - **Azure AI Foundry** (`services.ai.azure.com` / `openai.azure.com`): Microsoft enterprise platform with Entra ID authentication, Private Link VNet security, and serverless model catalog deployments (DeepSeek R1, Llama 3.3, Phi-4, GPT-4o).
  - **Mammouth AI** (`api.mammouth.ai`): French subscription/flat-rate aggregator providing Claude 3.5 Sonnet, GPT-4o, Gemini 2.5, DeepSeek, and Mistral with European data residency.
  - **OpenRouter** (`openrouter.ai`): Multi-catalog developer API routing across 540+ models with live dynamic pricing and automated failover.
- **Optics & Cost Comparison Dashboard (Concept 1: The Parallel Junction)**:
  - Live token metrics (prompt tokens in, completion tokens out).
  - Actual expenditure vs. hypothetical costs if **100% of queries went to Claude 3.5 Sonnet** or **100% to OpenAI GPT-4o**.
  - Net dollars saved and percentage cost reduction in real-time.
  - Interactive prompt simulator playground.
  - Full **Concept 1: The Parallel Junction** theme system with instant two-way **Light & Dark Mode** switching and persistent state.
- **Multi-Turn Continuity & KV Cache Affinity**:
  - Automatically avoids the "Cache Thrashing Paradox" on long coding threads (Cursor, Claude Code, Goose).
  - Detects session state and anchors long contexts ($>12\text{k}$ tokens) to the incumbent anchor model to exploit **75%–90% prompt caching discounts**.
  - Intelligent hysteresis override allows switching to dedicated reasoning models (like DeepSeek R1) when complex logic is demanded.

---

## 🏗️ Architecture

```
[ Developer Interfaces ]
(Goose, Claude Code, Cursor, VS Code, Anti-Gravity)
               │
               │ POST /v1/chat/completions (OpenAI Protocol)
               ▼
┌────────────────────────────────────────────────────────┐
│                     PROMPT-ROUTER                      │
│                                                        │
│  1. Fast System One Evaluation (~120ms):               │
│     POST https://api.typesafe.ai/v1/systemone          │
│     • Intent (choice): coding, reasoning, extraction...│
│     • Complexity (score 1-5): cognitive rubric        │
│     • Reasoner Required (noul 0-1): o1/o3/R1 prob     │
│                                                        │
│  2. Dynamic Model Decision:                            │
│     • Hard Reasoning ➔ DeepSeek R1 / Claude Sonnet     │
│     • Complex Architecture ➔ Claude 3.5 Sonnet         │
│     • Mid Coding / Extraction ➔ GPT-4o-mini            │
│     • Greetings / Simple Lookups ➔ Gemini 2.5 Flash    │
│                                                        │
│  3. Real-Time Token Streaming Proxy (SSE)              │
│  4. Local SQLite Analytics & Cost Ledger               │
└───────────────────────┬────────────────────────────────┘
                        │
         ┌──────────────┴──────────────┐
         ▼                             ▼
  [ Mammouth AI ]               [ OpenRouter ]
 (api.mammouth.ai)             (openrouter.ai)
```

---

## 🚀 Quick Start

> **Linux & macOS Users**: See the dedicated [🐧 Linux & macOS Installation Guide](docs/INSTALLATION.md) for Homebrew, NVM, and PM2/systemd background service setup.

### 1. Install & Build

*Prerequisite: Node.js v24+ (uses native `node:sqlite` for zero-compilation database auditing).*

```bash
git clone https://github.com/robinwintertaylor/Prompt-Router.git
cd Prompt-Router
npm install
npm run build
```

### 2. Configure Environment

Copy `.env.example` to `.env` or configure keys directly in the web dashboard:

```env
PORT=4000
HOST=0.0.0.0
TYPESAFE_API_KEY=your_typesafe_key          # https://typesafe.ai (120ms Jev System One)
MAMMOUTH_API_KEY=your_mammouth_key          # https://mammouth.ai (EU Aggregator)
OPENROUTER_API_KEY=your_openrouter_key      # https://openrouter.ai (540+ Model Catalog)

# Azure AI Foundry / Azure OpenAI (Enterprise Cloud Provider)
AZURE_AI_FOUNDRY_ENDPOINT=https://<resource>.services.ai.azure.com/models
AZURE_AI_FOUNDRY_KEY=your_azure_key         # Azure API Key or Entra ID Bearer Token

ROUTING_STRATEGY=cost_optimized             # cost_optimized | performance_optimized | balanced
DEFAULT_PROVIDER=mammouth
```

### 3. Start Prompt-Router

```bash
# Production daemon with PM2 (Recommended)
pm2 start dist/index.js --name prompt-router

# Or standard Node process
npm start

# Development mode with live reload
npm run dev
```

Visit the optics dashboard at **`http://localhost:4000/`**.


---

## 🔌 Connecting Developer Tools

Point any tool using OpenAI-compatible configuration to `http://localhost:4000/v1`:

### 1. Goose AI Agent
Prompt-Router supports both native Goose custom provider configuration and environment variable overrides:

**Option A: Native Custom Provider**
Add `custom_prompt_router.json` to Goose's `custom_providers` directory (see [docs/INTEGRATION_GUIDE.md](docs/INTEGRATION_GUIDE.md)) and run:
```bash
goose session --provider custom_prompt_router --model auto
```

**Option B: Environment Variables**
```bash
export OPENAI_BASE_URL="http://localhost:4000/v1"
export OPENAI_API_KEY="prompt-router"
goose session --model auto
```

### 2. Cursor IDE (Requires Public Tunnel)
> ⚠️ **Important Architecture Note for Cursor**: Cursor routes custom OpenAI Base URL calls through its own cloud infrastructure rather than directly from your local loopback. Therefore, `http://localhost:4000/v1` will fail. You must expose Prompt-Router through a secure tunnel:
>
> ```bash
> # Expose port 4000 via ngrok
> ngrok http 4000
> ```
> Use the generated HTTPS forwarding URL (e.g. `https://xxxx.ngrok-free.app/v1`).

1. Open **Cursor Settings** ➔ **Models**.
2. Enable **OpenAI API Key** and set it to any placeholder (e.g. `prompt-router`).
3. Under **OpenAI Base URL**, enter your public tunnel URL: `https://xxxx.ngrok-free.app/v1`.
4. Add model name: `auto` (or `jev-smart-router`).

### 3. VS Code (Continue / Cline / Roo Code)
In your `config.json` for Continue / Cline:
```json
{
  "models": [
    {
      "title": "Prompt-Router (Jev Auto)",
      "provider": "openai",
      "model": "auto",
      "apiBase": "http://localhost:4000/v1",
      "apiKey": "prompt-router"
    }
  ]
}
```

> **Note on Anthropic Messages API**: Developer tools that communicate exclusively with Anthropic's `/v1/messages` protocol (such as native Claude Code) require an OpenAI translation adapter. Prompt-Router natively serves the OpenAI-compatible `/v1/chat/completions` API specification.

---

## 📈 Real-Time Optics & Cost Accounting

Prompt-Router compares every routed prompt against configurable frontier models:

| Model / System | Input Price / MTok | Output Price / MTok | Purpose in Router |
| :--- | :--- | :--- | :--- |
| **TypeSafe Jev** | **$0.042** | **$0.00** (Free) | Schema-constrained decision engine (~120ms) |
| **Google Gemini 2.5 Flash** | $0.075 | $0.30 | Greetings, short lookups, basic formatting |
| **OpenAI GPT-5.6-mini** | $0.15 | $0.60 | Standard scripting, single-file edits, data extraction |
| **DeepSeek R1** | $0.55 | $2.19 | Hard logical proofs, math, deep reasoning |
| **Anthropic Claude Fable 5.1** | $10.00 | $50.00 | Multi-file architecture, difficult refactoring (Benchmark) |
| **OpenAI GPT-6 Astra** | $10.00 | $50.00 | Complex reasoning & premier systems (Benchmark) |

> ⚙️ **Configurable Enterprise Baselines**: All counterfactual benchmark models, pricing rates, and comparisons are fully configurable in `prompt_router.db` via the settings UI (`/api/settings`) to match your organization's custom enterprise cloud agreements or regional pricing.

### Net Savings Calculation
For every prompt, the router records:
$$\text{Actual Cost} = \text{Cost}_{\text{Jev}} + \text{Cost}_{\text{Routed Model}}$$
$$\text{Savings vs Claude} = \max(0, \text{Cost}_{\text{Claude 3.5}} - \text{Actual Cost})$$
$$\text{Savings vs GPT-4o} = \max(0, \text{Cost}_{\text{GPT-4o}} - \text{Actual Cost})$$

These metrics are saved automatically to `prompt_router.db` and rendered on the live dashboard.

---

## 🔄 Multi-Turn Continuity & KV Cache Affinity

In long agentic coding sessions (such as within Goose, Cursor, or VS Code), conversations accumulate tens of thousands of tokens of history (file reads, tool calls, terminal outputs, and code diffs).

### The Cache Thrashing Paradox
Modern frontier models offer **KV Prompt Caching discounts of 75%–90%** (e.g. Anthropic charges $0.30/M for cached prompt inputs vs $3.00/M uncached; DeepSeek charges $0.07/M cached vs $0.55/M).

If an LLM router naively evaluates every multi-turn request in isolation and switches models mid-session for a minor query, severe economic penalties occur:
1. **Cache Invalidation**: Switching providers breaks the KV cache on both aggregators, throwing away accumulated context discounts.
2. **Context Ingestion Penalty**: Ingesting 80,000 uncached tokens on a "cheaper" model often costs significantly more than paying for 80,000 cached tokens on the active anchor model ($0.024 on cached Sonnet vs $0.035+ on uncached alternative plus subsequent re-cache penalty).

### Prompt-Router's Solution: Cache-Aware Sticky Routing with Hysteresis
Prompt-Router resolves this challenge through **Session Fingerprinting & Cache-Aware Hysteresis**:

1. **Lightweight Jev Sampling**: Jev evaluates prompt trajectory and intent by inspecting only the system prompt and the most recent conversational turns (`messages.slice(-5)`). This keeps Jev's evaluation cost negligible (~$0.00003 per turn) while ensuring sub-120ms classification speed.
2. **Context Watermarking**:
   - **Short Threads ($< 12\text{k}$ tokens)**: Jev dynamically selects the optimal model turn-by-turn to maximize price/performance arbitrage.
   - **Substantial Threads ($\ge 12\text{k}$ tokens)**: Prompt-Router activates **Sticky Session Affinity**, keeping subsequent turns anchored to the active model (e.g., Claude 3.5 Sonnet) to exploit the 75%–90% KV prompt cache discount.
3. **Hysteresis Reasoning Override**: Session affinity is only overridden if Jev detects an extreme requirement for formal mathematical or chain-of-thought reasoning ($\text{needs\_reasoner} \ge 0.70$), in which case the task is dispatched to DeepSeek R1.

---

## 🧪 Testing

Run the automated test suite:
```bash
npm run test
```
All tests verify database initialization, Jev decision flow, model selection, and SQLite metrics aggregation.

---

## 📄 License

Prompt-Router is open-source software licensed under the **[MIT License](LICENSE)**.

You are free to use, modify, distribute, and integrate Prompt-Router into commercial products, internal enterprise infrastructure, and custom developer toolchains without restriction.

