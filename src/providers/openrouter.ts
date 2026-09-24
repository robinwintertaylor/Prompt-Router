import { config } from '../config.js';
import { getSetting } from '../db.js';

export interface OpenRouterResponse {
  ok: boolean;
  status: number;
  data?: any;
  stream?: NodeJS.ReadableStream | ReadableStream<Uint8Array> | any;
  error?: string;
  provider: 'openrouter';
}

export function mapToOpenRouterModel(model: string): string {
  const m = model.toLowerCase();

  // 1. If already namespaced (contains vendor/), keep it intact unless it is an obsolete legacy slug
  if (model.includes('/')) {
    if (m === 'anthropic/claude-3.5-sonnet' || m === 'anthropic/claude-3-5-sonnet' || m.endsWith('/claude-3.5-sonnet')) {
      return 'anthropic/claude-sonnet-5';
    }
    return model;
  }

  // 2. Map bare / un-namespaced slugs (e.g. failing over from Mammouth or client shorthand):
  if (m.includes('sonnet')) {
    if (m.includes('4-6') || m.includes('4.6')) return 'anthropic/claude-sonnet-4.6';
    if (m.includes('4-5') || m.includes('4.5')) return 'anthropic/claude-sonnet-4.5';
    if (m.includes('4')) return 'anthropic/claude-sonnet-4';
    return 'anthropic/claude-sonnet-5';
  }
  if (m.includes('opus')) {
    if (m.includes('4-6') || m.includes('4.6')) return 'anthropic/claude-opus-4.6';
    if (m.includes('4-5') || m.includes('4.5')) return 'anthropic/claude-opus-4.5';
    return 'anthropic/claude-opus-5';
  }
  if (m.includes('haiku')) return 'anthropic/claude-haiku-4.5';
  if (m.includes('fable')) return 'anthropic/claude-fable-5.1';
  if (m.includes('claude')) return 'anthropic/claude-sonnet-5';

  if (m.includes('gpt-4o-mini') || m.includes('mini') || m.includes('nano')) {
    return 'openai/gpt-4o-mini';
  }
  if (m.includes('gpt-4o') || m.includes('gpt-4') || m.includes('gpt-5')) {
    return 'openai/gpt-4o';
  }
  if (m.includes('deepseek-r1') || m.includes('r1') || m.includes('reasoner')) {
    return 'deepseek/deepseek-r1';
  }
  if (m.includes('deepseek')) {
    return 'deepseek/deepseek-chat';
  }
  if (m.includes('gemini') && (m.includes('flash') || m.includes('fast'))) {
    return 'google/gemini-2.5-flash';
  }
  if (m.includes('gemini')) {
    return 'google/gemini-2.5-pro';
  }
  if (m.includes('mistral') || m.includes('codestral')) {
    return 'mistralai/mistral-small';
  }
  if (m.includes('llama')) {
    return 'meta-llama/llama-3.3-70b-instruct';
  }

  return model;
}

export async function callOpenRouter(body: any, stream = false): Promise<OpenRouterResponse> {
  const apiKey = getSetting('OPENROUTER_API_KEY', config.openrouterApiKey);

  if (!apiKey || apiKey.trim() === '') {
    return {
      ok: false,
      status: 401,
      error: 'OpenRouter API Key is not configured',
      provider: 'openrouter'
    };
  }

  const targetModel = mapToOpenRouterModel(body.model);
  const forwardBody: any = {
    ...body,
    model: targetModel,
    stream: !!stream
  };

  // Guard against OpenRouter 402 error when max_tokens is omitted
  if (!forwardBody.max_tokens && !forwardBody.max_completion_tokens) {
    forwardBody.max_tokens = 4096;
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`,
        'HTTP-Referer': config.siteUrl,
        'X-OpenRouter-Title': config.siteName
      },
      body: JSON.stringify(forwardBody)
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        ok: false,
        status: res.status,
        error: `OpenRouter error (${res.status}): ${errText}`,
        provider: 'openrouter'
      };
    }

    if (stream) {
      return {
        ok: true,
        status: res.status,
        stream: res.body,
        provider: 'openrouter'
      };
    }

    const data = await res.json();
    return {
      ok: true,
      status: res.status,
      data,
      provider: 'openrouter'
    };
  } catch (err: any) {
    const cause = err.cause ? ` (${err.cause.message || err.cause.code || err.cause})` : '';
    return {
      ok: false,
      status: 502,
      error: `OpenRouter connection failed: ${err.message}${cause}`,
      provider: 'openrouter'
    };
  }
}
