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
  if (m.includes('claude-3.5-sonnet') || m.includes('claude-3-5-sonnet') || m.includes('sonnet')) {
    return 'claude-3-5-sonnet-20241022';
  }
  if (m.includes('gpt-4o-mini')) {
    return 'gpt-4o-mini';
  }
  if (m.includes('gpt-4o')) {
    return 'gpt-4o';
  }
  if (m.includes('deepseek-r1') || m.includes('r1')) {
    return 'deepseek-reasoner';
  }
  if (m.includes('deepseek')) {
    return 'deepseek-chat';
  }
  if (m.includes('gemini') && m.includes('flash')) {
    return 'gemini-2.0-flash';
  }
  if (m.includes('gemini')) {
    return 'gemini-1.5-pro';
  }
  if (m.includes('mistral-small')) {
    return 'mistral-small';
  }
  return model.replace(/^[^/]+\//, ''); // strip prefix if present
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
    return {
      ok: false,
      status: 502,
      error: `Mammouth connection failed: ${err.message}`,
      provider: 'mammouth'
    };
  }
}
