import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.resolve(process.cwd(), 'prompt_router.db');
export const db = new DatabaseSync(DB_PATH);

// Enable WAL mode and busy timeout for high-concurrency non-blocking access
try {
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
} catch (_) {}

// Initialize schema
export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS requests_log (
      id TEXT PRIMARY KEY,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      client_agent TEXT,
      model_requested TEXT,
      model_routed TEXT,
      provider_used TEXT,
      jev_intent TEXT,
      jev_complexity REAL,
      jev_confidence REAL,
      jev_needs_reasoner REAL,
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      duration_ms INTEGER DEFAULT 0,
      jev_duration_ms INTEGER DEFAULT 0,
      cost_jev REAL DEFAULT 0.0,
      cost_actual REAL DEFAULT 0.0,
      cost_if_claude REAL DEFAULT 0.0,
      cost_if_gpt4o REAL DEFAULT 0.0,
      savings_vs_claude REAL DEFAULT 0.0,
      prompt_preview TEXT,
      routing_reason TEXT,
      response_preview TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests_log(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_requests_model ON requests_log(model_routed);
    CREATE INDEX IF NOT EXISTS idx_requests_provider ON requests_log(provider_used);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS models_catalog (
      id TEXT PRIMARY KEY,
      name TEXT,
      description TEXT,
      provider TEXT,
      prompt_price REAL DEFAULT 0.0,
      completion_price REAL DEFAULT 0.0,
      context_length INTEGER DEFAULT 0,
      supports_reasoning BOOLEAN DEFAULT 0,
      tier TEXT DEFAULT 'balanced',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_catalog_tier ON models_catalog(tier);
    CREATE INDEX IF NOT EXISTS idx_catalog_provider ON models_catalog(provider);

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

  // Safe incremental schema migrations
  try { db.exec('ALTER TABLE requests_log ADD COLUMN routing_reason TEXT;'); } catch (_) {}
  try { db.exec('ALTER TABLE requests_log ADD COLUMN response_preview TEXT;'); } catch (_) {}
}

export interface RequestLogEntry {
  id: string;
  client_agent: string;
  model_requested: string;
  model_routed: string;
  provider_used: string;
  jev_intent: string;
  jev_complexity: number;
  jev_confidence: number;
  jev_needs_reasoner: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  duration_ms: number;
  jev_duration_ms: number;
  cost_jev: number;
  cost_actual: number;
  cost_if_claude: number;
  cost_if_gpt4o: number;
  savings_vs_claude: number;
  prompt_preview: string;
  routing_reason?: string;
  response_preview?: string;
}

export function logRequest(entry: RequestLogEntry) {
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO requests_log (
        id, client_agent, model_requested, model_routed, provider_used,
        jev_intent, jev_complexity, jev_confidence, jev_needs_reasoner,
        prompt_tokens, completion_tokens, total_tokens, duration_ms, jev_duration_ms,
        cost_jev, cost_actual, cost_if_claude, cost_if_gpt4o, savings_vs_claude, prompt_preview,
        routing_reason, response_preview
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?
      )
    `);

    stmt.run(
      entry.id,
      entry.client_agent,
      entry.model_requested,
      entry.model_routed,
      entry.provider_used,
      entry.jev_intent,
      entry.jev_complexity,
      entry.jev_confidence,
      entry.jev_needs_reasoner,
      entry.prompt_tokens,
      entry.completion_tokens,
      entry.total_tokens,
      entry.duration_ms,
      entry.jev_duration_ms,
      entry.cost_jev,
      entry.cost_actual,
      entry.cost_if_claude,
      entry.cost_if_gpt4o,
      entry.savings_vs_claude,
      entry.prompt_preview,
      entry.routing_reason || '',
      entry.response_preview || ''
    );
  } catch (err: any) {
    console.warn('[DB] Non-blocking warning: Failed to record request log:', err.message);
  }
}

export function getMetrics() {
  const overall = db.prepare(`
    SELECT
      COUNT(*) AS total_requests,
      COALESCE(SUM(prompt_tokens), 0) AS total_prompt_tokens,
      COALESCE(SUM(completion_tokens), 0) AS total_completion_tokens,
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COALESCE(SUM(cost_actual), 0) AS total_actual_cost,
      COALESCE(SUM(cost_if_claude), 0) AS total_claude_cost,
      COALESCE(SUM(cost_if_gpt4o), 0) AS total_gpt4o_cost,
      COALESCE(SUM(savings_vs_claude), 0) AS total_savings_claude,
      COALESCE(AVG(duration_ms), 0) AS avg_duration_ms,
      COALESCE(AVG(jev_duration_ms), 0) AS avg_jev_duration_ms
    FROM requests_log
  `).all()[0] as any;

  const modelBreakdown = db.prepare(`
    SELECT
      model_routed,
      provider_used,
      COUNT(*) AS count,
      COALESCE(SUM(total_tokens), 0) AS tokens,
      COALESCE(SUM(cost_actual), 0) AS cost
    FROM requests_log
    GROUP BY model_routed, provider_used
    ORDER BY count DESC
  `).all();

  const intentBreakdown = db.prepare(`
    SELECT
      jev_intent,
      COUNT(*) AS count,
      COALESCE(AVG(jev_complexity), 0) AS avg_complexity
    FROM requests_log
    GROUP BY jev_intent
    ORDER BY count DESC
  `).all();

  const clientBreakdown = db.prepare(`
    SELECT
      client_agent,
      COUNT(*) AS count
    FROM requests_log
    GROUP BY client_agent
    ORDER BY count DESC
  `).all();

  return {
    overall,
    modelBreakdown,
    intentBreakdown,
    clientBreakdown
  };
}

export function getRecentLogs(limit = 50, offset = 0) {
  return db.prepare(`
    SELECT * FROM requests_log
    ORDER BY timestamp DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
}

export function getSetting(key: string, defaultValue = ''): string {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).all(key)[0] as any;
  return row ? row.value : defaultValue;
}

export function setSetting(key: string, value: string) {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(key, value);
}

export interface ReportFilters {
  timeframe?: string;
  model?: string;
  provider?: string;
  intent?: string;
  client?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export function getDetailedReport(filters: ReportFilters = {}) {
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters.timeframe === 'today') {
    conditions.push("date(timestamp) = date('now')");
  } else if (filters.timeframe === '24h') {
    conditions.push("timestamp >= datetime('now', '-24 hours')");
  } else if (filters.timeframe === '7d') {
    conditions.push("timestamp >= datetime('now', '-7 days')");
  } else if (filters.timeframe === '30d') {
    conditions.push("timestamp >= datetime('now', '-30 days')");
  }

  if (filters.model && filters.model !== 'all') {
    conditions.push('model_routed = ?');
    params.push(filters.model);
  }

  if (filters.provider && filters.provider !== 'all') {
    conditions.push('provider_used = ?');
    params.push(filters.provider);
  }

  if (filters.intent && filters.intent !== 'all') {
    conditions.push('jev_intent = ?');
    params.push(filters.intent);
  }

  if (filters.client && filters.client !== 'all') {
    conditions.push('client_agent = ?');
    params.push(filters.client);
  }

  if (filters.search && filters.search.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push('(prompt_preview LIKE ? OR model_routed LIKE ? OR routing_reason LIKE ? OR id LIKE ?)');
    params.push(term, term, term, term);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // 1. Overall Summary
  const summaryStmt = db.prepare(`
    SELECT
      COUNT(*) AS total_requests,
      COALESCE(SUM(prompt_tokens), 0) AS total_prompt_tokens,
      COALESCE(SUM(completion_tokens), 0) AS total_completion_tokens,
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COALESCE(SUM(cost_actual), 0) AS total_actual_cost,
      COALESCE(SUM(cost_if_claude), 0) AS total_claude_cost,
      COALESCE(SUM(cost_if_gpt4o), 0) AS total_gpt4o_cost,
      COALESCE(SUM(savings_vs_claude), 0) AS total_savings_claude,
      COALESCE(AVG(duration_ms), 0) AS avg_duration_ms,
      COALESCE(AVG(jev_duration_ms), 0) AS avg_jev_duration_ms
    FROM requests_log
    ${whereClause}
  `);
  const summary = (params.length > 0 ? summaryStmt.all(...params)[0] : summaryStmt.all()[0]) as any;

  // 2. Model Breakdown
  const modelStmt = db.prepare(`
    SELECT
      model_routed,
      provider_used,
      COUNT(*) AS count,
      COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
      COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COALESCE(SUM(cost_actual), 0) AS cost_actual,
      COALESCE(SUM(cost_if_claude), 0) AS cost_claude,
      COALESCE(SUM(savings_vs_claude), 0) AS savings,
      COALESCE(AVG(duration_ms), 0) AS avg_duration_ms
    FROM requests_log
    ${whereClause}
    GROUP BY model_routed, provider_used
    ORDER BY count DESC
  `);
  const modelBreakdown = params.length > 0 ? modelStmt.all(...params) : modelStmt.all();

  // 3. Provider Breakdown
  const providerStmt = db.prepare(`
    SELECT
      provider_used,
      COUNT(*) AS count,
      COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
      COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COALESCE(SUM(cost_actual), 0) AS cost_actual,
      COALESCE(SUM(savings_vs_claude), 0) AS savings,
      COALESCE(AVG(duration_ms), 0) AS avg_duration_ms
    FROM requests_log
    ${whereClause}
    GROUP BY provider_used
    ORDER BY count DESC
  `);
  const providerBreakdown = params.length > 0 ? providerStmt.all(...params) : providerStmt.all();

  // 4. Intent Breakdown
  const intentStmt = db.prepare(`
    SELECT
      jev_intent,
      COUNT(*) AS count,
      COALESCE(AVG(jev_complexity), 0) AS avg_complexity,
      COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
      COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COALESCE(SUM(cost_actual), 0) AS cost_actual,
      COALESCE(SUM(savings_vs_claude), 0) AS savings
    FROM requests_log
    ${whereClause}
    GROUP BY jev_intent
    ORDER BY count DESC
  `);
  const intentBreakdown = params.length > 0 ? intentStmt.all(...params) : intentStmt.all();

  // 5. Total count for pagination
  const countStmt = db.prepare(`
    SELECT COUNT(*) AS total FROM requests_log
    ${whereClause}
  `);
  const countResult = (params.length > 0 ? countStmt.all(...params)[0] : countStmt.all()[0]) as any;
  const totalCount = countResult ? Number(countResult.total) : 0;

  // 6. Paginated logs
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 1000);
  const offset = Math.max(Number(filters.offset) || 0, 0);

  const logsStmt = db.prepare(`
    SELECT * FROM requests_log
    ${whereClause}
    ORDER BY timestamp DESC
    LIMIT ? OFFSET ?
  `);
  const logs = logsStmt.all(...params, limit, offset);

  // 7. Filter Options
  const modelsList = db.prepare(`SELECT DISTINCT model_routed FROM requests_log WHERE model_routed IS NOT NULL AND model_routed != '' ORDER BY model_routed ASC`).all().map((r: any) => r.model_routed);
  const providersList = db.prepare(`SELECT DISTINCT provider_used FROM requests_log WHERE provider_used IS NOT NULL AND provider_used != '' ORDER BY provider_used ASC`).all().map((r: any) => r.provider_used);
  const intentsList = db.prepare(`SELECT DISTINCT jev_intent FROM requests_log WHERE jev_intent IS NOT NULL AND jev_intent != '' ORDER BY jev_intent ASC`).all().map((r: any) => r.jev_intent);
  const clientsList = db.prepare(`SELECT DISTINCT client_agent FROM requests_log WHERE client_agent IS NOT NULL AND client_agent != '' ORDER BY client_agent ASC`).all().map((r: any) => r.client_agent);

  return {
    summary,
    modelBreakdown,
    providerBreakdown,
    intentBreakdown,
    logs,
    pagination: {
      total: totalCount,
      limit,
      offset
    },
    filterOptions: {
      models: modelsList,
      providers: providersList,
      intents: intentsList,
      clients: clientsList
    }
  };
}

export function getLogById(id: string) {
  const row = db.prepare('SELECT * FROM requests_log WHERE id = ?').all(id)[0] as any;
  return row || null;
}
