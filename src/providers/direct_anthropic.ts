import { config } from '../config.js';
import { getSetting } from '../db.js';

export interface DirectAnthropicResponse {
  ok: boolean;
  status: number;
  data?: any;
  stream?: any;
  error?: string;
  provider: 'anthropic';
}

export async function callDirectAnthropic(
  body: any,
  stream = false
): Promise<DirectAnthropicResponse> {
  const apiKey = getSetting('ANTHROPIC_API_KEY', config.anthropicApiKey);

  if (!apiKey || apiKey.trim() === '') {
    return {
      ok: false,
      status: 401,
      error: 'Direct Anthropic API Key is not configured',
      provider: 'anthropic'
    };
  }

  const model = mapAnthropicModelId(body.model);
  const messages: any[] = [];
  let systemPrompt: string | undefined = undefined;

  for (const m of (body.messages || [])) {
    if (m.role === 'system') {
      systemPrompt = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    } else {
      messages.push({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      });
    }
  }

  const anthropicBody: any = {
    model,
    messages,
    max_tokens: body.max_tokens || body.max_completion_tokens || 4096,
    stream: !!stream
  };
  if (systemPrompt) {
    anthropicBody.system = systemPrompt;
  }
  if (body.temperature !== undefined) anthropicBody.temperature = body.temperature;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(anthropicBody)
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        ok: false,
        status: res.status,
        error: `Direct Anthropic error (${res.status}): ${errText}`,
        provider: 'anthropic'
      };
    }

    if (stream) {
      return {
        ok: true,
        status: res.status,
        stream: res.body,
        provider: 'anthropic'
      };
    }

    const data: any = await res.json();
    const textContent = data.content?.[0]?.text || '';
    const openAiFormat = {
      id: data.id || 'msg_' + Math.random().toString(36).slice(2),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: body.model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: textContent },
          finish_reason: data.stop_reason === 'max_tokens' ? 'length' : 'stop'
        }
      ],
      usage: {
        prompt_tokens: data.usage?.input_tokens || 0,
        completion_tokens: data.usage?.output_tokens || 0,
        total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
      }
    };

    return {
      ok: true,
      status: res.status,
      data: openAiFormat,
      provider: 'anthropic'
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 502,
      error: `Direct Anthropic connection failed: ${err.message}`,
      provider: 'anthropic'
    };
  }
}

function mapAnthropicModelId(model: string): string {
  const m = model.toLowerCase();
  if (m.includes('fable')) return 'claude-fable-5.1';
  if (m.includes('3-7') || m.includes('3.7')) return 'claude-3-7-sonnet-20250219';
  if (m.includes('3-5') || m.includes('3.5') || m.includes('sonnet')) return 'claude-3-5-sonnet-20241022';
  if (m.includes('haiku')) return 'claude-3-5-haiku-20241022';
  if (m.includes('opus')) return 'claude-3-opus-20240229';
  return model.replace(/^[^/]+\//, '');
}
