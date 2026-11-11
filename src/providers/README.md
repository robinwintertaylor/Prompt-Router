# Prompt-Router Providers

## Overview
Outbound LLM dispatch adapters for direct vendor APIs, multi-model aggregators, and subscription-backed CLI agent bridges. Resolves vendor-specific model identifiers, handles auth validation, executes streaming and non-streaming HTTP requests, and bridges local Agent Client Protocol (ACP) CLI subprocesses.

## Interface
- `callDirectAnthropic(body: any, stream?: boolean): Promise<DirectAnthropicResponse>` `[src/providers/direct_anthropic.ts:callDirectAnthropic]` - Executes direct requests to Anthropic Messages API and normalizes responses into OpenAI format.
- `DirectAnthropicResponse` `[src/providers/direct_anthropic.ts:DirectAnthropicResponse]` - Response contract containing status, data, stream, and provider tag `'anthropic'`.
- `callDirectOpenAICompatible(vendor: 'openai' | 'mistral' | 'deepseek' | 'google' | 'nvidia', body: any, stream?: boolean): Promise<DirectOpenAIResponse>` `[src/providers/direct_openai.ts:callDirectOpenAICompatible]` - Dispatches requests directly to OpenAI, Mistral, DeepSeek, Google Gemini, or NVIDIA NIM endpoints.
- `DirectOpenAIResponse` `[src/providers/direct_openai.ts:DirectOpenAIResponse]` - Response contract containing status, data, stream, and vendor tag.
- `callMammouth(body: any, stream?: boolean): Promise<ProviderResponse>` `[src/providers/mammouth.ts:callMammouth]` - Forwards chat completions to the Mammouth AI aggregator.
- `mapToMammouthModel(model: string): string` `[src/providers/mammouth.ts:mapToMammouthModel]` - Maps generic or competitor model names to supported Mammouth model slugs.
- `callOpenRouter(body: any, stream?: boolean): Promise<OpenRouterResponse>` `[src/providers/openrouter.ts:callOpenRouter]` - Dispatches chat completions to the OpenRouter aggregator.
- `mapToOpenRouterModel(model: string): string` `[src/providers/openrouter.ts:mapToOpenRouterModel]` - Normalizes shorthand model slugs into OpenRouter namespaced IDs.
- `callAcpBridge(subId: AcpSubscriptionId, body: any, stream?: boolean): Promise<AcpBridgeResponse>` `[src/providers/acp_bridge.ts:callAcpBridge]` - Spawns local CLI subprocesses (`claude`, `codex`, `vibe`, `gemini`) to execute completions against active user subscriptions without per-token charges.
- `createStreamFromText(model: string, text: string): Readable` `[src/providers/acp_bridge.ts:createStreamFromText]` - Adapts non-streaming string output into an OpenAI-compatible SSE chunk stream.
- `AcpSubscriptionId` `[src/providers/acp_bridge.ts:AcpSubscriptionId]` - Union type representing supported subscription identifiers (`'claude_subscription' | 'codex_subscription' | 'gemini_free' | 'mistral_vibe' | 'gemini_cli'`).
- `AcpBridgeResponse` `[src/providers/acp_bridge.ts:AcpBridgeResponse]` - Result object with execution status, payload/stream, provider tag, quota exhaustion flags, and token counts.

## Invariants
- `[src/providers/direct_anthropic.ts:apiKey]` Returns status `401` if `ANTHROPIC_API_KEY` is not set or empty.
- `[src/providers/direct_openai.ts:apiKey]` Returns status `401` if the vendor-specific API key (`OPENAI_API_KEY`, `MISTRAL_API_KEY`, `DEEPSEEK_API_KEY`, `GEMINI_API_KEY`, `NVIDIA_API_KEY`) is not configured.
- `[src/providers/mammouth.ts:apiKey]` Returns status `401` if `MAMMOUTH_API_KEY` is not configured.
- `[src/providers/openrouter.ts:apiKey]` Returns status `401` if `OPENROUTER_API_KEY` is not configured.
- `[src/providers/openrouter.ts:forwardBody.max_tokens]` Enforces default `max_tokens = 4096` when both `max_tokens` and `max_completion_tokens` are omitted to prevent OpenRouter 402 insufficient credits rejections.
- `[src/providers/acp_bridge.ts:sub.enabled]` Returns status `403` if the target subscription is disabled.
- `[src/providers/acp_bridge.ts:sub.quota_remaining_pct]` Returns status `429` with reset time if quota remaining is `<= 0`.
- `[src/providers/acp_bridge.ts:timeout]` Enforces a 45-second execution timeout before terminating unresponsive CLI subprocesses.

## Side Effects
- `[src/providers/direct_anthropic.ts:fetch]` Outbound HTTPS POST requests to `https://api.anthropic.com/v1/messages`.
- `[src/providers/direct_openai.ts:fetch]` Outbound HTTPS POST requests to vendor completion endpoints.
- `[src/providers/mammouth.ts:fetch]` Outbound HTTPS POST requests to `https://api.mammouth.ai/v1/chat/completions`.
- `[src/providers/openrouter.ts:fetch]` Outbound HTTPS POST requests to `https://openrouter.ai/api/v1/chat/completions`.
- `[src/providers/acp_bridge.ts:spawn]` Spawns OS child processes via stdin/stdout pipes; writes prompt via stdin; mutates SQLite records via `recordSubscriptionUsage` and `updateSubscription`.

## Verification
- Run: `npm test`
