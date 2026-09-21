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
  if (m.includes('claude-3.5-sonnet') || m.includes('claude-3-5-sonnet') || m.includes('sonnet')) {
    return 'anthropic/claude-3.5-sonnet';
  }
  if (m.includes('gpt-4o-mini')) {
    return 'openai/gpt-4o-mini';
  }
  if (m.includes('gpt-4o')) {
    return 'openai/gpt-4o';
  }
  if (m.includes('deepseek-r1') || m.includes('r1')) {
    return 'deepseek/deepseek-r1';
  }
  if (m.includes('deepseek')) {
    return 'deepseek/deepseek-chat';
  }
  if (m.includes('gemini') && m.includes('flash')) {
    return 'google/gemini-2.5-flash';
  }
  if (m.includes('gemini')) {
    return 'google/gemini-2.5-pro';
  }
  if (m.includes('mistral-small')) {
    return 'mistralai/mistral-small';
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
    return {
      ok: false,
      status: 502,
      error: `OpenRouter connection failed: ${err.message}`,
      provider: 'openrouter'
    };
  }
}
