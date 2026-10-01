import { Request, Response } from 'express';
import crypto from 'crypto';
import { getMetrics, getRecentLogs, getSetting, setSetting, getDetailedReport, getLogById, ReportFilters } from '../db.js';
import { evaluateWithJev } from '../jev.js';
import { selectOptimalModel, executeRoutedCompletion } from '../router.js';
import { calculateCosts } from '../pricing.js';
import { config } from '../config.js';
import { getAllCatalogModels, syncCatalog } from '../catalog.js';
import { addTelemetryClient, removeTelemetryClient } from '../telemetry.js';
import { getArbitrageStatus } from '../arbitrage.js';
import { recordAndBroadcastRequest } from './completions.js';
import { getAllSubscriptions, getSubscription, updateSubscription, probeSubscriptionCredentials } from '../subscriptions.js';

export function getFormattedMetrics() {
  const data = getMetrics();
  const overall = data.overall || {};

  const totalActual = Number(overall.total_actual_cost || 0);
  const totalClaude = Number(overall.total_claude_cost || 0);
  const totalGpt4o = Number(overall.total_gpt4o_cost || 0);
  const totalSavings = Number(overall.total_savings_claude || 0);

  const percentSavedClaude = totalClaude > 0
    ? Math.max(0, Math.round(((totalClaude - totalActual) / totalClaude) * 100))
    : 0;

  const percentSavedGpt4o = totalGpt4o > 0
    ? Math.max(0, Math.round(((totalGpt4o - totalActual) / totalGpt4o) * 100))
    : 0;

  return {
    summary: {
      totalRequests: Number(overall.total_requests || 0),
      totalPromptTokens: Number(overall.total_prompt_tokens || 0),
      totalCompletionTokens: Number(overall.total_completion_tokens || 0),
      totalTokens: Number(overall.total_tokens || 0),
      totalActualCost: totalActual,
      totalClaudeCost: totalClaude,
      totalGpt4oCost: totalGpt4o,
      totalSavingsVsClaude: totalSavings,
      percentSavedClaude,
      percentSavedGpt4o,
      avgDurationMs: Math.round(Number(overall.avg_duration_ms || 0)),
      avgJevDurationMs: Math.round(Number(overall.avg_jev_duration_ms || 0))
    },
    modelBreakdown: data.modelBreakdown,
    intentBreakdown: data.intentBreakdown,
    clientBreakdown: data.clientBreakdown,
    subscriptions: getAllSubscriptions()
  };
}

