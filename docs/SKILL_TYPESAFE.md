---
name: typesafe-ai
license: MIT
description: >
  Build AI-powered software with TypeSafe: small units of AI intelligence you
  can use like programming primitives. Its System One models, including Jev,
  turn natural language and application state into typed judgments and
  probabilities that code can combine. Use when a feature needs programmable
  common sense, when brainstorming what AI could make possible in an app, or
  when an LLM prompt-and-parse step could become a structured decision.
  Applications include routing, ranking, extraction, verification, and
  interactive experiences; these are starting points, not the limits.
  Read live docs and cookbooks to find useful patterns and discover new combinations.
---

# Build with TypeSafe

TypeSafe makes units of AI intelligence usable like programming primitives: small
judgments you can compose into larger capabilities. Its **System One models** return
fast, focused judgments that software can consume directly. **Jev** is TypeSafe's
flagship and first System One model. It understands natural language and returns
typed answers and probabilities rather
than generating text or reasoning explanations. Code owns the workflow; the model
supplies programmable common sense where ordinary code needs semantic understanding.

## Read the live docs

**The live TypeSafe docs are the source of truth. Read them as part of the task.**
This skill gives direction; the docs carry current concepts, prompting guidance,
API contracts, SDK usage, models, limits, and worked examples.

- Start with the [documentation index](https://docs.typesafe.ai/llms.txt) to discover
  relevant pages and cookbooks. Use targeted reads rather than loading the entire site.
- Mintlify serves Markdown by appending `.md` to a page path, for example
  [how to build with TypeSafe](https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md).
  Follow links from the index; convert extensionless documentation page links to
  `.md` when useful. Resolve relative links against `https://docs.typesafe.ai`.
- Before writing an integration, read the current API or chosen SDK page and the
  question guidance relevant to the design. For a new workflow, also inspect the
  closest cookbook: it often shows a better decomposition than a generic classifier.

| Task | Start here; follow the relevant details |
| --- | --- |
| Understand the programming model | [System One](https://docs.typesafe.ai/concepts/system-one.md), [building guide](https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md) |
| Explore what to build | [Use-case map](https://docs.typesafe.ai/concepts/use-case-map.md), then relevant cookbooks from the index |
| Prepare inputs and questions | [State](https://docs.typesafe.ai/concepts/state.md), [primitives](https://docs.typesafe.ai/primitives.md), then the chosen primitive's page |
| Decide how to handle uncertainty | [Confidence](https://docs.typesafe.ai/confidence.md) |
| Write API code | [HTTP API](https://docs.typesafe.ai/api.md), [Python SDK](https://docs.typesafe.ai/sdk/python.md), or [JavaScript SDK](https://docs.typesafe.ai/sdk/javascript.md) |
| Update an older integration | [Migration guide](https://docs.typesafe.ai/migrating-to-v1.md) and the installed SDK's current reference |

## Core Patterns

- **Route and fill known arguments:** Request selects handler and typed parameters. Ask useful branch-specific questions up front and consume only the relevant answers ([speculative fan-out](https://docs.typesafe.ai/patterns/fan-out.md)).
- **Uncertainty Bands on Nouls:** Turn probabilities from `0.30` through `0.70` into a bounded uncertainty window, resolving with code policy or score tie-breakers ([consistency cookbook](https://docs.typesafe.ai/cookbooks/consistency_noul_cookbook.md)).
- **Composite scoring:** Score dimensions once, then let code or user controls change weights, thresholds, rankings, and views ([composite scoring](https://docs.typesafe.ai/patterns/composite-scoring.md)).
