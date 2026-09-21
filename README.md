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
- **Optics & Cost Comparison Dashboard**:
  - Live token metrics (prompt tokens in, completion tokens out).
  - Actual expenditure vs. hypothetical costs if **100% of queries went to Claude 3.5 Sonnet** or **100% to OpenAI GPT-4o**.
  - Net dollars saved and percentage cost reduction in real-time.
  - Interactive prompt simulator playground.

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

## 🧪 Testing

Run the automated test suite:
```bash
npm run test
```
All tests verify database initialization, Jev decision flow, model selection, and SQLite metrics aggregation.

