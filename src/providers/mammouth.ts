import { config } from '../config.js';
import { getSetting } from '../db.js';

export interface ProviderResponse {
  ok: boolean;
  status: number;
  data?: any;
  stream?: NodeJS.ReadableStream | ReadableStream<Uint8Array> | any;
  error?: string;
  provider: 'mammouth';
}

export function mapToMammouthModel(model: string): string {
  const m = model.toLowerCase();

  // Known Mammouth valid slugs directly
  const MAMMOUTH_SUPPORTED = [
    'claude-sonnet-4-6', 'claude-sonnet-4-5', 'claude-sonnet-4', 'claude-haiku-4-5', 'claude-opus-4-6',
    'gpt-4o', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-5.4-mini', 'gpt-5.5',
    'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.7-flash',
    'deepseek-r1-0528', 'deepseek-v4-flash', 'deepseek-v3.1-terminus',
    'mistral-small-3.2-24b-instruct', 'mistral-large-3', 'llama-4-maverick'
  ];

  const stripped = model.replace(/^[^/]+\//, '');
  if (MAMMOUTH_SUPPORTED.includes(stripped)) return stripped;

  // Semantic mappings
  if (m.includes('claude') || m.includes('sonnet')) return 'claude-sonnet-4-6';
  if (m.includes('haiku')) return 'claude-haiku-4-5';
  if (m.includes('r1') || m.includes('reasoner')) return 'deepseek-r1-0528';
  if (m.includes('gpt-4o-mini') || m.includes('mini') || m.includes('nano')) return 'gpt-4.1-mini';
  if (m.includes('gpt-4o') || m.includes('gpt-4')) return 'gpt-4o';
  if (m.includes('gemini') && m.includes('pro')) return 'gemini-2.5-pro';
  if (m.includes('gemini') || m.includes('flash')) return 'gemini-2.5-flash';
  if (m.includes('deepseek')) return 'deepseek-v4-flash';
  if (m.includes('mistral') || m.includes('codestral')) return 'mistral-small-3.2-24b-instruct';
  if (m.includes('llama')) return 'llama-4-maverick';

  // Safe default on Mammouth
  return 'gemini-2.5-flash';
}

export async function callMammouth(body: any, stream = false): Promise<ProviderResponse> {
  const apiKey = getSetting('MAMMOUTH_API_KEY', config.mammouthApiKey);

  if (!apiKey || apiKey.trim() === '') {
    return {
      ok: false,
      status: 401,
      error: 'Mammouth API Key is not configured',
      provider: 'mammouth'
    };
  }

  const targetModel = mapToMammouthModel(body.model);
  const forwardBody = {
    ...body,
    model: targetModel,
    stream: !!stream
  };

  try {
    const res = await fetch('https://api.mammouth.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify(forwardBody)
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        ok: false,
        status: res.status,
        error: `Mammouth error (${res.status}): ${errText}`,
        provider: 'mammouth'
      };
    }

    if (stream) {
      return {
        ok: true,
        status: res.status,
        stream: res.body,
        provider: 'mammouth'
      };
    }

    const data = await res.json();
    return {
      ok: true,
      status: res.status,
      data,
      provider: 'mammouth'
    };
  } catch (err: any) {
    const cause = err.cause ? ` (${err.cause.message || err.cause.code || err.cause})` : '';
    return {
      ok: false,
      status: 502,
      error: `Mammouth connection failed: ${err.message}${cause}`,
      provider: 'mammouth'
    };
  }
}
