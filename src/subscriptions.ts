import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { db, getSetting } from './db.js';
import { config } from './config.js';
import { markProviderBudgetExceeded, clearProviderBudgetExceeded } from './arbitrage.js';

export interface SubscriptionRecord {
  id: string; // 'claude_subscription' | 'codex_subscription' | 'gemini_free' | 'mammouth_credit' | 'openrouter_credit' | 'mistral_direct' | 'deepseek_direct' | 'anthropic_direct' | 'openai_direct'
  provider: 'anthropic' | 'openai' | 'google' | 'mammouth' | 'openrouter' | 'mistral' | 'deepseek' | string;
  name: string;
  enabled: boolean;
  connected: boolean;
  auth_type: 'acp_cli' | 'oauth_session' | 'free_tier_key' | 'api_key';
  cli_path: string;
  session_token: string;
  window_type: '5h_rolling' | 'daily' | 'weekly' | 'monthly' | 'credit_balance' | 'pay_as_you_go';
  quota_total_tokens: number;
  quota_used_tokens: number;
  quota_remaining_pct: number;
  resets_at: number | null; // epoch ms
  last_checked: number;
  status_message: string;
  quota_unit?: 'tokens' | 'usd' | 'pay_as_you_go';
  current_balance?: number; // USD remaining for aggregators or USD spend for payg
  max_balance?: number; // USD total budget/credit for aggregators
}

export interface ConfigurableProviderDef {
  id: string;
  provider: string;
  name: string;
  settingKey: string;
  configKey: keyof typeof config;
  authType: 'api_key';
  windowType: 'pay_as_you_go';
  probeUrl: string;
  probeHeaders: (key: string) => Record<string, string>;
  formatDetails: (data: any, usage: { totalTokens: number; totalCost: number }) => string;
}

