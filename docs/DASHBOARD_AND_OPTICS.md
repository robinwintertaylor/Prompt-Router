# Dashboard & Optics Guide

The Prompt-Router web interface provides real-time visibility into token flow, routing decisions, provider performance, and cost comparisons.

The dashboard is accessible at:
```
http://localhost:4000/
```

---

## 1. Dashboard Overview

```
+------------------------------------------------------------------------------------+
|  PROMPT-ROUTER                          Gateway Active (Port 4000)  [Settings] [Refresh]
+------------------------------------------------------------------------------------+
|                                                                                    |
|  [ Total Requests ]   [ Actual Spend ]   [ Cost if Claude ]   [ Net Dollars Saved ]|
|        1,420              $3.2450             $28.4010              +$25.1560      |
|    1.8M tokens in/out    Jev + Model        $3/$15 per MTok       88% reduction    |
|                                                                                    |
+------------------------------------------------------------------------------------+
|  [ COST COMPARISON BREAKDOWN ]                 [ MODEL ROUTING DISTRIBUTION ]      |
|  Prompt-Router Actual: [==] $3.2450            • Gemini 2.5 Flash:  820 (58%)      |
|  If 100% Claude 3.5:   [==========] $28.4010   • GPT-4o-mini:       410 (29%)      |
|  If 100% GPT-4o:       [========] $19.1200     • Claude 3.5 Sonnet: 140 (10%)      |
|                                                • DeepSeek R1:        50 (3%)       |
+------------------------------------------------------------------------------------+
|  [ INTERACTIVE PROMPT ROUTE SIMULATOR ]                                            |
|  [ Enter prompt text...                                                   ] [Test] |
|  Quick Presets: [Greeting] [Simple Code] [Complex Code] [Deep Reasoning]          |
+------------------------------------------------------------------------------------+
|  [ LIVE REQUEST OPTICS & AUDIT TRAIL ]                                [Filter... ] |
|  Time     Client       Prompt          Jev Decision     Routed Model       Savings |
|  09:22:15 cursor       Architect micro Complex (4.2/5)  claude-3.5-sonnet  $0.0000 |
|  09:22:04 goose        Write email reg Simple (2.5/5)   gpt-4o-mini        +$0.012 |
|  09:21:40 claude-code  Hello there     Prose (1.0/5)    gemini-2.5-flash   +$0.008 |
+------------------------------------------------------------------------------------+
```

---

## 2. Key Optics Panels

### A. Metrics Summary Cards
- **Total Requests**: Count of queries processed across all client applications.
- **Total In/Out Tokens**: Exact token breakdown monitored across requests.
- **Actual Total Spend**: Combined cost of TypeSafe Jev evaluations ($0.042/M tokens) plus downstream model consumption.
- **Benchmark Costs**: Counterfactual expenditure if all requests were sent exclusively to Claude 3.5 Sonnet or OpenAI GPT-4o.
- **Net Dollars Saved**: Live dollar amount and percentage cost reduction.
- **Avg Jev Routing Latency**: Average speed of Jev non-autoregressive decision pass (~120ms).

### B. Visual Cost Comparison Bars
- Dynamic animated progress bars comparing actual spend against Claude 3.5 Sonnet and GPT-4o baselines.

### C. Model Distribution Breakdown
- Categorical distribution showing the proportion of traffic assigned to each model (Flash, Mini, Sonnet, DeepSeek R1) with associated token and dollar metrics.

### D. Interactive Route Simulator (Playground)
- Enables testing any prompt directly in the browser.
- Displays Jev's parallel outputs in real time:
  - Intent category & calibrated confidence percentage.
  - Cognitive complexity score (1.0 to 5.0).
  - Chain-of-thought reasoner probability ($0$ to $100\%$).
  - Target model selection and the specific rule that triggered it.
  - Calculated cost estimate and expected savings.

### E. Live Request Audit Trail
- Filterable table displaying every query processed:
  - Client application badge (`goose`, `cursor`, `claude-code`, `vscode`, `anti-gravity`).
  - Extracted prompt snippet.
  - Intent classification badge & complexity score.
  - Upstream provider utilized (`mammouth` or `openrouter`).
  - Exact token counts and net dollar savings.


### F. Aggregator Models Catalog Browser
- View over 440+ live models synchronized from OpenRouter and Mammouth AI.
- Filter by capability tier (`frontier_reasoning`, `frontier_coding`, `balanced`, `fast_cheap`).
- Inspect real-time prompt and completion rates per million tokens.
- On-demand "Sync Live Rates" button to update models and pricing directly from aggregator endpoints.

---

## 3. Configuration & Settings Modal

Clicking the **Settings** button in the header opens a management modal:
- **TypeSafe Jev API Key**: Key for System One decision evaluations (or blank for internal heuristic fallback).
- **Mammouth AI API Key**: Primary flat-rate subscription LLM key.
- **OpenRouter API Key**: Secondary multi-provider API key.
- **Routing Strategy**:
  - `cost_optimized`: Routes aggressively to cheap models (Flash/Mini) and DeepSeek R1 for reasoning to maximize savings.
  - `performance_optimized`: Routes coding tasks to Claude 3.5 Sonnet and complex tasks to GPT-4o.
  - `balanced`: Equilibrates quality, speed, and budget.
- **Preferred Provider**: Mammouth vs OpenRouter.
All settings persist immediately to `prompt_router.db`.
