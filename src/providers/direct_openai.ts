import { config } from '../config.js';
import { getSetting } from '../db.js';

export interface DirectOpenAIResponse {
  ok: boolean;
  status: number;
  data?: any;
  stream?: any;
  error?: string;
  provider: 'openai' | 'mistral' | 'deepseek' | 'google' | 'nvidia';
}

export async function callDirectOpenAICompatible(
  vendor: 'openai' | 'mistral' | 'deepseek' | 'google' | 'nvidia',
  body: any,
  stream = false
): Promise<DirectOpenAIResponse> {
  let endpoint = '';
  let apiKey = '';

  switch (vendor) {
    case 'openai':
      endpoint = 'https://api.openai.com/v1/chat/completions';
      apiKey = getSetting('OPENAI_API_KEY', config.openaiApiKey);
      break;
    case 'mistral':
      endpoint = 'https://api.mistral.ai/v1/chat/completions';
      apiKey = getSetting('MISTRAL_API_KEY', config.mistralApiKey);
      break;
    case 'deepseek':
      endpoint = 'https://api.deepseek.com/chat/completions';
      apiKey = getSetting('DEEPSEEK_API_KEY', config.deepseekApiKey);
      break;
    case 'google':
      endpoint = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
      apiKey = getSetting('GEMINI_API_KEY', config.geminiApiKey);
      break;
    case 'nvidia':
      endpoint = 'https://integrate.api.nvidia.com/v1/chat/completions';
      apiKey = getSetting('NVIDIA_API_KEY', config.nvidiaApiKey);
      break;
  }

  if (!apiKey || apiKey.trim() === '') {
    return {
      ok: false,
      status: 401,
      error: `Direct API key for ${vendor} is not configured`,
      provider: vendor
    };
  }

  const strippedModel = mapVendorModelId(vendor, body.model);
  const forwardBody = {
    ...body,
    model: strippedModel,
    stream: !!stream
  };

  try {
    const res = await fetch(endpoint, {
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
        error: `Direct ${vendor} error (${res.status}): ${errText}`,
        provider: vendor
      };
    }

    if (stream) {
      return {
        ok: true,
        status: res.status,
        stream: res.body,
        provider: vendor
      };
    }

    const data = await res.json();
    return {
      ok: true,
      status: res.status,
      data,
      provider: vendor
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 502,
      error: `Direct ${vendor} connection failed: ${err.message}`,
      provider: vendor
    };
  }
}

function mapVendorModelId(vendor: string, model: string): string {
  const stripped = model.replace(/^[^/]+\//, '');
  const m = model.toLowerCase();

  if (vendor === 'deepseek') {
    if (m.includes('r1') || m.includes('reasoner')) return 'deepseek-reasoner';
    return 'deepseek-chat';
  }

  if (vendor === 'mistral') {
    if (m.includes('large')) return 'mistral-large-latest';
    if (m.includes('codestral')) return 'codestral-latest';
    if (m.includes('small')) return 'mistral-small-latest';
    if (m.includes('pixtral')) return 'pixtral-12b-2409';
    return stripped;
  }

  if (vendor === 'google') {
    if (m.includes('flash')) return 'gemini-2.5-flash';
    if (m.includes('pro')) return 'gemini-2.5-pro';
    return stripped;
  }

  if (vendor === 'nvidia') {
    if (m.includes('llama-3.3-70b') || m.includes('llama-3.3')) return 'meta/llama-3.3-70b-instruct';
    if (m.includes('r1') || m.includes('deepseek-r1')) return 'deepseek-ai/deepseek-r1';
    if (m.includes('nemotron')) return 'nvidia/llama-3.1-nemotron-70b-instruct';
    if (m.includes('mistral-large')) return 'mistralai/mistral-large-2-instruct';
    if (m.includes('llama-3.1-8b') || m.includes('8b')) return 'meta/llama-3.1-8b-instruct';
    if (model.startsWith('nvidia/')) {
      const rest = model.slice(7);
      return rest.includes('/') ? rest : model;
    }
    return model;
  }

  return stripped;
}
