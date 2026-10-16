import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { db, getSetting } from './db.js';
import { config } from './config.js';
import { markProviderBudgetExceeded, clearProviderBudgetExceeded } from './arbitrage.js';

export interface SubscriptionRecord {
  id: string; // 'claude_subscription' | 'codex_subscription' | 'gemini_free' | 'mammouth_credit' | 'openrouter_credit'
  provider: 'anthropic' | 'openai' | 'google' | 'mammouth' | 'openrouter';
  name: string;
  enabled: boolean;
  connected: boolean;
  auth_type: 'acp_cli' | 'oauth_session' | 'free_tier_key' | 'api_key';
  cli_path: string;
  session_token: string;
  window_type: '5h_rolling' | 'daily' | 'weekly' | 'monthly' | 'credit_balance';
  quota_total_tokens: number;
  quota_used_tokens: number;
  quota_remaining_pct: number;
  resets_at: number | null; // epoch ms
  last_checked: number;
  status_message: string;
  quota_unit?: 'tokens' | 'usd';
  current_balance?: number; // USD remaining for aggregators
  max_balance?: number; // USD total budget/credit for aggregators
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

export function getAllSubscriptions(): SubscriptionRecord[] {
  resetExpiredSubscriptionQuotas();
  const rows = db.prepare('SELECT * FROM subscriptions').all() as any[];
  return rows.map(r => ({
    ...r,
    enabled: Boolean(r.enabled),
    connected: Boolean(r.connected),
    quota_remaining_pct: Number(r.quota_remaining_pct),
    quota_total_tokens: Number(r.quota_total_tokens),
    quota_used_tokens: Number(r.quota_used_tokens),
    quota_unit: r.quota_unit || (r.provider === 'mammouth' || r.provider === 'openrouter' ? 'usd' : 'tokens'),
    current_balance: Number(r.current_balance ?? 0),
    max_balance: Number(r.max_balance ?? 0)
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

  return {
    claude: { available: claudeAvailable, method: claudeMethod, details: claudeDetails, quota_remaining_pct: claudePct },
    codex: { available: codexAvailable, method: codexMethod, details: codexDetails, quota_remaining_pct: currentCodex?.quota_remaining_pct ?? 100.0 },
    gemini: { available: geminiAvailable, method: geminiMethod, details: geminiDetails, quota_remaining_pct: currentGemini?.quota_remaining_pct ?? 100.0 },
    mammouth: { available: mammouthAvailable, method: mammouthMethod, details: mammouthDetails, quota_remaining_pct: mammouthPct, balance: mammouthRemaining, budget: mammouthBudget },
    openrouter: { available: openrouterAvailable, method: openrouterMethod, details: openrouterDetails, quota_remaining_pct: openrouterPct, balance: openrouterBalance, budget: openrouterTotal }
  };
}
