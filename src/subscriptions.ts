import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { db } from './db.js';

export interface SubscriptionRecord {
  id: string; // 'claude_subscription' | 'codex_subscription' | 'gemini_free'
  provider: 'anthropic' | 'openai' | 'google';
  name: string;
  enabled: boolean;
  connected: boolean;
  auth_type: 'acp_cli' | 'oauth_session' | 'free_tier_key';
  cli_path: string;
  session_token: string;
  window_type: '5h_rolling' | 'daily' | 'weekly';
  quota_total_tokens: number;
  quota_used_tokens: number;
  quota_remaining_pct: number;
  resets_at: number | null; // epoch ms
  last_checked: number;
  status_message: string;
}

const DEFAULT_SUBSCRIPTIONS: Omit<SubscriptionRecord, 'last_checked'>[] = [
  {
    id: 'claude_subscription',
    provider: 'anthropic',
    name: 'Claude Pro / Max (ACP Free Tokens)',
    enabled: true,
    connected: false,
    auth_type: 'acp_cli',
    cli_path: 'claude',
    session_token: '',
    window_type: '5h_rolling',
    quota_total_tokens: 180000,
    quota_used_tokens: 0,
    quota_remaining_pct: 100.0,
    resets_at: null,
    status_message: 'Ready to check local Claude CLI / ACP credentials'
  },
  {
    id: 'codex_subscription',
    provider: 'openai',
    name: 'ChatGPT Plus / Pro (Codex ACP)',
    enabled: true,
    connected: false,
    auth_type: 'acp_cli',
    cli_path: 'codex',
    session_token: '',
    window_type: '5h_rolling',
    quota_total_tokens: 220000,
    quota_used_tokens: 0,
    quota_remaining_pct: 100.0,
    resets_at: null,
    status_message: 'Ready to check local OpenAI Codex CLI credentials'
  },
  {
    id: 'gemini_free',
    provider: 'google',
    name: 'Google Gemini (AI Studio Free Tier)',
    enabled: true,
    connected: false,
    auth_type: 'free_tier_key',
    cli_path: 'gemini',
    session_token: '',
    window_type: 'daily',
    quota_total_tokens: 1000000,
    quota_used_tokens: 0,
    quota_remaining_pct: 100.0,
    resets_at: null,
    status_message: 'Free Tier (15 RPM / 1,500 daily requests, $0.00)'
  }
];

