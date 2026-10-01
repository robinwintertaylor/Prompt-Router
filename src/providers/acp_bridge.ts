import { spawn } from 'child_process';
import { Readable } from 'stream';
import { getSubscription, recordSubscriptionUsage } from '../subscriptions.js';

export interface AcpBridgeResponse {
  ok: boolean;
  status: number;
  data?: any;
  stream?: any;
  error?: string;
  provider: 'acp_claude' | 'acp_codex' | 'gemini_free';
  tokensUsed?: number;
  quotaExhausted?: boolean;
}

export function createStreamFromText(model: string, text: string) {
  const s = new Readable({ read() {} });
  const id = 'acp_stream_' + Math.random().toString(36).slice(2);

  const roleChunk = {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }]
  };
  s.push(`data: ${JSON.stringify(roleChunk)}\n\n`);

  const contentChunk = {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta: { content: text }, finish_reason: null }]
  };
  s.push(`data: ${JSON.stringify(contentChunk)}\n\n`);

  const finishChunk = {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
  };
  s.push(`data: ${JSON.stringify(finishChunk)}\n\n`);
  s.push('data: [DONE]\n\n');
  s.push(null);

  return s;
}

export async function callAcpBridge(
  subId: 'claude_subscription' | 'codex_subscription' | 'gemini_free',
  body: any,
  stream = false
): Promise<AcpBridgeResponse> {
  const sub = getSubscription(subId);
  const providerKey = subId === 'claude_subscription' ? 'acp_claude'
    : (subId === 'codex_subscription' ? 'acp_codex' : 'gemini_free');

  if (!sub || !sub.enabled) {
    return {
      ok: false,
      status: 403,
      error: `Subscription bridge for '${subId}' is disabled`,
      provider: providerKey
    };
  }

  // Check if quota is currently exhausted
  if (sub.quota_remaining_pct <= 0) {
    const resetTimeStr = sub.resets_at ? new Date(sub.resets_at).toLocaleTimeString() : 'end of window';
    return {
      ok: false,
      status: 429,
      error: `Subscription quota exhausted. Resets at ${resetTimeStr}`,
      provider: providerKey,
      quotaExhausted: true
    };
  }

  const messages = body.messages || [];
  const systemMsg = messages.find((m: any) => m.role === 'system');
  const userMessages = messages.filter((m: any) => m.role !== 'system');
  const lastUserMsg = [...userMessages].reverse().find((m: any) => m.role === 'user');
  const promptText = typeof lastUserMsg?.content === 'string'
    ? lastUserMsg.content
    : JSON.stringify(lastUserMsg?.content || '');

  const promptTokens = Math.ceil(JSON.stringify(messages).length / 4);
  const cliBinary = sub.cli_path || (subId === 'claude_subscription' ? 'claude' : 'codex');

  return new Promise<AcpBridgeResponse>((resolve) => {
    let resolved = false;
    let stdoutBuffer = '';
    let stderrBuffer = '';

    const args: string[] = [];
    if (subId === 'claude_subscription') {
      args.push('--print');
      if (systemMsg?.content) {
        args.push('--system', typeof systemMsg.content === 'string' ? systemMsg.content : JSON.stringify(systemMsg.content));
      }
      args.push(promptText);
    } else {
      args.push('exec', promptText);
    }

    try {
      const child = spawn(cliBinary, args, {
        shell: true,
        env: {
          ...process.env,
          ...(sub.session_token ? { ACP_SESSION_TOKEN: sub.session_token } : {})
        }
      });

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try { child.kill(); } catch (_) {}
          resolve({
            ok: false,
            status: 504,
            error: `ACP subprocess '${cliBinary}' timed out after 45s`,
            provider: providerKey
          });
        }
      }, 45000);

      child.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString();
      });

      child.stderr.on('data', (chunk) => {
        stderrBuffer += chunk.toString();
      });

      child.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({
            ok: false,
            status: 502,
            error: `Failed to launch ACP binary '${cliBinary}': ${err.message}`,
            provider: providerKey
          });
        }
      });

      child.on('close', (code) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);

        const lowerStderr = stderrBuffer.toLowerCase();
        const lowerStdout = stdoutBuffer.toLowerCase();

        if (
          lowerStderr.includes('rate limit') ||
          lowerStderr.includes('quota') ||
          lowerStderr.includes('too many requests') ||
          lowerStdout.includes('you have reached your usage limit')
        ) {
          recordSubscriptionUsage(subId, promptTokens, 0, Date.now() + 5 * 60 * 60 * 1000);
          return resolve({
            ok: false,
            status: 429,
            error: `Subscription rate limit reached: ${stderrBuffer.trim() || stdoutBuffer.trim()}`,
            provider: providerKey,
            quotaExhausted: true
          });
        }

        if (code !== 0 && !stdoutBuffer.trim()) {
          return resolve({
            ok: false,
            status: 500,
            error: `ACP '${cliBinary}' exited with code ${code}: ${stderrBuffer.trim()}`,
            provider: providerKey
          });
        }

        const completionText = stdoutBuffer.trim();
        const completionTokens = Math.ceil(completionText.length / 4);
        const totalUsed = promptTokens + completionTokens;

        recordSubscriptionUsage(subId, totalUsed);

        if (stream) {
          const streamOutput = createStreamFromText(body.model, completionText);
          return resolve({
            ok: true,
            status: 200,
            stream: streamOutput,
            provider: providerKey,
            tokensUsed: totalUsed
          });
        }

        resolve({
          ok: true,
          status: 200,
          data: {
            id: 'acp_' + Math.random().toString(36).slice(2),
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: body.model,
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: completionText },
                finish_reason: 'stop'
              }
            ],
            usage: {
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              total_tokens: totalUsed
            }
          },
          provider: providerKey,
          tokensUsed: totalUsed
        });
      });
    } catch (err: any) {
      if (!resolved) {
        resolved = true;
        resolve({
          ok: false,
          status: 502,
          error: `ACP bridge execution exception: ${err.message}`,
          provider: providerKey
        });
      }
    }
  });
}
