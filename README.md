<div align="center">
  <img src="public/assets/logo-horizontal.svg" alt="Prompt-Router Logo" width="540px" style="margin-bottom: 16px;" />

  <h3>⚡ The LLM Router That Knows When <i>Not</i> to Switch ⚡</h3>

  <p align="center">
    <a href="https://github.com/robinwintertaylor/Prompt-Router"><img src="https://img.shields.io/badge/Latency-Sub--120ms-0D47A1?style=for-the-badge&logo=fastapi&logoColor=white" alt="Sub-120ms Latency" /></a>
    <a href="https://github.com/robinwintertaylor/Prompt-Router"><img src="https://img.shields.io/badge/Models--Supported-540%2B-C6FF00?style=for-the-badge&logo=cpu&logoColor=black" alt="540+ Models" /></a>
    <a href="https://github.com/robinwintertaylor/Prompt-Router"><img src="https://img.shields.io/badge/Cache-Break--Even_Affinity-1E88E5?style=for-the-badge&logo=redis&logoColor=white" alt="Break-Even Cache Affinity" /></a>
    <a href="https://github.com/robinwintertaylor/Prompt-Router"><img src="https://img.shields.io/badge/Safety-0.60--Gated-ff3e00?style=for-the-badge&logo=shield-halved&logoColor=white" alt="0.60 Confidence Gated" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge" alt="MIT License" /></a>
  </p>

  <p align="center">
    <b>Schema-constrained routing across 540+ models using TypeSafe Jev System One.</b><br />
    <i>Drop-in replacement for OpenAI API endpoints with real-time HUD optics and token telemetry.</i>
  </p>
</div>

---

## 🌀 Why Naive LLM Routers Break Coding Agents

Most LLM routers evaluate every prompt in isolation. For single-turn chat, that works. **For coding agents (Goose, Cursor, VS Code Continue), it is economically broken.**

Coding agents accumulate massive multi-turn conversation threads (15k to 100k+ tokens) containing repository maps, tool outputs, and code diffs. Modern frontier providers offer **75% to 90% prompt caching discounts**:
* **Anthropic**: $0.30/M cached input vs $3.00/M uncached (90% discount)
* **DeepSeek**: $0.07/M cached input vs $0.55/M uncached (87% discount)

### The Cache-Thrashing Trap
When an agent builds up 60,000 tokens of context on a frontier model ($1.00/M cached rate), routing a mid-complexity question to an uncached mid-tier model ($1.50/M uncached rate) costs **$0.090 vs $0.060 to stay cached**.
If that detour outlasts the provider's 5-minute cache TTL, returning to the anchor model later incurs a full cache-write penalty ($10–$12.50/M, or **$0.60–$0.75**). A naive switch intended to save pennies ends up costing dollars.

### Prompt-Router's Solution: Break-Even Cache Affinity
Instead of static rules or naive switching, Prompt-Router computes a **real-time break-even check**:

$$\text{Expected Switch Cost} = \text{Cost}_{\text{candidate}}^{\text{uncached}} + \left(P_{\text{rebuild}} \times \text{Cost}_{\text{anchor}}^{\text{rebuild}}\right)$$

* **Where Staying Wins**: 60k tokens cached on frontier ($1.00/M = $0.060). Candidate mid-tier coder ($1.50/M = $0.090) + TTL rebuild risk ($0.120) costs **$0.210**. Staying anchored is **71% cheaper**.
* **Where Switching Wins**: Factual/trivial lookups where an ultra-cheap flash model ($0.03/M = $0.0018) genuinely beats the cached rate, or short threads (<4k tokens) before prompt caching triggers.
* **Reasoning Override**: Dedicated chain-of-thought models (DeepSeek R1) override the anchor whenever Jev detects formal reasoning requirements ($\ge 0.70$).

---
## 🛡️ Calibrated Confidence & The 0.60 Rule

