<div align="center">
  <img src="public/assets/logo-horizontal.svg" alt="Prompt-Router Logo" width="560px" style="margin-bottom: 16px;" />

  <h3>⚡ Sub-120ms Zero-Hallucination Smart Gateway & Optics Dashboard ⚡</h3>

  <p align="center">
    <a href="https://github.com/robinwintertaylor/Prompt-Router"><img src="https://img.shields.io/badge/Latency-Sub--120ms-0D47A1?style=for-the-badge&logo=fastapi&logoColor=white" alt="Sub-120ms Latency" /></a>
    <a href="https://github.com/robinwintertaylor/Prompt-Router"><img src="https://img.shields.io/badge/Models--Supported-540%2B-C6FF00?style=for-the-badge&logo=cpu&logoColor=black" alt="540+ Models" /></a>
    <a href="https://github.com/robinwintertaylor/Prompt-Router"><img src="https://img.shields.io/badge/Cache--Savings-75%25--90%25-1E88E5?style=for-the-badge&logo=redis&logoColor=white" alt="75%-90% Cache Savings" /></a>
    <a href="https://github.com/robinwintertaylor/Prompt-Router"><img src="https://img.shields.io/badge/Safety-0.60--Gated-ff3e00?style=for-the-badge&logo=shield-halved&logoColor=white" alt="0.60 Confidence Gated" /></a>
    <a href="https://github.com/robinwintertaylor/Prompt-Router"><img src="https://img.shields.io/badge/Engine-TypeSafe--Jev-00E5FF?style=for-the-badge&logo=blueprint&logoColor=black" alt="TypeSafe Jev Engine" /></a>
  </p>

  <p align="center">
    <b>Dynamic, low-cost intelligence routing across 540+ frontier & open models powered by TypeSafe Jev System One.</b><br />
    <i>Drop-in replacement for OpenAI API endpoints with real-time HUD optics and token telemetry.</i>
  </p>
</div>

---

## 🚦 About Prompt-Router

**Prompt-Router** is an ultra-fast, zero-hallucination intelligent LLM gateway and telemetry dashboard designed for high-velocity coding agents (Goose, Cursor, Claude Code, VS Code) and enterprise pipelines.

Instead of burning engineering budget sending every trivial lookup or formatting task to expensive frontier models ($15–$30/M tokens), Prompt-Router deploys **TypeSafe Jev System One**—a non-autoregressive, sub-120ms classification engine—to analyze intent, task complexity, and reasoning requirements. It then dispatches each prompt to the exact model best suited for the job across **Azure AI Foundry**, **Mammouth AI**, and **OpenRouter**.

---

## 🧠 Heavy Engineering Under the Hood

### 🌀 1. The Cache Thrashing Paradox (Solved!)
Modern frontier models offer **75%–90% prompt caching discounts** (Anthropic charges $0.30/M for cached tokens vs $3.00/M uncached; DeepSeek charges $0.07/M cached vs $0.55/M).
* **The Problem**: Naive multi-turn LLM routers evaluate every turn in isolation. Switching models mid-turn invalidates the upstream provider's KV cache, forcing full token ingestion fees on every single step—costing up to 10× *more* than staying on a frontier model!
* **The Fix**: Prompt-Router features **Session Fingerprinting & KV Cache Affinity**. Once conversation history exceeds $\ge 12\text{k}$ tokens, queries anchor to the incumbent model to protect prompt cache discounts, switching only when Jev detects extreme formal reasoning needs ($\ge 0.70$).

### 🛡️ 2. The 0.60 Confidence-Gated Safety Rule
Zero-hallucination routing demands deterministic fail-safes. When Jev's calibrated uncertainty band drops below **0.60 confidence**, Prompt-Router refuses to downgrade to flash models. Instead, it automatically elevates the query to robust fail-safe tiers (`claude-3.5-sonnet`, `gpt-4o-mini`, or `claude-opus-4.8`) to guarantee agent reliability.

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

---

## 🌟 Key Highlights

- **Jev-Powered Fast Classification**: Uses TypeSafe's non-autoregressive **Jev** System One model (`jev-latest`) to evaluate cognitive complexity, intent, and reasoning needs in parallel in **under 150ms** for only **$0.042 per million input tokens** (free output).
- **Zero Hallucination Routing**: Jev never generates unstructured text; it operates on deterministic primitives (`choice`, `score`, `noul`) with calibrated probability distributions.
- **Drop-in OpenAI Compatibility**: Connects seamlessly with any standard OpenAI-compatible client, SDK, or developer IDE (Cursor, VS Code, Goose, Claude Code, Anti-Gravity).
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

### 2. Cursor IDE
1. Open **Cursor Settings** ➔ **Models**.
2. Enable **OpenAI API Key** and set it to any placeholder (e.g. `prompt-router`).
3. Under **OpenAI Base URL**, enter: `http://localhost:4000/v1`.
4. Add model name: `auto` (or `jev-smart-router`).

### 3. VS Code (Continue / Cline / Copilot)
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

### 4. Claude Code / Anti-Gravity
Set the OpenAI endpoint override:
```bash
export OPENAI_BASE_URL="http://localhost:4000/v1"
export OPENAI_API_KEY="prompt-router"
```

---

## 📈 Real-Time Optics & Cost Accounting

Prompt-Router compares every routed prompt against top frontier models:

| Model / System | Input Price / MTok | Output Price / MTok | Purpose in Router |
| :--- | :--- | :--- | :--- |
| **TypeSafe Jev** | **$0.042** | **$0.00** (Free) | Fast non-autoregressive decision engine (~120ms) |
| **Google Gemini 2.5 Flash** | $0.10 | $0.40 | Greetings, short lookups, basic formatting |
| **OpenAI GPT-4o-mini** | $0.15 | $0.60 | Standard scripting, single-file edits, data extraction |
| **DeepSeek R1** | $0.55 | $2.19 | Hard logical proofs, math, deep reasoning |
| **Anthropic Claude 3.5 Sonnet** | $3.00 | $15.00 | Multi-file architecture, difficult refactoring (Benchmark) |
| **OpenAI GPT-4o** | $2.50 | $10.00 | Complex reasoning & systems (Benchmark) |

### Net Savings Calculation
For every prompt, the router records:
$$\text{Actual Cost} = \text{Cost}_{\text{Jev}} + \text{Cost}_{\text{Routed Model}}$$
$$\text{Savings vs Claude} = \max(0, \text{Cost}_{\text{Claude 3.5}} - \text{Actual Cost})$$
$$\text{Savings vs GPT-4o} = \max(0, \text{Cost}_{\text{GPT-4o}} - \text{Actual Cost})$$

These metrics are saved automatically to `prompt_router.db` and rendered on the live dashboard.

---

## 🔄 Multi-Turn Continuity & KV Cache Affinity

In long agentic coding sessions (such as within Cursor, Claude Code, or Goose), conversations accumulate tens of thousands of tokens of history (file reads, tool calls, terminal outputs, and code diffs).

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

