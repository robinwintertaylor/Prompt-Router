import { Request, Response } from 'express';
import crypto from 'crypto';
import { evaluateWithJev, extractStateFromMessages } from '../jev.js';
import { executeRoutedCompletion } from '../router.js';
import { calculateCosts } from '../pricing.js';
import { logRequest } from '../db.js';
import { broadcastTelemetry } from '../telemetry.js';
import { getFormattedMetrics } from './api.js';

function recordAndBroadcastRequest(entry: any) {
  logRequest(entry);
  try {
    broadcastTelemetry('request_completed', {
      log: {
        ...entry,
        timestamp: new Date().toISOString()
      },
      metrics: getFormattedMetrics()
    });
  } catch (err) {
    console.warn('[Telemetry] Non-blocking warning: failed to broadcast telemetry update:', err);
  }
}

export function detectClientAgent(req: Request): string {
  const ua = String(req.headers['user-agent'] || '').toLowerCase();
  const title = String(req.headers['x-openrouter-title'] || '').toLowerCase();

  if (ua.includes('goose') || title.includes('goose')) return 'goose';
  if (ua.includes('claude-code') || ua.includes('claudecode') || title.includes('claude')) return 'claude-code';
  if (ua.includes('cursor')) return 'cursor';
  if (ua.includes('vscode') || ua.includes('code/')) return 'vscode';
  if (ua.includes('antigravity') || ua.includes('anti-gravity')) return 'anti-gravity';
  if (ua.includes('python')) return 'python-sdk';
  if (ua.includes('node') || ua.includes('axios')) return 'node-client';

  // Body context inspection for agent fingerprinting
  const bodyStr = JSON.stringify(req.body || '').toLowerCase();
  if (bodyStr.includes('<turn-context>') || bodyStr.includes('goose') || ua.includes('reqwest')) return 'goose';
  if (bodyStr.includes('cursor_context') || bodyStr.includes('.cursor')) return 'cursor';

  return 'general-client';
}
export function extractSessionId(req: Request, messages: any[]): string {
  const headerId = req.headers['x-session-id'] || req.headers['session-id'] || req.headers['conversation-id'];
  if (typeof headerId === 'string' && headerId.trim()) return headerId.trim();

  if (Array.isArray(messages) && messages.length > 0) {
    // Generate root conversation hash from first user message and system message
    const firstUser = messages.find(m => m.role === 'user');
    const systemMsg = messages.find(m => m.role === 'system');
    const firstUserText = typeof firstUser?.content === 'string'
      ? firstUser.content
      : JSON.stringify(firstUser?.content || '');
    const systemText = typeof systemMsg?.content === 'string'
      ? systemMsg.content
      : JSON.stringify(systemMsg?.content || '');

    const seed = `${systemText}|${firstUserText}`;
    if (seed.length > 10) {
      return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16);
    }
  }
  return '';
}