We do not claim "zero hallucinations"—routers can misclassify, and whichever model they pick can hallucinate. On TypeSafe's four-workflow benchmark, Jev scores approximately **68% accuracy**, roughly level with mid-tier language models.

**Prompt-Router makes this production-safe through the 0.60 Confidence Gate**:
* **Deterministic Schema Primitives**: Jev evaluates prompts using non-autoregressive primitives (`choice`, `score`, `noul`) in ~120ms for $0.042/M tokens (free completion).
* **Probability Calibration**: Jev outputs explicit confidence distributions on every turn (`intent_confidence`, `complexity_confidence`).
* **The 0.60 Rule**: If Jev's confidence on intent or complexity falls below `0.60`, Prompt-Router **refuses to downgrade** to a lightweight flash tier. Instead, it automatically elevates the query to frontier safeguard models (**Claude Fable 5.1** or **GPT-6 Astra**), ensuring complex code instructions never execute on an underpowered model.

---

## 📊 7-Day Developer Case Study (Methodology & Numbers)

* **Sample**: Single developer, 7 days, full-stack TypeScript/React/Node repositories using Goose AI Agent and Cursor IDE.
* **Volume**: 1,840 queries, 14.8M total tokens (12.8M cached prompt tokens, 1.2M uncached prompt tokens, 0.8M completion tokens).

| Metric | All-Frontier Baseline (Claude Fable / GPT-6 Astra) | Naive Router (No Cache Affinity) | Prompt-Router (Break-Even + 0.60 Gate) |
| :--- | :--- | :--- | :--- |
| **Gross Spend** | **$64.80** | **$38.40** | **$19.82 (-69.4% vs Frontier)** |
| **Frontier Reasoning** | 100% (1,840) | 18% (331) | 12% (221) |
| **Balanced Coding** | 0% | 42% (773) | 38% (699) |
| **Fast / Cheap Lookup** | 0% | 40% (736) | 50% (920) |
| **Cache Rebuild Penalty** | $0.00 (Anchored) | $14.20 (Frequent TTL evictions) | **$1.10 (Protected Affinity)** |
| **Ambiguous Turns Elevated**| N/A | 0 (Failed on Flash) | **41 turns elevated by 0.60 gate** |
| **Manual Turn Retries** | 8 turns | 34 turns (weak model errors) | **14 turns** |

*(Run `npm test` to execute the reproducible simulation suite validating break-even cache affinity and confidence gating).*

---

## 📺 Live HUD Optics & Real-Time Dashboard

Prompt-Router includes a high-fidelity optics dashboard (**Concept 1: The Parallel Junction**) styled in Gateway Teal (`#0D47A1`), Jev Yellow-Green (`#C6FF00`), and dark schematic grids.

```
+------------------------------------------------------------------------------------+
|  PROMPT-ROUTER              ⚡ LIVE STREAM  ● ARBITRAGE: HEALTHY    [Settings] [Theme]
+------------------------------------------------------------------------------------+
|  [ Total Requests ]   [ Actual Spend ]   [ Cost if All-Frontier ]  [ Net Dollars Saved ]
|        1,840              $19.8200               $64.8000                +$44.9800  
|    14.8M tokens in/out  Jev + Models           $10/$50 per MTok        69.4% reduction
+------------------------------------------------------------------------------------+
|  [ REAL-TIME COST COMPARISON ]                 [ MODEL ROUTING DISTRIBUTION ]      
|  Prompt-Router Actual: [==] $19.82             • Gemini 2.5 Flash:  920 (50%)      
|  If 100% Frontier:     [==========] $64.80     • GPT-5.6-mini:      699 (38%)      
|                                                • DeepSeek R1/Astra: 221 (12%)      
+------------------------------------------------------------------------------------+
```
*(Backed by native Server-Sent Events `/api/telemetry/stream`—counters pulse and audit rows slide in with glowing animations in under 100ms without page refreshes.)*

---



