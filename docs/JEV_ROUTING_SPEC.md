# Jev System One Routing Specification

## 1. What is Jev?

Jev is TypeSafe AI's flagship **System One model** released in September 2026. Designed by OpenAI co-founder Diogo Almeida, it abandons autoregressive natural language text generation in favor of fast, structured, non-hallucinatory decisions.

### Key Characteristics:
- **Endpoint**: `POST https://api.typesafe.ai/v1/systemone`
- **Model Identifier**: `jev-latest` (versioned alias pointing to `jev-1.13.0`)
- **Latency**: 70ms to 150ms per evaluation
- **Pricing**: $0.042 per million input tokens ($42 per billion tokens); output tokens are free by design
- **Zero Hallucination**: Outputs are strictly constrained to pre-defined primitives and schema structures
- **Parallel Sampler**: Evaluates multiple questions over a shared state simultaneously in a single forward pass

---

## 2. Jev Questions Schema in Prompt-Router

When a request arrives at the router, the prompt state is packaged into the following System One questions payload:

```json
{
  "model": "jev-latest",
  "state": "<EXTRACTED_SYSTEM_AND_USER_PROMPT>",
  "questions": {
    "intent": {
      "type": "choice",
      "instructions": "Classify the primary task type of the user request",
      "criteria": {
        "coding_complex": "Multi-file architecture, tricky debugging, deep algorithm design, refactoring large codebase",
        "coding_simple": "Single-function edits, boilerplate, basic scripts, CSS/HTML adjustments, minor bug fixes",
        "deep_reasoning": "Intricate logical puzzles, math proofs, multi-step formal planning, rigorous analysis",
        "factual_lookup": "Documentation lookup, definitions, simple questions, quick fact retrieval",
        "creative_prose": "Creative writing, conversational chat, brainstorming ideas, casual banter",
        "structured_extraction": "JSON data formatting, schema extraction, table restructuring, summarization"
      }
    },
    "complexity": {
      "type": "score",
      "instructions": "Rate the cognitive difficulty and model capability required",
      "criteria": [
        "Level 1: Trivial greeting or minor factual lookup",
        "Level 2: Standard task with low cognitive load",
        "Level 3: Moderate complexity requiring solid coding or logical reasoning",
        "Level 4: High complexity requiring advanced domain expertise or deep debugging",
        "Level 5: Frontier complexity, intricate architecture, or cutting-edge reasoning"
      ]
    },
    "needs_reasoner": {
      "type": "noul",
      "instructions": "Does this request specifically require an extended chain-of-thought reasoning model like o1, o3, or DeepSeek R1?"
    }
  }
}
```


### Official SDK Implementation (`@typesafe-ai/sdk`)

Prompt-Router directly utilizes the official `@typesafe-ai/sdk` methods as verified in the [Jev API Guide](https://jevplayground.com/jev-api):

```typescript
import { TypeSafeClient, choice, score, noul } from '@typesafe-ai/sdk';

const client = new TypeSafeClient({
  apiKey: process.env.TYPESAFE_API_KEY,
  timeout: 1500
});

const response = await client.systemOne({
  state: stateText,
  questions: {
    intent: choice('Classify the primary task type of the user request', { ... }),
    complexity: score('Rate the cognitive difficulty and model capability required', [ ... ]),
    needs_reasoner: noul('Does this request specifically require an extended chain-of-thought reasoning model like o1, o3, or DeepSeek R1?')
  }
});

// Calibrated responses returned in 70-150ms:
// response.answers.intent.choice -> string
// response.answers.intent.confidence -> 0.0 to 1.0
// response.answers.complexity.score -> float (e.g. 3.8)
// response.answers.needs_reasoner.noul -> float (e.g. 0.85)
// response.usage.input_tokens -> number
```

---

## 3. Decision Matrix & Routing Thresholds

The router maps Jev's parallel outputs to downstream models using these rules:

| Condition | Strategy: Cost-Optimized | Strategy: Performance-Optimized |
| :--- | :--- | :--- |
| **Needs Reasoner ($P > 0.65$) OR Complexity $\ge 4.5$** | `deepseek/deepseek-r1` (Unmatched reasoning at 1/5th cost) | `anthropic/claude-3.5-sonnet` (Frontier quality) |
| **Intent = `coding_complex` OR Complexity $\ge 3.6$** | `anthropic/claude-3.5-sonnet` | `anthropic/claude-3.5-sonnet` |
| **Intent $\in$ [`coding_simple`, `structured_extraction`] OR Complexity $\ge 2.6$** | `openai/gpt-4o-mini` | `openai/gpt-4o-mini` |
| **Complexity $< 2.6$ (Greetings, Lookups, Casual Chat)** | `google/gemini-2.5-flash` | `google/gemini-2.5-flash` |

---

## 4. Heuristic Fallback Engine

If the TypeSafe API is unavailable, network connectivity drops, or `TYPESAFE_API_KEY` is not supplied, the router falls back to an internal heuristic classifier that runs in $< 1\text{ms}$:
- Detects complex architectural keywords (`architect`, `microservices`, `event-driven`, `kafka`, `consensus`, `concurrency`, `refactor`).
- Detects standard coding constructs (`function`, `class`, `import`, `def`, code blocks).
- Detects mathematical or reasoning prompts (`prove`, `theorem`, `puzzle`, `logic`, `calculate`).
- Detects simple greetings and factual queries.
This guarantees 100% gateway uptime under all conditions.

---

## 5. Multi-Turn State Sampling & Cache Affinity Rules

### A. Sub-Linear Context Sampling
In traditional LLM setups, feeding an entire 80,000-token conversation to an evaluator adds massive latency ($1\text{s} - 3\text{s}$) and substantial cost.

Prompt-Router addresses this by decoupling **Jev classification state** from **downstream model context**:
- **Downstream Models**: Receive the complete `messages` array with full conversational context, tool calls, and file attachments.
- **Jev Evaluator**: Receives a normalized context snapshot (`extractStateFromMessages`):
  1. The system prompt (operational constraints and developer instructions).
  2. The active user query (`promptPreview`).
  3. The last 5 conversational turns (`messages.slice(-5)`) to discern intent trajectory.
- **Result**: Jev evaluation consumes only 300 to 800 tokens per evaluation, costing a negligible **$0.00001 to $0.00003**, regardless of whether the developer has 5,000 or 150,000 tokens of repository context in the conversation.

### B. Dynamic Routing vs. Anchor Continuity Matrix
| Context Scale | Jev Intent & Score | Routing Action | Economic Rationale |
| :--- | :--- | :--- | :--- |
| **$< 12{,}000$ tokens** | Any | Dynamic Model Selection | Context is small; cache eviction penalty is negligible ($< \$0.003$). Maximize model specialization. |
| **$\ge 12{,}000$ tokens** | Standard coding, chat, lookup | **Sticky Anchor Affinity** | Preserves 75%–90% KV prompt cache discount on anchor model ($0.30/M vs $3.00/M). Prevents cache-thrashing penalty. |
| **$\ge 12{,}000$ tokens** | $\text{needs\_reasoner} \ge 0.70$ | **Hysteresis Override $\rightarrow$ DeepSeek R1** | The task requires extended chain-of-thought mathematical proof or formal logic; model capability outweighs cache retention. |

