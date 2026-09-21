import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.resolve(process.cwd(), 'prompt_router.db');
export const db = new DatabaseSync(DB_PATH);

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
      prompt_preview TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests_log(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_requests_model ON requests_log(model_routed);
    CREATE INDEX IF NOT EXISTS idx_requests_provider ON requests_log(provider_used);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
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
}

export function logRequest(entry: RequestLogEntry) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO requests_log (
      id, client_agent, model_requested, model_routed, provider_used,
      jev_intent, jev_complexity, jev_confidence, jev_needs_reasoner,
      prompt_tokens, completion_tokens, total_tokens, duration_ms, jev_duration_ms,
      cost_jev, cost_actual, cost_if_claude, cost_if_gpt4o, savings_vs_claude, prompt_preview
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
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
    entry.prompt_preview
  );
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
