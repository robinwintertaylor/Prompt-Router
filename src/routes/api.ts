import { Request, Response } from 'express';
import { getMetrics, getRecentLogs, getSetting, setSetting } from '../db.js';
import { evaluateWithJev } from '../jev.js';
import { selectOptimalModel, executeRoutedCompletion } from '../router.js';
import { calculateCosts } from '../pricing.js';
import { config } from '../config.js';
import { getAllCatalogModels, syncCatalog } from '../catalog.js';

export function handleGetMetrics(req: Request, res: Response) {
  try {
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

    res.json({
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
      clientBreakdown: data.clientBreakdown
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
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
    const { providerResponse, selectedModel, selectedProvider, routingReason } =
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

    const costs = calculateCosts(selectedModel, promptTokens, completionTokens, jev.jevInputTokens);

    res.json({
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

export function handleGetSettings(req: Request, res: Response) {
  const typesafeKey = getSetting('TYPESAFE_API_KEY', config.typesafeApiKey);
  const mammouthKey = getSetting('MAMMOUTH_API_KEY', config.mammouthApiKey);
  const openrouterKey = getSetting('OPENROUTER_API_KEY', config.openrouterApiKey);

  res.json({
    hasTypesafeKey: !!(typesafeKey && typesafeKey.trim()),
    hasMammouthKey: !!(mammouthKey && mammouthKey.trim()),
    hasOpenrouterKey: !!(openrouterKey && openrouterKey.trim()),
    typesafeKeyMasked: typesafeKey ? typesafeKey.slice(0, 4) + '...' + typesafeKey.slice(-4) : '',
    mammouthKeyMasked: mammouthKey ? mammouthKey.slice(0, 4) + '...' + mammouthKey.slice(-4) : '',
    openrouterKeyMasked: openrouterKey ? openrouterKey.slice(0, 4) + '...' + openrouterKey.slice(-4) : '',
    routingStrategy: getSetting('ROUTING_STRATEGY', config.routingStrategy),
    defaultProvider: getSetting('DEFAULT_PROVIDER', config.defaultProvider),
    port: config.port
  });
}

export function handleUpdateSettings(req: Request, res: Response) {
  const { typesafeApiKey, mammouthApiKey, openrouterApiKey, routingStrategy, defaultProvider } = req.body;

  if (typesafeApiKey !== undefined && typesafeApiKey !== null) {
    setSetting('TYPESAFE_API_KEY', typesafeApiKey.trim());
  }
  if (mammouthApiKey !== undefined && mammouthApiKey !== null) {
    setSetting('MAMMOUTH_API_KEY', mammouthApiKey.trim());
  }
  if (openrouterApiKey !== undefined && openrouterApiKey !== null) {
    setSetting('OPENROUTER_API_KEY', openrouterApiKey.trim());
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