export function initSubscriptionsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      provider TEXT,
      name TEXT,
      enabled BOOLEAN DEFAULT 1,
      connected BOOLEAN DEFAULT 0,
      auth_type TEXT,
      cli_path TEXT,
      session_token TEXT,
      window_type TEXT,
      quota_total_tokens INTEGER DEFAULT 0,
      quota_used_tokens INTEGER DEFAULT 0,
      quota_remaining_pct REAL DEFAULT 100.0,
      resets_at INTEGER,
      last_checked INTEGER,
      status_message TEXT
    );
  `);

  for (const s of DEFAULT_SUBSCRIPTIONS) {
    const existing = db.prepare('SELECT id FROM subscriptions WHERE id = ?').all(s.id)[0];
    if (!existing) {
      db.prepare(`
        INSERT INTO subscriptions (
          id, provider, name, enabled, connected, auth_type, cli_path, session_token,
          window_type, quota_total_tokens, quota_used_tokens, quota_remaining_pct,
          resets_at, last_checked, status_message
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?
        )
      `).run(
        s.id, s.provider, s.name, s.enabled ? 1 : 0, s.connected ? 1 : 0, s.auth_type, s.cli_path, s.session_token,
        s.window_type, s.quota_total_tokens, s.quota_used_tokens, s.quota_remaining_pct,
        s.resets_at, Date.now(), s.status_message
      );
    }
  }
}

export function getAllSubscriptions(): SubscriptionRecord[] {
  resetExpiredSubscriptionQuotas();
  const rows = db.prepare('SELECT * FROM subscriptions').all() as any[];
  return rows.map(r => ({
    ...r,
    enabled: Boolean(r.enabled),
    connected: Boolean(r.connected),
    quota_remaining_pct: Number(r.quota_remaining_pct),
    quota_total_tokens: Number(r.quota_total_tokens),
    quota_used_tokens: Number(r.quota_used_tokens)
  }));
}

export function getSubscription(id: string): SubscriptionRecord | null {
  resetExpiredSubscriptionQuotas();
  const row = db.prepare('SELECT * FROM subscriptions WHERE id = ?').all(id)[0] as any;
  if (!row) return null;
  return {
    ...row,
    enabled: Boolean(row.enabled),
    connected: Boolean(row.connected),
    quota_remaining_pct: Number(row.quota_remaining_pct),
    quota_total_tokens: Number(row.quota_total_tokens),
    quota_used_tokens: Number(row.quota_used_tokens)
  };
}

export function updateSubscription(
  id: string,
  updates: Partial<Omit<SubscriptionRecord, 'id'>>
) {
  const current = getSubscription(id);
  if (!current) return;

  const merged = { ...current, ...updates };
  db.prepare(`
    UPDATE subscriptions
    SET enabled = ?, connected = ?, auth_type = ?, cli_path = ?, session_token = ?,
        window_type = ?, quota_total_tokens = ?, quota_used_tokens = ?,
        quota_remaining_pct = ?, resets_at = ?, last_checked = ?, status_message = ?
    WHERE id = ?
  `).run(
    merged.enabled ? 1 : 0,
    merged.connected ? 1 : 0,
    merged.auth_type,
    merged.cli_path,
    merged.session_token,
    merged.window_type,
    merged.quota_total_tokens,
    merged.quota_used_tokens,
    merged.quota_remaining_pct,
    merged.resets_at,
    Date.now(),
    merged.status_message,
    id
  );
}

export function resetExpiredSubscriptionQuotas() {
  const now = Date.now();
  const rows = db.prepare('SELECT * FROM subscriptions WHERE resets_at IS NOT NULL AND resets_at <= ?').all(now) as any[];
  for (const r of rows) {
    db.prepare(`
      UPDATE subscriptions
      SET quota_used_tokens = 0, quota_remaining_pct = 100.0, resets_at = NULL,
          status_message = 'Quota automatically refreshed after reset window.'
      WHERE id = ?
    `).run(r.id);
  }
}

export function recordSubscriptionUsage(
  id: string,
  tokensUsed: number,
  reportedRemainingPct?: number,
  resetsAtEpochMs?: number
) {
  const sub = getSubscription(id);
  if (!sub) return;

  const now = Date.now();
  let newUsed = sub.quota_used_tokens + tokensUsed;
  let newRemainingPct = reportedRemainingPct !== undefined
    ? Math.max(0, Math.min(100, reportedRemainingPct))
    : Math.max(0, ((sub.quota_total_tokens - newUsed) / sub.quota_total_tokens) * 100);

  let resetsAt = resetsAtEpochMs !== undefined ? resetsAtEpochMs : sub.resets_at;
  if (!resetsAt) {
    const windowMs = sub.window_type === 'daily' ? 24 * 60 * 60 * 1000 : 5 * 60 * 60 * 1000;
    resetsAt = now + windowMs;
  }

  let statusMessage = sub.status_message;
  if (newRemainingPct <= 0) {
    statusMessage = `Quota exhausted. Resets at ${new Date(resetsAt).toLocaleTimeString()}`;
  } else if (newRemainingPct <= 20) {
    statusMessage = `Low quota (${newRemainingPct.toFixed(0)}% remaining). Quota conservation mode active.`;
  } else {
    statusMessage = `Active subscription quota: ${newRemainingPct.toFixed(0)}% remaining.`;
  }

  updateSubscription(id, {
    quota_used_tokens: newUsed,
    quota_remaining_pct: newRemainingPct,
    resets_at: resetsAt,
    status_message: statusMessage
  });
}

export function probeSubscriptionCredentials(): {
  claude: { available: boolean; method: string; details: string };
  codex: { available: boolean; method: string; details: string };
  gemini: { available: boolean; method: string; details: string };
} {
  const homeDir = os.homedir();

  // 1. Claude Probe
  let claudeAvailable = false;
  let claudeMethod = 'none';
  let claudeDetails = 'Claude CLI or session credentials not found';

  const claudeConfigPath = path.join(homeDir, '.claude.json');
  const claudeAltConfig = path.join(homeDir, '.config', 'claude', 'config.json');

  if (fs.existsSync(claudeConfigPath) || fs.existsSync(claudeAltConfig)) {
    claudeAvailable = true;
    claudeMethod = 'local_session';
    claudeDetails = 'Detected authenticated Claude session in user home profile';
  } else {
    try {
      const isWin = process.platform === 'win32';
      const cmd = isWin ? 'where claude' : 'which claude';
      execSync(cmd, { stdio: 'ignore', timeout: 1000 });
      claudeAvailable = true;
      claudeMethod = 'acp_cli';
      claudeDetails = 'Found Claude CLI binary installed in system PATH';
    } catch (_) {}
  }

  // 2. OpenAI Codex Probe
  let codexAvailable = false;
  let codexMethod = 'none';
  let codexDetails = 'OpenAI Codex CLI or session credentials not found';

  const codexDir = path.join(homeDir, '.codex');
  const codexConfig = path.join(homeDir, '.codex', 'config.json');
  const codexAltConfig = path.join(homeDir, '.config', 'openai', 'codex.json');

  if (fs.existsSync(codexConfig) || fs.existsSync(codexDir) || fs.existsSync(codexAltConfig)) {
    codexAvailable = true;
    codexMethod = 'local_session';
    codexDetails = 'Detected ChatGPT Plus/Pro Codex credentials in user home profile';
  } else {
    try {
      const isWin = process.platform === 'win32';
      const cmd = isWin ? 'where codex' : 'which codex';
      execSync(cmd, { stdio: 'ignore', timeout: 1000 });
      codexAvailable = true;
      codexMethod = 'acp_cli';
      codexDetails = 'Found Codex CLI binary installed in system PATH';
    } catch (_) {}
  }

  // 3. Google Gemini Free Tier
  const geminiAvailable = true;
  const geminiMethod = 'free_tier_key';
  const geminiDetails = 'Google AI Studio Free Tier (15 RPM / 1M TPM included quota)';

  updateSubscription('claude_subscription', {
    connected: claudeAvailable,
    status_message: claudeAvailable ? `Connected (${claudeDetails})` : 'Claude CLI / credentials not detected (can be entered manually)'
  });

  updateSubscription('codex_subscription', {
    connected: codexAvailable,
    status_message: codexAvailable ? `Connected (${codexDetails})` : 'Codex CLI / credentials not detected (can be entered manually)'
  });

  updateSubscription('gemini_free', {
    connected: true,
    status_message: geminiDetails
  });

  return {
    claude: { available: claudeAvailable, method: claudeMethod, details: claudeDetails },
    codex: { available: codexAvailable, method: codexMethod, details: codexDetails },
    gemini: { available: geminiAvailable, method: geminiMethod, details: geminiDetails }
  };
}
