import { spawn } from 'child_process';
import { Readable } from 'stream';
import { getSubscription, recordSubscriptionUsage } from '../subscriptions.js';
import { getSetting } from '../db.js';
import { config } from '../config.js';

export type AcpSubscriptionId =
  | 'claude_subscription'
  | 'codex_subscription'
  | 'gemini_free'
  | 'mistral_vibe'
  | 'gemini_cli';

export interface AcpBridgeResponse {
  ok: boolean;
  status: number;
  data?: any;
  stream?: any;
  error?: string;
  provider: 'acp_claude' | 'acp_codex' | 'gemini_free' | 'mistral_vibe' | 'gemini_cli' | string;
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
  subId: AcpSubscriptionId,
  body: any,
  stream = false
): Promise<AcpBridgeResponse> {
  const sub = getSubscription(subId);
  const providerKey = subId === 'claude_subscription' ? 'acp_claude'
    : (subId === 'codex_subscription' ? 'acp_codex'
    : (subId === 'mistral_vibe' ? 'mistral_vibe'
    : (subId === 'gemini_cli' ? 'gemini_cli' : 'gemini_free')));

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
  const cliBinary = sub.cli_path || (
    subId === 'claude_subscription' ? 'claude'
    : (subId === 'mistral_vibe' ? 'vibe'
    : (subId === 'gemini_cli' || subId === 'gemini_free' ? 'gemini' : 'codex'))
  );

  return new Promise<AcpBridgeResponse>((resolve) => {
    let resolved = false;
    let stdoutBuffer = '';
    let stderrBuffer = '';

    const args: string[] = [];
    if (subId === 'claude_subscription') {
      args.push('--print');
      if (systemMsg?.content) {
        args.push('--system-prompt', typeof systemMsg.content === 'string' ? systemMsg.content : JSON.stringify(systemMsg.content));
      }
      args.push(promptText);
    } else if (subId === 'mistral_vibe') {
      // Mistral Vibe accepts -p / --prompt for non-interactive prompt execution
      args.push('-p', promptText);
    } else if (subId === 'gemini_cli' || subId === 'gemini_free') {
      // Google Gemini CLI accepts -p / --prompt
      args.push('-p', promptText);
    } else {
      args.push('exec', promptText);
    }

    const isWin = process.platform === 'win32';
    // For Windows cmd execution, ensure arguments with spaces are safely quoted
    const safeArgs = isWin
      ? args.map(arg => {
          if (typeof arg === 'string' && (arg.includes(' ') || arg.includes('\n')) && !arg.startsWith('"')) {
            return `"${arg.replace(/"/g, '\\"')}"`;
          }
          return arg;
        })
      : args;

    try {
      const mistralKey = getSetting('MISTRAL_API_KEY', config.mistralApiKey);
      const geminiKey = getSetting('GEMINI_API_KEY', config.geminiApiKey);

      const child = spawn(cliBinary, safeArgs, {
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ...(sub.session_token ? { ACP_SESSION_TOKEN: sub.session_token } : {}),
          ...(subId === 'mistral_vibe' && mistralKey ? { MISTRAL_API_KEY: mistralKey.trim(), VIBE_API_KEY: mistralKey.trim() } : {}),
          ...((subId === 'gemini_cli' || subId === 'gemini_free') && geminiKey ? { GEMINI_API_KEY: geminiKey.trim() } : {})
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
          lowerStdout.includes('you have reached your usage limit') ||
          lowerStderr.includes('weekly limit') ||
          lowerStdout.includes('weekly limit') ||
          lowerStderr.includes('allowance') ||
          lowerStdout.includes('allowance')
        ) {
          let resetsAt = Date.now() + 5 * 60 * 60 * 1000;
          const matchDate = (stderrBuffer + ' ' + stdoutBuffer).match(/(?:reset(?:s)?\s*(?:on|at)\s*)([A-Za-z]+\s+\d{1,2}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+|\d{1,2}:\d{2})/i);
          if (matchDate) {
            const parsed = Date.parse(matchDate[1] + ` ${new Date().getFullYear()}`);
            if (!isNaN(parsed)) resetsAt = parsed;
          }
          recordSubscriptionUsage(subId, promptTokens, 0, resetsAt);
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