export function handleGetMetrics(req: Request, res: Response) {
  try {
    res.json(getFormattedMetrics());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export function handleTelemetryStream(req: Request, res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const clientId = 'client-' + Math.random().toString(36).slice(2, 9);
  addTelemetryClient(clientId, res);

  // Initial state push
  try {
    const initialPayload = {
      metrics: getFormattedMetrics(),
      arbitrage: getArbitrageStatus()
    };
    res.write(`event: initial_state\ndata: ${JSON.stringify(initialPayload)}\n\n`);
  } catch (err) {
    console.warn('[Telemetry] Error sending initial state to client:', err);
  }

  // Heartbeat ping every 15s to keep connection alive through reverse proxies
  const pingInterval = setInterval(() => {
    try {
      if (res.writable && !res.writableEnded) {
        res.write(': ping\n\n');
      } else {
        clearInterval(pingInterval);
        removeTelemetryClient(clientId);
      }
    } catch {
      clearInterval(pingInterval);
      removeTelemetryClient(clientId);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(pingInterval);
    removeTelemetryClient(clientId);
  });
}

export function handleGetArbitrage(req: Request, res: Response) {
  res.json(getArbitrageStatus());
}

export function handleGetLogs(req: Request, res: Response) {
  try {
    const limit = parseInt((req.query.limit as string) || '50', 10);
    const offset = parseInt((req.query.offset as string) || '0', 10);
    const logs = getRecentLogs(limit, offset);
    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleTestRoute(req: Request, res: Response) {
  try {
    const prompt = req.body.prompt || 'Hello world';
    const messages = [{ role: 'user', content: prompt }];

    // 1. Evaluate with TypeSafe Jev System One
    const jev = await evaluateWithJev(messages);

    // 2. Execute routed completion using Jev's evaluation across aggregators
    const { providerResponse, selectedModel, selectedProvider, routingReason, isSubscription } =
      await executeRoutedCompletion({ model: 'auto', messages, max_tokens: 1024 }, jev, false);

    let responseContent = '';
    let promptTokens = Math.ceil(prompt.length / 4);
    let completionTokens = 50;

    if (providerResponse.ok && providerResponse.data) {
      responseContent = providerResponse.data.choices?.[0]?.message?.content || '';
      if (providerResponse.data.usage) {
        promptTokens = providerResponse.data.usage.prompt_tokens || promptTokens;
        completionTokens = providerResponse.data.usage.completion_tokens || completionTokens;
      }
    } else {
      responseContent = providerResponse.error || 'No response returned from aggregator';
    }

    const costs = calculateCosts(selectedModel, promptTokens, completionTokens, jev.jevInputTokens, isSubscription);

    const reqId = 'sim-' + crypto.randomUUID().slice(0, 8);
    const durationMs = (jev.jevDurationMs || 120) + 160;
    recordAndBroadcastRequest({
      id: reqId,
      client_agent: 'simulator',
      model_requested: 'auto',
      model_routed: selectedModel,
      provider_used: selectedProvider,
      jev_intent: jev.intent,
      jev_complexity: jev.complexityScore,
      jev_confidence: jev.intentConfidence,
      jev_needs_reasoner: jev.needsReasoner,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      duration_ms: durationMs,
      jev_duration_ms: jev.jevDurationMs || 120,
      cost_jev: costs.jevCost,
      cost_actual: costs.totalActualCost,
      cost_if_claude: costs.costIfClaude,
      cost_if_gpt4o: costs.costIfGpt4o,
      savings_vs_claude: costs.savingsVsClaude,
      prompt_preview: prompt.slice(0, 150),
      routing_reason: routingReason,
      response_preview: responseContent.slice(0, 300)
    });

    res.json({
      id: reqId,
      prompt,
      jev,
      selectedModel,
      selectedProvider,
      routingReason,
      responseContent,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens
      },
      costs
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export function handleGetReports(req: Request, res: Response) {
  try {
    const filters: ReportFilters = {
      timeframe: (req.query.timeframe as string) || 'all',
      model: (req.query.model as string) || 'all',
      provider: (req.query.provider as string) || 'all',
      intent: (req.query.intent as string) || 'all',
      client: (req.query.client as string) || 'all',
      search: (req.query.search as string) || '',
      limit: parseInt((req.query.limit as string) || '50', 10),
      offset: parseInt((req.query.offset as string) || '0', 10)
    };

    const report = getDetailedReport(filters);

    if (req.query.format === 'csv') {
      const headers = [
        'ID',
        'Timestamp',
        'Client_Agent',
        'Model_Requested',
        'Model_Routed',
        'Provider_Used',
        'Jev_Intent',
        'Jev_Complexity',
        'Jev_Confidence',
        'Prompt_Tokens_Sent',
        'Completion_Tokens_Received',
        'Total_Tokens',
        'Duration_Ms',
        'Jev_Duration_Ms',
        'Cost_Actual_USD',
        'Cost_If_Claude_USD',
        'Cost_If_GPT4o_USD',
        'Savings_Vs_Claude_USD',
        'Routing_Reason',
        'Prompt_Preview'
      ];

      const escapeCsv = (val: any) => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };

      const rows = report.logs.map((log: any) => [
        escapeCsv(log.id),
        escapeCsv(log.timestamp),
        escapeCsv(log.client_agent),
        escapeCsv(log.model_requested),
        escapeCsv(log.model_routed),
        escapeCsv(log.provider_used),
        escapeCsv(log.jev_intent),
        escapeCsv(log.jev_complexity),
        escapeCsv(log.jev_confidence),
        log.prompt_tokens,
        log.completion_tokens,
        log.total_tokens,
        log.duration_ms,
        log.jev_duration_ms,
        Number(log.cost_actual || 0).toFixed(6),
        Number(log.cost_if_claude || 0).toFixed(6),
        Number(log.cost_if_gpt4o || 0).toFixed(6),
        Number(log.savings_vs_claude || 0).toFixed(6),
        escapeCsv(log.routing_reason),
        escapeCsv(log.prompt_preview)
      ].join(','));

      const csvContent = [headers.join(','), ...rows].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="prompt-router-report.csv"');
      return res.send(csvContent);
    }

    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export function handleGetLogDetail(req: Request, res: Response) {
  try {
    const id = String(req.params.id || '');
    const log = getLogById(id);
    if (!log) {
      return res.status(404).json({ error: 'Log entry not found' });
    }
    res.json({ log });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export function handleGetSettings(req: Request, res: Response) {
  const typesafeKey = getSetting('TYPESAFE_API_KEY', config.typesafeApiKey);
  const mammouthKey = getSetting('MAMMOUTH_API_KEY', config.mammouthApiKey);
  const openrouterKey = getSetting('OPENROUTER_API_KEY', config.openrouterApiKey);
  const anthropicKey = getSetting('ANTHROPIC_API_KEY', config.anthropicApiKey);
  const openaiKey = getSetting('OPENAI_API_KEY', config.openaiApiKey);
  const mistralKey = getSetting('MISTRAL_API_KEY', config.mistralApiKey);
  const deepseekKey = getSetting('DEEPSEEK_API_KEY', config.deepseekApiKey);
  const geminiKey = getSetting('GEMINI_API_KEY', config.geminiApiKey);

  res.json({
    hasTypesafeKey: !!(typesafeKey && typesafeKey.trim()),
    hasMammouthKey: !!(mammouthKey && mammouthKey.trim()),
    hasOpenrouterKey: !!(openrouterKey && openrouterKey.trim()),
    hasAnthropicKey: !!(anthropicKey && anthropicKey.trim()),
    hasOpenaiKey: !!(openaiKey && openaiKey.trim()),
    hasMistralKey: !!(mistralKey && mistralKey.trim()),
    hasDeepseekKey: !!(deepseekKey && deepseekKey.trim()),
    hasGeminiKey: !!(geminiKey && geminiKey.trim()),
    typesafeKeyMasked: typesafeKey ? typesafeKey.slice(0, 4) + '...' + typesafeKey.slice(-4) : '',
    mammouthKeyMasked: mammouthKey ? mammouthKey.slice(0, 4) + '...' + mammouthKey.slice(-4) : '',
    openrouterKeyMasked: openrouterKey ? openrouterKey.slice(0, 4) + '...' + openrouterKey.slice(-4) : '',
    anthropicKeyMasked: anthropicKey ? anthropicKey.slice(0, 4) + '...' + anthropicKey.slice(-4) : '',
    openaiKeyMasked: openaiKey ? openaiKey.slice(0, 4) + '...' + openaiKey.slice(-4) : '',
    mistralKeyMasked: mistralKey ? mistralKey.slice(0, 4) + '...' + mistralKey.slice(-4) : '',
    deepseekKeyMasked: deepseekKey ? deepseekKey.slice(0, 4) + '...' + deepseekKey.slice(-4) : '',
    geminiKeyMasked: geminiKey ? geminiKey.slice(0, 4) + '...' + geminiKey.slice(-4) : '',
    routingStrategy: getSetting('ROUTING_STRATEGY', config.routingStrategy),
    defaultProvider: getSetting('DEFAULT_PROVIDER', config.defaultProvider),
    port: config.port
  });
}

export function handleUpdateSettings(req: Request, res: Response) {
  const {
    typesafeApiKey,
    mammouthApiKey,
    openrouterApiKey,
    anthropicApiKey,
    openaiApiKey,
    mistralApiKey,
    deepseekApiKey,
    geminiApiKey,
    routingStrategy,
    defaultProvider
  } = req.body;

  if (typesafeApiKey !== undefined && typesafeApiKey !== null) {
    setSetting('TYPESAFE_API_KEY', typesafeApiKey.trim());
  }
  if (mammouthApiKey !== undefined && mammouthApiKey !== null) {
    setSetting('MAMMOUTH_API_KEY', mammouthApiKey.trim());
  }
  if (openrouterApiKey !== undefined && openrouterApiKey !== null) {
    setSetting('OPENROUTER_API_KEY', openrouterApiKey.trim());
  }
  if (anthropicApiKey !== undefined && anthropicApiKey !== null) {
    setSetting('ANTHROPIC_API_KEY', anthropicApiKey.trim());
  }
  if (openaiApiKey !== undefined && openaiApiKey !== null) {
    setSetting('OPENAI_API_KEY', openaiApiKey.trim());
  }
  if (mistralApiKey !== undefined && mistralApiKey !== null) {
    setSetting('MISTRAL_API_KEY', mistralApiKey.trim());
  }
  if (deepseekApiKey !== undefined && deepseekApiKey !== null) {
    setSetting('DEEPSEEK_API_KEY', deepseekApiKey.trim());
  }
  if (geminiApiKey !== undefined && geminiApiKey !== null) {
    setSetting('GEMINI_API_KEY', geminiApiKey.trim());
  }
  if (routingStrategy) {
    setSetting('ROUTING_STRATEGY', routingStrategy);
  }
  if (defaultProvider) {
    setSetting('DEFAULT_PROVIDER', defaultProvider);
  }

  res.json({ success: true, message: 'Settings updated successfully' });
}

export function handleGetCatalog(req: Request, res: Response) {
  try {
    const search = ((req.query.search as string) || '').toLowerCase();
    const tier = req.query.tier as string;
    const provider = req.query.provider as string;

    const allModels = getAllCatalogModels();

    let filtered = allModels;
    if (search) {
      filtered = filtered.filter(m =>
        m.id.toLowerCase().includes(search) ||
        m.name.toLowerCase().includes(search) ||
        m.description.toLowerCase().includes(search)
      );
    }
    if (tier && tier !== 'all') {
      filtered = filtered.filter(m => m.tier === tier);
    }
    if (provider && provider !== 'all') {
      filtered = filtered.filter(m => m.provider === provider || m.provider === 'both');
    }

    res.json({
      total: allModels.length,
      filteredCount: filtered.length,
      models: filtered.slice(0, 100) // cap to 100 per query
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleSyncCatalog(req: Request, res: Response) {
  try {
    const result = await syncCatalog();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}
export function handleGetSubscriptions(req: Request, res: Response) {
  try {
    const subscriptions = getAllSubscriptions();
    res.json({ subscriptions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export function handleUpdateSubscription(req: Request, res: Response) {
  try {
    const { id, enabled, connected, cli_path, session_token, quota_remaining_pct, resets_at } = req.body;
    if (!id) return res.status(400).json({ error: 'Subscription ID is required' });

    updateSubscription(id, {
      ...(enabled !== undefined ? { enabled: Boolean(enabled) } : {}),
      ...(connected !== undefined ? { connected: Boolean(connected) } : {}),
      ...(cli_path !== undefined ? { cli_path: String(cli_path).trim() } : {}),
      ...(session_token !== undefined ? { session_token: String(session_token).trim() } : {}),
      ...(quota_remaining_pct !== undefined ? { quota_remaining_pct: Number(quota_remaining_pct) } : {}),
      ...(resets_at !== undefined ? { resets_at: Number(resets_at) } : {})
    });

    res.json({ success: true, subscription: getSubscription(id) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export function handleSyncSubscriptions(req: Request, res: Response) {
  try {
    const probe = probeSubscriptionCredentials();
    const subscriptions = getAllSubscriptions();
    res.json({ success: true, probe, subscriptions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}


