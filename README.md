# ⚡ Prompt-Router

> **Zero-hallucination, high-performance LLM gateway powered by TypeSafe Jev System One.**  
> Automatically routes incoming prompts from **Goose**, **Claude Code**, **Cursor**, **VS Code**, and **Anti-Gravity** to the most capable and cost-effective models across **Mammouth AI** and **OpenRouter**, with real-time optics, streaming, and cost comparison.

---

## 🌟 Key Highlights

- **Jev-Powered Fast Classification**: Uses TypeSafe's non-autoregressive **Jev** System One model (`jev-latest`) to evaluate cognitive complexity, intent, and reasoning needs in parallel in **under 150ms** for only **$0.042 per million input tokens** (free output).
- **Zero Hallucination Routing**: Jev never generates unstructured text; it operates on deterministic primitives (`choice`, `score`, `noul`) with calibrated probability distributions.
- **Drop-in OpenAI Compatibility**: Connects seamlessly with any standard OpenAI-compatible client, SDK, or developer IDE (Cursor, VS Code, Goose, Claude Code, Anti-Gravity).
- **Dual Downstream Providers**:
  - **Mammouth AI** (`api.mammouth.ai`): French subscription/flat-rate aggregator providing Claude 3.5 Sonnet, GPT-4o, Gemini 2.5, DeepSeek, and Mistral.
  - **OpenRouter** (`openrouter.ai`): Multi-catalog developer API with automatic fallback.
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

### 1. Install & Build

```bash
git clone https://github.com/wintertaylorr/Prompt-Router.git
cd Prompt-Router
npm install
npm run build
```

### 2. Configure Environment

Copy `.env.example` to `.env` or configure keys directly in the web dashboard:

```env
PORT=4000
HOST=0.0.0.0
TYPESAFE_API_KEY=your_typesafe_key      # https://typesafe.ai
MAMMOUTH_API_KEY=your_mammouth_key      # https://mammouth.ai
OPENROUTER_API_KEY=your_openrouter_key  # https://openrouter.ai
ROUTING_STRATEGY=cost_optimized
DEFAULT_PROVIDER=mammouth
```

### 3. Start Prompt-Router

```bash
# Development mode with live reload
npm run dev

# Or Production mode
npm start
```

Visit the optics dashboard at **`http://localhost:4000/`**.


---

## 🔌 Connecting Developer Tools

Point any tool using OpenAI-compatible configuration to `http://localhost:4000/v1`:

### 1. Goose AI Agent
In your `~/.config/goose/config.yaml` or terminal environment:
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