export const CONFIGURABLE_PROVIDERS: ConfigurableProviderDef[] = [
  {
    id: 'mistral_direct',
    provider: 'mistral',
    name: 'Mistral AI (Direct API)',
    settingKey: 'MISTRAL_API_KEY',
    configKey: 'mistralApiKey',
    authType: 'api_key',
    windowType: 'pay_as_you_go',
    probeUrl: 'https://api.mistral.ai/v1/models',
    probeHeaders: (key: string) => ({ 'Authorization': `Bearer ${key.trim()}` }),
    formatDetails: (data: any, usage: { totalTokens: number; totalCost: number }) => {
      const count = Array.isArray(data?.data) ? data.data.length : 0;
      return `Direct EU Sovereign API connected (${count} models available, e.g. Codestral, Mistral Large)`;
    }
  },
  {
    id: 'deepseek_direct',
    provider: 'deepseek',
    name: 'DeepSeek AI (Direct API)',
    settingKey: 'DEEPSEEK_API_KEY',
    configKey: 'deepseekApiKey',
    authType: 'api_key',
    windowType: 'pay_as_you_go',
    probeUrl: 'https://api.deepseek.com/models',
    probeHeaders: (key: string) => ({ 'Authorization': `Bearer ${key.trim()}` }),
    formatDetails: (data: any, usage: { totalTokens: number; totalCost: number }) => {
      return 'Direct DeepSeek API connected (R1 & V3 active)';
    }
  },
  {
    id: 'anthropic_direct',
    provider: 'anthropic',
    name: 'Anthropic Claude (Direct API)',
    settingKey: 'ANTHROPIC_API_KEY',
    configKey: 'anthropicApiKey',
    authType: 'api_key',
    windowType: 'pay_as_you_go',
    probeUrl: 'https://api.anthropic.com/v1/models',
    probeHeaders: (key: string) => ({
      'x-api-key': key.trim(),
      'anthropic-version': '2023-06-01'
    }),
    formatDetails: (data: any, usage: { totalTokens: number; totalCost: number }) => {
      return 'Direct Anthropic API connected (Claude 3.5 & Fable active)';
    }
  },
  {
    id: 'openai_direct',
    provider: 'openai',
    name: 'OpenAI GPT (Direct API)',
    settingKey: 'OPENAI_API_KEY',
    configKey: 'openaiApiKey',
    authType: 'api_key',
    windowType: 'pay_as_you_go',
    probeUrl: 'https://api.openai.com/v1/models',
    probeHeaders: (key: string) => ({ 'Authorization': `Bearer ${key.trim()}` }),
    formatDetails: (data: any, usage: { totalTokens: number; totalCost: number }) => {
      return 'Direct OpenAI API connected (GPT-4o & o-series active)';
    }
  }
];

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
    window_type: 'weekly',
    quota_total_tokens: 180000,
    quota_used_tokens: 0,
    quota_remaining_pct: 100.0,
    resets_at: null,
    status_message: 'Ready to check local Claude CLI / ACP credentials',
    quota_unit: 'tokens',
    current_balance: 0,
    max_balance: 0
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
    status_message: 'Ready to check local OpenAI Codex CLI credentials',
    quota_unit: 'tokens',
    current_balance: 0,
    max_balance: 0
  },
  {
    id: 'mistral_vibe',
    provider: 'mistral',
    name: 'Mistral Vibe (ACP CLI Bridge)',
    enabled: true,
    connected: false,
    auth_type: 'acp_cli',
    cli_path: 'vibe',
    session_token: '',
    window_type: '5h_rolling',
    quota_total_tokens: 200000,
    quota_used_tokens: 0,
    quota_remaining_pct: 100.0,
    resets_at: null,
    status_message: 'Ready to check local Mistral Vibe CLI (vibe / vibe-acp)',
    quota_unit: 'tokens',
    current_balance: 0,
    max_balance: 0
  },
  {
    id: 'gemini_cli',
    provider: 'google',
    name: 'Google Gemini (Gemini CLI ACP)',
    enabled: true,
    connected: false,
    auth_type: 'acp_cli',
    cli_path: 'gemini',
    session_token: '',
    window_type: 'daily',
    quota_total_tokens: 1000000,
    quota_used_tokens: 0,
    quota_remaining_pct: 100.0,
    resets_at: null,
    status_message: 'Ready to check local Google Gemini CLI (gemini / gemini-cli)',
    quota_unit: 'tokens',
    current_balance: 0,
    max_balance: 0
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
    status_message: 'Free Tier (15 RPM / 1M TPM included quota, $0.00)',
    quota_unit: 'tokens',
    current_balance: 0,
    max_balance: 0
  },
  {
    id: 'mammouth_credit',
    provider: 'mammouth',
    name: 'Mammouth AI (Credit & Budget)',
    enabled: true,
    connected: false,
    auth_type: 'api_key',
    cli_path: '',
    session_token: '',
    window_type: 'monthly',
    quota_total_tokens: 0,
    quota_used_tokens: 0,
    quota_remaining_pct: 100.0,
    resets_at: null,
    status_message: 'Ready to probe live account budget and credits',
    quota_unit: 'usd',
    current_balance: 0,
    max_balance: 0
  },
  {
    id: 'openrouter_credit',
    provider: 'openrouter',
    name: 'OpenRouter (Prepaid Credits)',
    enabled: true,
    connected: false,
    auth_type: 'api_key',
    cli_path: '',
    session_token: '',
    window_type: 'credit_balance',
    quota_total_tokens: 0,
    quota_used_tokens: 0,
    quota_remaining_pct: 100.0,
    resets_at: null,
    status_message: 'Ready to probe live prepaid credit balance',
    quota_unit: 'usd',
    current_balance: 0,
    max_balance: 0
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
      status_message TEXT,
      quota_unit TEXT DEFAULT 'tokens',
      current_balance REAL DEFAULT 0.0,
      max_balance REAL DEFAULT 0.0
    );
  `);

  try { db.exec("ALTER TABLE subscriptions ADD COLUMN quota_unit TEXT DEFAULT 'tokens';"); } catch (_) {}
  try { db.exec("ALTER TABLE subscriptions ADD COLUMN current_balance REAL DEFAULT 0.0;"); } catch (_) {}
  try { db.exec("ALTER TABLE subscriptions ADD COLUMN max_balance REAL DEFAULT 0.0;"); } catch (_) {}

  for (const s of DEFAULT_SUBSCRIPTIONS) {
    const existing = db.prepare('SELECT id FROM subscriptions WHERE id = ?').all(s.id)[0];
    if (!existing) {
      db.prepare(`
        INSERT INTO subscriptions (
          id, provider, name, enabled, connected, auth_type, cli_path, session_token,
          window_type, quota_total_tokens, quota_used_tokens, quota_remaining_pct,
          resets_at, last_checked, status_message, quota_unit, current_balance, max_balance
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?
        )
      `).run(
        s.id, s.provider, s.name, s.enabled ? 1 : 0, s.connected ? 1 : 0, s.auth_type, s.cli_path, s.session_token,
        s.window_type, s.quota_total_tokens, s.quota_used_tokens, s.quota_remaining_pct,
        s.resets_at, Date.now(), s.status_message, s.quota_unit || 'tokens', s.current_balance ?? 0, s.max_balance ?? 0
      );
    }
  }
}

export function getProviderUsageStats(provider: string): { totalTokens: number; totalCost: number; requestCount: number } {
  try {
    const row = db.prepare(`
      SELECT
        COALESCE(SUM(total_tokens), 0) AS total_tokens,
        COALESCE(SUM(cost_actual), 0) AS total_cost,
        COUNT(*) AS request_count
      FROM requests_log
      WHERE provider_used = ?
    `).all(provider)[0] as any;
    return {
      totalTokens: Number(row?.total_tokens || 0),
      totalCost: Number(row?.total_cost || 0),
      requestCount: Number(row?.request_count || 0)
    };
  } catch {
    return { totalTokens: 0, totalCost: 0, requestCount: 0 };
  }
}

export function syncConfiguredProviderSubscriptions() {
  for (const def of CONFIGURABLE_PROVIDERS) {
    const rawVal = getSetting(def.settingKey, (config as any)[def.configKey]);
    const isConfigured = Boolean(rawVal && String(rawVal).trim() !== '');
    const usage = getProviderUsageStats(def.provider);

    const existing = db.prepare('SELECT id FROM subscriptions WHERE id = ?').all(def.id)[0] as any;
    if (isConfigured) {
      if (!existing) {
        db.prepare(`
          INSERT INTO subscriptions (
            id, provider, name, enabled, connected, auth_type, cli_path, session_token,
            window_type, quota_total_tokens, quota_used_tokens, quota_remaining_pct,
            resets_at, last_checked, status_message, quota_unit, current_balance, max_balance
          ) VALUES (
            ?, ?, ?, 1, 1, 'api_key', '', '',
            'pay_as_you_go', 0, ?, 100.0,
            NULL, ?, ?, 'pay_as_you_go', ?, 0.0
          )
        `).run(
          def.id, def.provider, def.name,
          usage.totalTokens,
          Date.now(),
          `${def.name} active with direct API key`,
          usage.totalCost
        );
      } else {
        const initialMsg = `${def.name} active with direct API key`;
        db.prepare(`
          UPDATE subscriptions
          SET enabled = 1, connected = 1, quota_used_tokens = ?, current_balance = ?, quota_unit = 'pay_as_you_go',
              status_message = CASE WHEN status_message LIKE '%not configured%' THEN ? ELSE status_message END
          WHERE id = ?
        `).run(usage.totalTokens, usage.totalCost, initialMsg, def.id);
      }
    } else {
      if (existing) {
        db.prepare(`
          UPDATE subscriptions
          SET enabled = 0, connected = 0, status_message = ?
          WHERE id = ?
        `).run(`${def.name} API key not configured in settings`, def.id);
      }
    }
  }
}

export function recordProviderUsage(
  provider: string,
  tokensUsed: number,
  costUsed: number = 0
) {
  const norm = provider.toLowerCase();
  let subId = '';
  if (norm === 'mistral') subId = 'mistral_direct';
  else if (norm === 'deepseek') subId = 'deepseek_direct';
  else if (norm === 'anthropic') subId = 'anthropic_direct';
  else if (norm === 'openai') subId = 'openai_direct';
  else if (norm === 'google') subId = 'gemini_free';
  else if (norm === 'mammouth') subId = 'mammouth_credit';
  else if (norm === 'openrouter') subId = 'openrouter_credit';
  else if (norm === 'acp_claude') subId = 'claude_subscription';
  else if (norm === 'acp_codex') subId = 'codex_subscription';

  if (!subId) return;

  const sub = getSubscription(subId);
  if (!sub) return;

  const newUsed = (sub.quota_used_tokens || 0) + tokensUsed;
  const newBalance = (sub.current_balance || 0) + costUsed;

  try {
    db.prepare(`
      UPDATE subscriptions
      SET quota_used_tokens = ?, current_balance = ?, last_checked = ?
      WHERE id = ?
    `).run(newUsed, newBalance, Date.now(), subId);
  } catch (_) {}
}

export function getAllSubscriptions(connectedOnly: boolean = false): SubscriptionRecord[] {
  resetExpiredSubscriptionQuotas();
  syncConfiguredProviderSubscriptions();

  const rows = db.prepare(`
    SELECT * FROM subscriptions
    WHERE id IN ('claude_subscription', 'codex_subscription', 'mistral_vibe', 'gemini_cli', 'gemini_free', 'mammouth_credit', 'openrouter_credit')
       OR enabled = 1
    ORDER BY
      CASE
        WHEN id = 'claude_subscription' THEN 1
        WHEN id = 'codex_subscription' THEN 2
        WHEN id = 'mistral_vibe' THEN 3
        WHEN id = 'gemini_cli' THEN 4
        WHEN id = 'mistral_direct' THEN 5
        WHEN id = 'deepseek_direct' THEN 6
        WHEN id = 'anthropic_direct' THEN 7
        WHEN id = 'openai_direct' THEN 8
        WHEN id = 'gemini_free' THEN 9
        WHEN id = 'mammouth_credit' THEN 10
        WHEN id = 'openrouter_credit' THEN 11
        ELSE 12
      END
  `).all() as any[];

  let result = rows.map(r => {
    const isPayg = r.window_type === 'pay_as_you_go' || r.quota_unit === 'pay_as_you_go';
    const usage = getProviderUsageStats(r.provider);
    const usedTokens = isPayg ? usage.totalTokens : Number(r.quota_used_tokens);
    const balanceVal = isPayg ? usage.totalCost : Number(r.current_balance ?? 0);

    return {
      ...r,
      enabled: Boolean(r.enabled),
      connected: Boolean(r.connected),
      quota_remaining_pct: Number(r.quota_remaining_pct),
      quota_total_tokens: Number(r.quota_total_tokens),
      quota_used_tokens: usedTokens,
      quota_unit: r.quota_unit || (r.provider === 'mammouth' || r.provider === 'openrouter' ? 'usd' : (isPayg ? 'pay_as_you_go' : 'tokens')),
      current_balance: balanceVal,
      max_balance: Number(r.max_balance ?? 0)
    };
  });

  if (connectedOnly) {
    result = result.filter(s => s.enabled && s.connected);
  }

  return result;
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
    quota_used_tokens: Number(row.quota_used_tokens),
    quota_unit: row.quota_unit || (row.provider === 'mammouth' || row.provider === 'openrouter' ? 'usd' : 'tokens'),
    current_balance: Number(row.current_balance ?? 0),
    max_balance: Number(row.max_balance ?? 0)
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
        quota_remaining_pct = ?, resets_at = ?, last_checked = ?, status_message = ?,
        quota_unit = ?, current_balance = ?, max_balance = ?
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
    merged.quota_unit || (merged.provider === 'mammouth' || merged.provider === 'openrouter' ? 'usd' : 'tokens'),
    merged.current_balance ?? 0,
    merged.max_balance ?? 0,
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
    const windowMs = sub.window_type === 'daily'
      ? 24 * 60 * 60 * 1000
      : (sub.window_type === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 5 * 60 * 60 * 1000);
    resetsAt = now + windowMs;
  }

  let statusMessage = sub.status_message;
  if (newRemainingPct <= 0) {
    statusMessage = `Quota exhausted. Resets on ${new Date(resetsAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${new Date(resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
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

export async function probeSubscriptionCredentials(): Promise<{
  claude: { available: boolean; method: string; details: string; quota_remaining_pct: number };
  codex: { available: boolean; method: string; details: string; quota_remaining_pct: number };
  gemini: { available: boolean; method: string; details: string; quota_remaining_pct: number };
  mammouth: { available: boolean; method: string; details: string; quota_remaining_pct: number; balance: number; budget: number };
  openrouter: { available: boolean; method: string; details: string; quota_remaining_pct: number; balance: number; budget: number };
  mistral?: { available: boolean; method: string; details: string; quota_remaining_pct: number };
  deepseek?: { available: boolean; method: string; details: string; quota_remaining_pct: number };
  anthropic?: { available: boolean; method: string; details: string; quota_remaining_pct: number };
  openai?: { available: boolean; method: string; details: string; quota_remaining_pct: number };
  vibe?: { available: boolean; method: string; details: string; quota_remaining_pct: number };
  gemini_cli?: { available: boolean; method: string; details: string; quota_remaining_pct: number };
}> {
  const homeDir = os.homedir();
  const now = Date.now();

  // 1. Claude Probe
  const currentClaude = getSubscription('claude_subscription');
  const isClaudeExhaustedWithActiveReset = Boolean(
    currentClaude &&
    currentClaude.resets_at &&
    currentClaude.resets_at > now &&
    currentClaude.quota_remaining_pct <= 0
  );

  let claudeAvailable = false;
  let claudeMethod = 'none';
  let claudeDetails = 'Claude CLI or session credentials not found';
  let claudePct = currentClaude ? currentClaude.quota_remaining_pct : 100.0;
  let claudeResetsAt = currentClaude ? currentClaude.resets_at : null;

  const claudeConfigPath = path.join(homeDir, '.claude.json');
  const claudeAltConfig = path.join(homeDir, '.config', 'claude', 'config.json');
  const hasLocalClaudeConfig = fs.existsSync(claudeConfigPath) || fs.existsSync(claudeAltConfig);

  let claudeCliFound = false;
  try {
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'where claude' : 'which claude';
    execSync(cmd, { stdio: 'ignore', timeout: 1500 });
    claudeCliFound = true;
  } catch (_) {}

  if (claudeCliFound) {
    try {
      const authOut = execSync('claude auth status', { encoding: 'utf8', timeout: 3000 });
      const authJson = JSON.parse(authOut.trim());
      if (authJson.loggedIn) {
        claudeAvailable = true;
        claudeMethod = authJson.authMethod || 'oauth_session';
        claudeDetails = `Authenticated session active (${claudeMethod})`;
      } else {
        claudeAvailable = hasLocalClaudeConfig;
        claudeMethod = 'local_session';
        claudeDetails = 'Claude session detected; OAuth token expired or logged out.';
      }
    } catch (_) {
      claudeAvailable = hasLocalClaudeConfig;
      claudeMethod = 'acp_cli';
      claudeDetails = hasLocalClaudeConfig ? 'Detected Claude profile in home directory' : 'Found Claude CLI binary';
    }
  } else if (hasLocalClaudeConfig) {
    claudeAvailable = true;
    claudeMethod = 'local_session';
    claudeDetails = 'Detected Claude config in home directory';
  }

  // Preserve active future reset date (e.g. October 17th weekly reset)
  if (isClaudeExhaustedWithActiveReset) {
    claudePct = 0.0;
    const resetDateStr = new Date(currentClaude!.resets_at!).toLocaleDateString([], { month: 'short', day: 'numeric' });
    claudeDetails = `Weekly allowance exhausted. Resets on ${resetDateStr}.`;
  }

  updateSubscription('claude_subscription', {
    connected: claudeAvailable,
    quota_remaining_pct: claudePct,
    resets_at: claudeResetsAt,
    status_message: isClaudeExhaustedWithActiveReset
      ? claudeDetails
      : (claudeAvailable ? `Connected (${claudeDetails})` : 'Claude CLI / credentials not detected')
  });

  // 2. OpenAI Codex Probe
  let codexAvailable = false;
  let codexMethod = 'none';
  let codexDetails = 'OpenAI Codex CLI or API key not found';
  const openaiKey = getSetting('OPENAI_API_KEY', config.openaiApiKey);
  const codexDir = path.join(homeDir, '.codex');
  const codexConfig = path.join(homeDir, '.codex', 'config.json');

  let codexCliFound = false;
  try {
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'where codex' : 'which codex';
    execSync(cmd, { stdio: 'ignore', timeout: 1500 });
    codexCliFound = true;
  } catch (_) {}

  if (openaiKey && openaiKey.trim()) {
    codexAvailable = true;
    codexMethod = 'api_key';
    codexDetails = 'Direct OpenAI API Key configured for fallback';
  } else if (fs.existsSync(codexConfig) || fs.existsSync(codexDir)) {
    codexAvailable = true;
    codexMethod = 'local_session';
    codexDetails = 'Detected ChatGPT Plus/Pro Codex credentials in home directory';
  } else if (codexCliFound) {
    codexAvailable = true;
    codexMethod = 'acp_cli';
    codexDetails = 'Found Codex CLI binary in system PATH';
  }

  const currentCodex = getSubscription('codex_subscription');
  updateSubscription('codex_subscription', {
    connected: codexAvailable,
    status_message: codexAvailable ? `Connected (${codexDetails})` : 'Codex CLI / API key not detected'
  });

  // 3. Google Gemini Free Tier Probe
  const geminiKey = getSetting('GEMINI_API_KEY', '');
  const geminiAvailable = Boolean(geminiKey && geminiKey.trim());
  const geminiMethod = geminiAvailable ? 'free_tier_key' : 'none';
  const geminiDetails = geminiAvailable
    ? 'Google AI Studio Free Tier (API key active, 15 RPM / 1M TPM)'
    : 'Google AI Studio Free Tier (API key not configured in settings)';

  const currentGemini = getSubscription('gemini_free');
  updateSubscription('gemini_free', {
    connected: geminiAvailable,
    status_message: geminiDetails
  });

  // 4. Mammouth AI Credit & Monthly Budget Probe
  let mammouthAvailable = false;
  let mammouthMethod = 'none';
  let mammouthDetails = 'Mammouth API Key is not configured';
  let mammouthPct = 0;
  let mammouthSpend = 0;
  let mammouthBudget = 0;
  let mammouthRemaining = 0;
  let mammouthResetsAt: number | null = null;

  const mammouthApiKey = getSetting('MAMMOUTH_API_KEY', config.mammouthApiKey);
  if (mammouthApiKey && mammouthApiKey.trim()) {
    mammouthMethod = 'api_key';
    try {
      const mRes = await fetch('https://api.mammouth.ai/user/info', {
        headers: { 'Authorization': `Bearer ${mammouthApiKey.trim()}` },
        signal: AbortSignal.timeout(5000)
      });

      if (mRes.ok) {
        mammouthAvailable = true;
        const mData: any = await mRes.json();
        const uInfo = mData.user_info || mData;
        mammouthSpend = Number(uInfo.spend ?? mData.spend ?? 0);
        mammouthBudget = Number(uInfo.max_budget ?? mData.max_budget ?? 0);
        mammouthRemaining = mammouthBudget > 0 ? Math.max(0, mammouthBudget - mammouthSpend) : 0;
        mammouthPct = mammouthBudget > 0 ? Math.max(0, Math.min(100, Math.round((mammouthRemaining / mammouthBudget) * 100))) : 0;
        const resetIso = uInfo.budget_reset_at ?? mData.budget_reset_at;
        if (resetIso) {
          mammouthResetsAt = new Date(resetIso).getTime();
        }
        const resetStr = mammouthResetsAt ? new Date(mammouthResetsAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '01 Nov';

        if (mammouthSpend >= mammouthBudget && mammouthBudget > 0) {
          markProviderBudgetExceeded('mammouth');
          mammouthDetails = `Monthly budget exceeded: $${mammouthSpend.toFixed(2)} spent of $${mammouthBudget.toFixed(2)} budget. Resets ${resetStr}.`;
        } else {
          clearProviderBudgetExceeded('mammouth');
          mammouthDetails = `$${mammouthRemaining.toFixed(2)} budget remaining ($${mammouthSpend.toFixed(2)} spent of $${mammouthBudget.toFixed(2)}). Resets ${resetStr}.`;
        }
      } else if (mRes.status === 401) {
        mammouthDetails = 'Invalid Mammouth API Key (401 Unauthorized)';
      } else {
        mammouthDetails = `Mammouth account query returned HTTP ${mRes.status}`;
      }
    } catch (err: any) {
      mammouthDetails = `Failed to probe Mammouth balance: ${err.message}`;
    }
  }

  updateSubscription('mammouth_credit', {
    connected: mammouthAvailable,
    quota_remaining_pct: mammouthPct,
    current_balance: mammouthRemaining,
    max_balance: mammouthBudget,
    quota_total_tokens: Math.round(mammouthBudget * 100),
    quota_used_tokens: Math.round(mammouthSpend * 100),
    resets_at: mammouthResetsAt,
    quota_unit: 'usd',
    status_message: mammouthDetails
  });

  // 5. OpenRouter Prepaid Credits Probe
  let openrouterAvailable = false;
  let openrouterMethod = 'none';
  let openrouterDetails = 'OpenRouter API Key is not configured';
  let openrouterPct = 0;
  let openrouterBalance = 0;
  let openrouterTotal = 0;
  let openrouterUsage = 0;

  const openrouterApiKey = getSetting('OPENROUTER_API_KEY', config.openrouterApiKey);
  if (openrouterApiKey && openrouterApiKey.trim()) {
    openrouterMethod = 'api_key';
    try {
      const orRes = await fetch('https://openrouter.ai/api/v1/credits', {
        headers: { 'Authorization': `Bearer ${openrouterApiKey.trim()}` },
        signal: AbortSignal.timeout(5000)
      });

      if (orRes.ok) {
        openrouterAvailable = true;
        const orData: any = await orRes.json();
        const creds = orData.data || orData;
        openrouterTotal = Number(creds.total_credits || 0);
        openrouterUsage = Number(creds.total_usage || 0);
        openrouterBalance = Math.max(0, openrouterTotal - openrouterUsage);
        openrouterPct = openrouterTotal > 0 ? Math.max(0, Math.min(100, Math.round((openrouterBalance / openrouterTotal) * 100))) : 0;

        if (openrouterUsage >= openrouterTotal) {
          markProviderBudgetExceeded('openrouter');
          openrouterDetails = `Credits exhausted: $0.00 left ($${openrouterUsage.toFixed(2)} used of $${openrouterTotal.toFixed(2)} credits).`;
        } else {
          clearProviderBudgetExceeded('openrouter');
          openrouterDetails = `$${openrouterBalance.toFixed(2)} credits remaining ($${openrouterUsage.toFixed(2)} used of $${openrouterTotal.toFixed(2)}).`;
        }
      } else if (orRes.status === 401) {
        openrouterDetails = 'Invalid OpenRouter API Key (401 Unauthorized)';
      } else {
        openrouterDetails = `OpenRouter credits query returned HTTP ${orRes.status}`;
      }
    } catch (err: any) {
      openrouterDetails = `Failed to probe OpenRouter balance: ${err.message}`;
    }
  }

  updateSubscription('openrouter_credit', {
    connected: openrouterAvailable,
    quota_remaining_pct: openrouterPct,
    current_balance: openrouterBalance,
    max_balance: openrouterTotal,
    quota_total_tokens: Math.round(openrouterTotal * 100),
    quota_used_tokens: Math.round(openrouterUsage * 100),
    resets_at: null,
    quota_unit: 'usd',
    status_message: openrouterDetails
  });

  // 6. Mistral AI Direct Probe
  let mistralAvailable = false;
  let mistralMethod = 'none';
  let mistralDetails = 'Mistral API Key is not configured';
  let mistralModelCount = 0;

  const mistralApiKey = getSetting('MISTRAL_API_KEY', config.mistralApiKey);
  if (mistralApiKey && mistralApiKey.trim()) {
    mistralMethod = 'api_key';
    try {
      const mRes = await fetch('https://api.mistral.ai/v1/models', {
        headers: { 'Authorization': `Bearer ${mistralApiKey.trim()}` },
        signal: AbortSignal.timeout(5000)
      });

      if (mRes.ok) {
        mistralAvailable = true;
        const mData: any = await mRes.json();
        mistralModelCount = Array.isArray(mData.data) ? mData.data.length : 0;
        mistralDetails = `Direct EU Sovereign API connected (${mistralModelCount} models available, e.g. Codestral, Mistral Large)`;
      } else if (mRes.status === 401) {
        mistralDetails = 'Invalid Mistral API Key (401 Unauthorized)';
      } else {
        mistralDetails = `Mistral API returned HTTP ${mRes.status}`;
      }
    } catch (err: any) {
      mistralDetails = `Failed to probe Mistral: ${err.message}`;
    }
  }

  const mistralUsage = getProviderUsageStats('mistral');
  updateSubscription('mistral_direct', {
    connected: mistralAvailable,
    quota_used_tokens: mistralUsage.totalTokens,
    current_balance: mistralUsage.totalCost,
    status_message: mistralDetails
  });

  // 7. DeepSeek Direct Probe
  let deepseekAvailable = false;
  let deepseekMethod = 'none';
  let deepseekDetails = 'DeepSeek API Key is not configured';

  const deepseekApiKey = getSetting('DEEPSEEK_API_KEY', config.deepseekApiKey);
  if (deepseekApiKey && deepseekApiKey.trim()) {
    deepseekMethod = 'api_key';
    try {
      const dsRes = await fetch('https://api.deepseek.com/models', {
        headers: { 'Authorization': `Bearer ${deepseekApiKey.trim()}` },
        signal: AbortSignal.timeout(5000)
      });

      if (dsRes.ok) {
        deepseekAvailable = true;
        deepseekDetails = 'Direct DeepSeek API connected (R1 & V3 active)';
      } else if (dsRes.status === 401) {
        deepseekDetails = 'Invalid DeepSeek API Key (401 Unauthorized)';
      } else {
        deepseekDetails = `DeepSeek API returned HTTP ${dsRes.status}`;
      }
    } catch (err: any) {
      deepseekDetails = `Failed to probe DeepSeek: ${err.message}`;
    }
  }

  const deepseekUsage = getProviderUsageStats('deepseek');
  updateSubscription('deepseek_direct', {
    connected: deepseekAvailable,
    quota_used_tokens: deepseekUsage.totalTokens,
    current_balance: deepseekUsage.totalCost,
    status_message: deepseekDetails
  });

  // 8. Anthropic Direct API Key Probe
  let antDirectAvailable = false;
  let antDirectMethod = 'none';
  let antDirectDetails = 'Anthropic Direct API Key is not configured';

  const antDirectKey = getSetting('ANTHROPIC_API_KEY', config.anthropicApiKey);
  if (antDirectKey && antDirectKey.trim()) {
    antDirectMethod = 'api_key';
    try {
      const antRes = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': antDirectKey.trim(),
          'anthropic-version': '2023-06-01'
        },
        signal: AbortSignal.timeout(5000)
      });
      if (antRes.ok) {
        antDirectAvailable = true;
        antDirectDetails = 'Direct Anthropic API connected (Claude 3.5 & Fable active)';
      } else if (antRes.status === 401) {
        antDirectDetails = 'Invalid Anthropic API Key (401 Unauthorized)';
      } else {
        antDirectDetails = `Anthropic API returned HTTP ${antRes.status}`;
      }
    } catch (err: any) {
      antDirectDetails = `Failed to probe Anthropic: ${err.message}`;
    }
  }

  const antDirectUsage = getProviderUsageStats('anthropic');
  updateSubscription('anthropic_direct', {
    connected: antDirectAvailable,
    quota_used_tokens: antDirectUsage.totalTokens,
    current_balance: antDirectUsage.totalCost,
    status_message: antDirectDetails
  });

  // 9. OpenAI Direct API Key Probe
  let oaiDirectAvailable = false;
  let oaiDirectMethod = 'none';
  let oaiDirectDetails = 'OpenAI Direct API Key is not configured';

  const oaiDirectKey = getSetting('OPENAI_API_KEY', config.openaiApiKey);
  if (oaiDirectKey && oaiDirectKey.trim()) {
    oaiDirectMethod = 'api_key';
    try {
      const oaiRes = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${oaiDirectKey.trim()}` },
        signal: AbortSignal.timeout(5000)
      });
      if (oaiRes.ok) {
        oaiDirectAvailable = true;
        oaiDirectDetails = 'Direct OpenAI API connected (GPT-4o & o-series active)';
      } else if (oaiRes.status === 401) {
        oaiDirectDetails = 'Invalid OpenAI API Key (401 Unauthorized)';
      } else {
        oaiDirectDetails = `OpenAI API returned HTTP ${oaiRes.status}`;
      }
    } catch (err: any) {
      oaiDirectDetails = `Failed to probe OpenAI: ${err.message}`;
    }
  }

  const oaiDirectUsage = getProviderUsageStats('openai');
  updateSubscription('openai_direct', {
    connected: oaiDirectAvailable,
    quota_used_tokens: oaiDirectUsage.totalTokens,
    current_balance: oaiDirectUsage.totalCost,
    status_message: oaiDirectDetails
  });

  // 10. Mistral Vibe ACP CLI Probe
  let vibeAvailable = false;
  let vibeMethod = 'none';
  let vibeDetails = 'Mistral Vibe CLI (vibe / vibe-acp) not found';
  let vibeBin = 'vibe';

  for (const bin of ['vibe', 'vibe-acp', 'mistral-vibe']) {
    try {
      const isWin = process.platform === 'win32';
      const cmd = isWin ? `where ${bin}` : `which ${bin}`;
      execSync(cmd, { stdio: 'ignore', timeout: 1500 });
      vibeAvailable = true;
      vibeBin = bin;
      vibeMethod = 'acp_cli';
      vibeDetails = `Found ${bin} CLI binary in system PATH`;
      break;
    } catch (_) {}
  }

  const vibeHome = path.join(homeDir, '.vibe');
  const vibeConfig = path.join(homeDir, '.vibe', 'config.toml');
  if (!vibeAvailable && (fs.existsSync(vibeConfig) || fs.existsSync(vibeHome))) {
    vibeAvailable = true;
    vibeMethod = 'local_session';
    vibeDetails = 'Detected Mistral Vibe profile in home directory';
  } else if (!vibeAvailable && mistralApiKey && mistralApiKey.trim()) {
    vibeAvailable = true;
    vibeMethod = 'api_key_bridge';
    vibeDetails = 'Ready for Mistral Vibe ACP (using active Mistral API key)';
  }

  const currentVibe = getSubscription('mistral_vibe');
  updateSubscription('mistral_vibe', {
    connected: vibeAvailable,
    cli_path: vibeBin,
    status_message: vibeAvailable ? `Connected (${vibeDetails})` : 'Mistral Vibe CLI (vibe) not detected'
  });

  // 11. Google Gemini CLI ACP Probe
  let geminiCliAvailable = false;
  let geminiCliMethod = 'none';
  let geminiCliDetails = 'Gemini CLI (gemini / gemini-cli) not found';
  let geminiBin = 'gemini';

  for (const bin of ['gemini', 'gemini-cli']) {
    try {
      const isWin = process.platform === 'win32';
      const cmd = isWin ? `where ${bin}` : `which ${bin}`;
      execSync(cmd, { stdio: 'ignore', timeout: 1500 });
      geminiCliAvailable = true;
      geminiBin = bin;
      geminiCliMethod = 'acp_cli';
      geminiCliDetails = `Found ${bin} CLI binary in system PATH`;
      break;
    } catch (_) {}
  }

  const geminiHome = path.join(homeDir, '.gemini');
  const geminiConfig = path.join(homeDir, '.gemini', 'settings.json');
  const geminiCliKey = getSetting('GEMINI_API_KEY', config.geminiApiKey);
  if (!geminiCliAvailable && (fs.existsSync(geminiConfig) || fs.existsSync(geminiHome))) {
    geminiCliAvailable = true;
    geminiCliMethod = 'local_session';
    geminiCliDetails = 'Detected Gemini CLI profile in home directory';
  } else if (!geminiCliAvailable && geminiCliKey && geminiCliKey.trim()) {
    geminiCliAvailable = true;
    geminiCliMethod = 'api_key_bridge';
    geminiCliDetails = 'Ready for Gemini CLI ACP (using active Gemini API key)';
  }

  const currentGeminiCli = getSubscription('gemini_cli');
  updateSubscription('gemini_cli', {
    connected: geminiCliAvailable,
    cli_path: geminiBin,
    status_message: geminiCliAvailable ? `Connected (${geminiCliDetails})` : 'Gemini CLI (gemini) not detected'
  });

  return {
    claude: { available: claudeAvailable, method: claudeMethod, details: claudeDetails, quota_remaining_pct: claudePct },
    codex: { available: codexAvailable, method: codexMethod, details: codexDetails, quota_remaining_pct: currentCodex?.quota_remaining_pct ?? 100.0 },
    gemini: { available: geminiAvailable, method: geminiMethod, details: geminiDetails, quota_remaining_pct: currentGemini?.quota_remaining_pct ?? 100.0 },
    mammouth: { available: mammouthAvailable, method: mammouthMethod, details: mammouthDetails, quota_remaining_pct: mammouthPct, balance: mammouthRemaining, budget: mammouthBudget },
    openrouter: { available: openrouterAvailable, method: openrouterMethod, details: openrouterDetails, quota_remaining_pct: openrouterPct, balance: openrouterBalance, budget: openrouterTotal },
    mistral: { available: mistralAvailable, method: mistralMethod, details: mistralDetails, quota_remaining_pct: 100.0 },
    deepseek: { available: deepseekAvailable, method: deepseekMethod, details: deepseekDetails, quota_remaining_pct: 100.0 },
    anthropic: { available: antDirectAvailable, method: antDirectMethod, details: antDirectDetails, quota_remaining_pct: 100.0 },
    openai: { available: oaiDirectAvailable, method: oaiDirectMethod, details: oaiDirectDetails, quota_remaining_pct: 100.0 },
    vibe: { available: vibeAvailable, method: vibeMethod, details: vibeDetails, quota_remaining_pct: currentVibe?.quota_remaining_pct ?? 100.0 },
    gemini_cli: { available: geminiCliAvailable, method: geminiCliMethod, details: geminiCliDetails, quota_remaining_pct: currentGeminiCli?.quota_remaining_pct ?? 100.0 }
  };
}