export async function handleChatCompletions(req: Request, res: Response) {
  const startTime = Date.now();
  const requestId = 'pr-' + crypto.randomUUID();
  const clientAgent = detectClientAgent(req);
  const requestedModel = req.body.model || 'auto';
  const isStream = !!req.body.stream;

  const { promptPreview, stateText } = extractStateFromMessages(req.body.messages || []);
  const contextTokens = Math.ceil(JSON.stringify(req.body.messages || []).length / 4);
  const sessionId = extractSessionId(req, req.body.messages || []);

  // 1. Evaluate with TypeSafe Jev System One
  const jev = await evaluateWithJev(req.body.messages || []);

  // 2. Select optimal model & target provider (with Session Cache Affinity)
  const { providerResponse, selectedModel, selectedProvider, routingReason } =
    await executeRoutedCompletion(req.body, jev, isStream, sessionId, contextTokens);

  // If both providers are unconfigured / failed
  if (!providerResponse.ok) {
    if (providerResponse.status === 401) {
      return handleUnconfiguredMockStream(
        req, res, isStream, requestId, selectedModel, selectedProvider, jev, promptPreview, startTime, clientAgent, requestedModel
      );
    }
    return res.status(providerResponse.status || 502).json({
      error: {
        message: providerResponse.error || 'Failed to reach upstream LLM provider',
        type: 'router_provider_error',
        code: providerResponse.status
      }
    });
  }

  // 3. Handle Streaming response
  if (isStream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    let promptTokens = Math.ceil(stateText.length / 4);
    let completionTokens = 0;

    try {
      const stream = providerResponse.stream;
      const reader = stream.getReader ? stream.getReader() : null;

      if (reader) {
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunkStr = decoder.decode(value, { stream: true });
          if (res.writable && !res.writableEnded) {
            res.write(chunkStr);
          }

          if (chunkStr.includes('"usage":')) {
            try {
              const lines = chunkStr.split('\n');
              for (const line of lines) {
                if (line.startsWith('data: ') && line.includes('"usage"')) {
                  const parsed = JSON.parse(line.slice(6));
                  if (parsed.usage) {
                    promptTokens = parsed.usage.prompt_tokens || promptTokens;
                    completionTokens = parsed.usage.completion_tokens || completionTokens;
                  }
                }
              }
            } catch (_) {}
          } else {
            completionTokens += Math.max(1, Math.floor(chunkStr.length / 8));
          }
        }
      } else {
        for await (const chunk of stream) {
          const chunkStr = chunk.toString();
          if (res.writable && !res.writableEnded) {
            res.write(chunkStr);
          }
          completionTokens += Math.max(1, Math.floor(chunkStr.length / 8));
        }
      }

      if (!res.writableEnded) {
        res.end();
      }
    } catch (err: any) {
      console.error('[Streaming error]:', err.message);
      if (!res.writableEnded) res.end();
    }

    const durationMs = Date.now() - startTime;
    const costs = calculateCosts(selectedModel, promptTokens, completionTokens, jev.jevInputTokens);

    recordAndBroadcastRequest({
      id: requestId,
      client_agent: clientAgent,
      model_requested: requestedModel,
      model_routed: selectedModel,
      provider_used: selectedProvider,
      jev_intent: jev.intent,
      jev_complexity: jev.complexityScore,
      jev_confidence: jev.intentConfidence,
      jev_needs_reasoner: jev.needsReasoner,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      duration_ms: durationMs,
      jev_duration_ms: jev.jevDurationMs,
      cost_jev: costs.jevCost,
      cost_actual: costs.totalActualCost,
      cost_if_claude: costs.costIfClaude,
      cost_if_gpt4o: costs.costIfGpt4o,
      savings_vs_claude: costs.savingsVsClaude,
      prompt_preview: promptPreview
    });

    return;
  }

  // 4. Handle Non-Streaming response
  const completionData = providerResponse.data;
  const promptTokens = completionData?.usage?.prompt_tokens || Math.ceil(stateText.length / 4);
  const completionTokens = completionData?.usage?.completion_tokens || 100;
  const durationMs = Date.now() - startTime;
  const costs = calculateCosts(selectedModel, promptTokens, completionTokens, jev.jevInputTokens);

  recordAndBroadcastRequest({
    id: requestId,
    client_agent: clientAgent,
    model_requested: requestedModel,
    model_routed: selectedModel,
    provider_used: selectedProvider,
    jev_intent: jev.intent,
    jev_complexity: jev.complexityScore,
    jev_confidence: jev.intentConfidence,
    jev_needs_reasoner: jev.needsReasoner,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    duration_ms: durationMs,
    jev_duration_ms: jev.jevDurationMs,
    cost_jev: costs.jevCost,
    cost_actual: costs.totalActualCost,
    cost_if_claude: costs.costIfClaude,
    cost_if_gpt4o: costs.costIfGpt4o,
    savings_vs_claude: costs.savingsVsClaude,
    prompt_preview: promptPreview
  });

  return res.json(completionData);
}

function handleUnconfiguredMockStream(
  req: Request,
  res: Response,
  isStream: boolean,
  requestId: string,
  selectedModel: string,
  selectedProvider: string,
  jev: any,
  promptPreview: string,
  startTime: number,
  clientAgent: string,
  requestedModel: string
) {
  const content = `[Prompt-Router Notice]\n` +
    `• Jev Evaluation: Intent=${jev.intent}, Complexity=${jev.complexityScore}/5, ReasonerProb=${(jev.needsReasoner * 100).toFixed(0)}%\n` +
    `• Selected Target Model: ${selectedModel}\n` +
    `• Target Provider: ${selectedProvider}\n\n` +
    `To route live completions to Mammouth or OpenRouter, please configure your API keys in the dashboard at http://localhost:4000 or in your .env file.\n\n` +
    `Your request '${promptPreview}' was successfully classified and routed!`;

  const promptTokens = Math.ceil(promptPreview.length / 4);
  const completionTokens = Math.ceil(content.length / 4);
  const durationMs = Date.now() - startTime;
  const costs = calculateCosts(selectedModel, promptTokens, completionTokens, jev.jevInputTokens);

  recordAndBroadcastRequest({
    id: requestId,
    client_agent: clientAgent,
    model_requested: requestedModel,
    model_routed: selectedModel,
    provider_used: selectedProvider + ' (demo)',
    jev_intent: jev.intent,
    jev_complexity: jev.complexityScore,
    jev_confidence: jev.intentConfidence,
    jev_needs_reasoner: jev.needsReasoner,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    duration_ms: durationMs,
    jev_duration_ms: jev.jevDurationMs,
    cost_jev: costs.jevCost,
    cost_actual: costs.totalActualCost,
    cost_if_claude: costs.costIfClaude,
    cost_if_gpt4o: costs.costIfGpt4o,
    savings_vs_claude: costs.savingsVsClaude,
    prompt_preview: promptPreview
  });

  if (isStream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const chunkObj = {
      id: requestId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: selectedModel,
      choices: [{ index: 0, delta: { content }, finish_reason: 'stop' }]
    };
    res.write(`data: ${JSON.stringify(chunkObj)}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  return res.json({
    id: requestId,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: selectedModel,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens
    }
  });
}