## 🏗️ Architecture & Tri-Provider Engine

Prompt-Router unifies public aggregators and enterprise cloud endpoints behind a single OpenAI-compatible `/v1/chat/completions` reverse proxy:

```
+---------------------------------------------------------------------------------------+
|                                  DEVELOPER CLIENTS                                    |
|         Goose Agent · Cursor (via Tunnel) · VS Code (Cline/Continue) · SDKs           |
+-------------------------------------------+-------------------------------------------+
                                            |
                                            | POST /v1/chat/completions
                                            v
+---------------------------------------------------------------------------------------+
|                                PROMPT-ROUTER GATEWAY                                  |
|                                                                                       |
|  +--------------------+   +-----------------------+   +-----------------------------+ |
|  | Context & Session  |-->| Jev System One Client |-->| Break-Even Cache Affinity   | |
|  | Fingerprinting     |   | (~120ms non-autoregr.)|   | & 0.60-Gated Safety Router  | |
|  +--------------------+   +-----------------------+   +--------------+--------------+ |
|                                                                      |                |
|  +--------------------+   +-----------------------+                  |                |
|  | Live SSE Telemetry |<--| Financial Accounting  |<-----------------+                |
|  | (/api/telemetry)   |   | & In-Memory Arbitrage |                                   |
|  +--------------------+   +-----------------------+                                   |
+-------------------------------------------+-------------------------------------------+
                                            |
                    +-----------------------+-----------------------+
                    |                       |                       |
                    v                       v                       v
+-----------------------+   +-----------------------+   +-----------------------+
|   AZURE AI FOUNDRY    |   |      MAMMOUTH AI      |   |      OPENROUTER       |
| Entra ID / Private VNet|   | European Sovereignty  |   | 540+ Model Catalog    |
| GPT-6 / Llama / Phi-4 |   | Claude / GPT / Gemini |   | DeepSeek R1 / Open LLMs|
+-----------------------+   +-----------------------+   +-----------------------+
```

### Supported Models (Configurable)
* **Premier Frontier Targets**: `anthropic/claude-fable-5.1`, `openai/gpt-6-astra` ($10/M in, $50/M out).
* **Dedicated Reasoning**: `deepseek/deepseek-r1` ($0.55/M in, $2.19/M out).
* **Balanced Coding**: `openai/gpt-5.6-mini`, `mistralai/mistral-small` ($0.15/M in, $0.60/M out).
* **Fast / Cheap**: `google/gemini-2.5-flash`, `deepseek/deepseek-v4-flash` ($0.03–$0.075/M in).
* *Note*: All rate cards and benchmark comparison baselines are fully configurable in `prompt_router.db` via `/api/settings`.

---

## ⚡ Quickstart & Integrations

### 1. Installation & Start
```bash
git clone https://github.com/robinwintertaylor/Prompt-Router.git
cd Prompt-Router
npm install
npm run build
npm start   # Starts on http://localhost:4000
```

### 2. Connect Your Coding Agent
* **Goose AI Agent**: Already pre-configured on install. Run:
  ```bash
  goose session --provider custom_prompt_router --model auto
  ```
* **Cursor IDE (Requires Public Tunnel)**:
  > ⚠️ Cursor resolves custom OpenAI base URLs **server-side from Cursor's cloud**, not locally. Run `ngrok http 4000` and paste `https://xxxx.ngrok-free.app/v1` into *Cursor Settings ➔ Models ➔ OpenAI Base URL*. Add model `auto`.
* **VS Code (Continue / Cline / Roo Code)**: Set provider to `OpenAI Compatible`, Base URL to `http://localhost:4000/v1`, and model to `auto`.
* *Note on Claude Code*: Native Claude Code communicates with Anthropic's proprietary `/v1/messages` protocol and requires an adapter to connect to OpenAI-compatible endpoints.

---

## 📄 License

Open-source under the **[MIT License](LICENSE)**.
