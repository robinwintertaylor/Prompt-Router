import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { initDatabase } from './db.js';
import { loadCatalogFromDb, syncCatalog } from './catalog.js';
import { handleChatCompletions } from './routes/completions.js';
import { handleListModels, handleGetModel } from './routes/models.js';
import {
  handleGetMetrics,
  handleGetLogs,
  handleTestRoute,
  handleGetSettings,
  handleUpdateSettings,
  handleGetCatalog,
  handleSyncCatalog,
  handleTelemetryStream,
  handleGetArbitrage
} from './routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize DB schema
initDatabase();
// Process crash guards
process.on('uncaughtException', (err) => {
  console.error('🚨 [Server Error] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 [Server Error] Unhandled Rejection at:', promise, 'reason:', reason);
});


// Load cached catalog from DB and kick off background sync with OpenRouter & Mammouth
loadCatalogFromDb();
syncCatalog().catch(err => console.warn('[Catalog] Initial sync background notice:', err.message));

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Global incoming request logger
app.use((req, res, next) => {
  const ua = req.headers['user-agent'] || 'unknown';
  console.log(`📡 [Incoming] ${req.method} ${req.url} (Client: ${ua})`);
  next();
});

// Serve static assets for optics dashboard
const publicDir = path.resolve(__dirname, '../public');
app.use(express.static(publicDir));

// Health check
app.get(['/health', '/v1/health'], (req, res) => {
  res.json({
    status: 'ok',
    service: 'prompt-router',
    evaluator: 'TypeSafe Jev System One',
    version: '1.0.0'
  });
});

// OpenAI Protocol Endpoints
app.post(['/v1/chat/completions', '/chat/completions'], handleChatCompletions);
app.get(['/v1/models', '/models'], handleListModels);
app.get(['/v1/models/:model', '/models/:model'], handleGetModel);
app.get(['/v1/models/:vendor/:model', '/models/:vendor/:model'], handleGetModel);

// Dashboard Optics APIs
app.get('/api/metrics', handleGetMetrics);
app.get('/api/telemetry/stream', handleTelemetryStream);
app.get('/api/arbitrage', handleGetArbitrage);
app.get('/api/logs', handleGetLogs);
app.post('/api/test-route', handleTestRoute);
app.get('/api/settings', handleGetSettings);
app.post('/api/settings', handleUpdateSettings);
app.get('/api/catalog', handleGetCatalog);
app.post('/api/catalog/sync', handleSyncCatalog);

// Dashboard fallback
app.get(['/', '/dashboard'], (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Start server
app.listen(config.port, config.host, () => {
  console.log(`
=============================================================
  PROMPT-ROUTER (TypeSafe Jev Powered LLM Gateway)
=============================================================
  • Dashboard & Optics:   http://localhost:${config.port}/
  • OpenAI API Base URL:  http://localhost:${config.port}/v1
  • Evaluator Model:      Jev System One (api.typesafe.ai)
  • Downstream Providers: Mammouth AI & OpenRouter
  • Models Catalog:       Dynamic Auto-Syncing (400+ models)
  • Database:             SQLite (node:sqlite)
=============================================================
  Ready for Goose, Claude Code, Cursor, VS Code, Anti-Gravity!
=============================================================
  `);
});

