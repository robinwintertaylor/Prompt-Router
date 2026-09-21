# Providers & Models Specification

## 1. Downstream Providers

### A. Mammouth AI (`api.mammouth.ai`)
- **Base URL**: `https://api.mammouth.ai/v1`
- **Completions Endpoint**: `POST https://api.mammouth.ai/v1/chat/completions`
- **Authentication**: `Authorization: Bearer <MAMMOUTH_API_KEY>`
- **Description**: European flat-rate provider offering cost-effective access to tier-1 models with GDPR compliance and zero model training on customer prompts.
- **Model Translation**:
  - `anthropic/claude-3.5-sonnet` ➔ `claude-3-5-sonnet-20241022`
  - `openai/gpt-4o` ➔ `gpt-4o`
  - `openai/gpt-4o-mini` ➔ `gpt-4o-mini`
  - `deepseek/deepseek-r1` ➔ `deepseek-reasoner`
  - `deepseek/deepseek-chat` ➔ `deepseek-chat`
  - `google/gemini-2.5-flash` ➔ `gemini-2.0-flash`
  - `google/gemini-2.5-pro` ➔ `gemini-1.5-pro`

### B. OpenRouter (`openrouter.ai`)
- **Base URL**: `https://openrouter.ai/api/v1`
- **Completions Endpoint**: `POST https://openrouter.ai/api/v1/chat/completions`
- **Authentication**: `Authorization: Bearer <OPENROUTER_API_KEY>`
- **Custom Headers**:
  - `HTTP-Referer`: Site URL (for leaderboard analytics)
  - `X-OpenRouter-Title`: Site title ("Prompt-Router")
- **Description**: Multi-catalog developer API with support for hundreds of models, pay-as-you-go billing, and provider fallback redundancy.

---

## 2. Model Pricing Matrix (Per Million Tokens)

| Model Name | Input Price / MTok | Output Price / MTok | Role in Prompt-Router |
| :--- | :--- | :--- | :--- |
| **TypeSafe Jev** | **$0.042** | **$0.00** | System One Decision Evaluator |
| **Google Gemini 2.5 Flash** | $0.10 | $0.40 | Ultra-fast / Low-complexity / Greetings |
| **OpenAI GPT-4o-mini** | $0.15 | $0.60 | Standard Coding & Extraction Tasks |
| **DeepSeek R1** | $0.55 | $2.19 | Frontier Reasoning / Logic Puzzles |
| **DeepSeek V3 (Chat)** | $0.14 | $0.28 | Cost-effective conversational tasks |
| **Mistral Small** | $0.20 | $0.60 | Efficient European fallback |
| **Anthropic Claude 3.5 Sonnet** | $3.00 | $15.00 | Complex Multi-File Architecture (Benchmark) |
| **OpenAI GPT-4o** | $2.50 | $10.00 | Complex Systems & Reasoning (Benchmark) |

---

## 3. Financial Optics Calculation

For every request $i$ with prompt tokens $T_{\text{in}}$ and completion tokens $T_{\text{out}}$:

### 1. Actual Cost
$$\text{Cost}_{\text{actual}} = \left(\frac{T_{\text{in}}^{\text{Jev}}}{10^6} \times 0.042\right) + \left(\frac{T_{\text{in}}}{10^6} \times P_{\text{in}}^{\text{model}} + \frac{T_{\text{out}}}{10^6} \times P_{\text{out}}^{\text{model}}\right)$$

### 2. Benchmark Cost: All Claude 3.5 Sonnet
$$\text{Cost}_{\text{Claude}} = \left(\frac{T_{\text{in}}}{10^6} \times 3.00\right) + \left(\frac{T_{\text{out}}}{10^6} \times 15.00\right)$$

### 3. Benchmark Cost: All OpenAI GPT-4o
$$\text{Cost}_{\text{GPT-4o}} = \left(\frac{T_{\text{in}}}{10^6} \times 2.50\right) + \left(\frac{T_{\text{out}}}{10^6} \times 10.00\right)$$

### 4. Net Savings & Percentage Saved
$$\text{Savings}_{\text{vs Claude}} = \max(0, \text{Cost}_{\text{Claude}} - \text{Cost}_{\text{actual}})$$
$$\text{Percent Saved} = \frac{\sum \text{Savings}_{\text{vs Claude}}}{\sum \text{Cost}_{\text{Claude}}} \times 100\%$$
