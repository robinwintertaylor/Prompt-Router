# Providers & Models Specification

## 1. Dynamic Aggregator Model Synchronization

Prompt-Router unifies the catalogs of **Mammouth AI** and **OpenRouter** into a single synchronized repository (over 440+ live models).

**Key Architectural Principle**: **Jev decides the model, not the provider.**  
The router queries the live catalog from the aggregators on startup and periodically refreshes it. When an incoming request arrives, Jev evaluates the prompt's cognitive difficulty, intent, and reasoning needs. The router then identifies the optimal **model** from the actual catalog. Once the winning model is selected, the router dispatches it to whichever aggregator provides that model (Mammouth AI or OpenRouter), with transparent failover.

### A. Mammouth AI (`api.mammouth.ai`)
- **Base URL**: `https://api.mammouth.ai/v1`
- **Completions Endpoint**: `POST https://api.mammouth.ai/v1/chat/completions`
- **Models Endpoint**: `GET https://api.mammouth.ai/v1/models`
- **Authentication**: `Authorization: Bearer <MAMMOUTH_API_KEY>`
- **Description**: European flat-rate aggregator providing fast access to Claude 3.5/3.7, GPT-4o, Gemini 2.5, and DeepSeek R1 with GDPR compliance and zero model training on customer prompts.

### B. OpenRouter (`openrouter.ai`)
- **Base URL**: `https://openrouter.ai/api/v1`
- **Completions Endpoint**: `POST https://openrouter.ai/api/v1/chat/completions`
- **Models Endpoint**: `GET https://openrouter.ai/api/v1/models` (Returns 440+ models with real-time prompt & completion prices per token)
- **Authentication**: `Authorization: Bearer <OPENROUTER_API_KEY>`
- **Custom Headers**:
  - `HTTP-Referer`: Site URL
  - `X-OpenRouter-Title`: Site title ("Prompt-Router")

---

## 2. Dynamic Model Tiers in the Aggregated Catalog

When models are synced into the SQLite `models_catalog` table, they are classified into capability tiers:

| Catalog Tier | Description | Representative Synced Models |
| :--- | :--- | :--- |
| **`frontier_reasoning`** | Models with dedicated chain-of-thought, mathematical proofs, logic engines | `deepseek/deepseek-r1`, `openai/o1`, `openai/o3-mini`, `anthropic/claude-3.7-sonnet:thinking` |
| **`frontier_coding`** | Premier models for multi-file architecture, debugging, systems design | `anthropic/claude-3.5-sonnet`, `anthropic/claude-3.7-sonnet`, `openai/gpt-4o` |
| **`balanced`** | Fast, high-efficiency models for standard coding, single-file edits, data extraction | `openai/gpt-4o-mini`, `google/gemini-2.5-flash`, `mistralai/mistral-small` |
| **`fast_cheap`** | Ultra-low-cost models for simple greetings, definitions, and high-frequency lookups | `google/gemini-2.5-flash`, `deepseek/deepseek-v4-flash`, `meta-llama/llama-3.1-8b` |

---

## 3. Real-Time Financial Accounting Using Aggregator Rates

All reporting and ledger entries use the **real-time per-token rates provided directly by the model aggregators**, rather than hardcoded assumptions:

For every request $i$ with prompt tokens $T_{\text{in}}$ and completion tokens $T_{\text{out}}$:

### 1. Actual Cost
$$\text{Cost}_{\text{actual}} = \left(\frac{T_{\text{in}}^{\text{Jev}}}{10^6} \times 0.042\right) + \left(T_{\text{in}} \times \text{rate}_{\text{prompt}}^{\text{aggregator}} + T_{\text{out}} \times \text{rate}_{\text{completion}}^{\text{aggregator}}\right)$$

### 2. Benchmark Cost: All Claude 3.5 Sonnet
$$\text{Cost}_{\text{Claude}} = T_{\text{in}} \times \text{rate}_{\text{prompt}}^{\text{Claude}} + T_{\text{out}} \times \text{rate}_{\text{completion}}^{\text{Claude}}$$

### 3. Benchmark Cost: All OpenAI GPT-4o
$$\text{Cost}_{\text{GPT-4o}} = T_{\text{in}} \times \text{rate}_{\text{prompt}}^{\text{GPT-4o}} + T_{\text{out}} \times \text{rate}_{\text{completion}}^{\text{GPT-4o}}$$

### 4. Net Savings & Percentage Saved
$$\text{Savings}_{\text{vs Claude}} = \max(0, \text{Cost}_{\text{Claude}} - \text{Cost}_{\text{actual}})$$
$$\text{Percent Saved} = \frac{\sum \text{Savings}_{\text{vs Claude}}}{\sum \text{Cost}_{\text{Claude}}} \times 100\%$$

