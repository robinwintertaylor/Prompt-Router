import { Request, Response } from 'express';
import { getMetrics, getRecentLogs, getSetting, setSetting } from '../db.js';
import { evaluateWithJev } from '../jev.js';
import { selectOptimalModel } from '../router.js';
import { calculateCosts } from '../pricing.js';
import { config } from '../config.js';

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

    const jev = await evaluateWithJev(messages);
    const strategy = (getSetting('ROUTING_STRATEGY', config.routingStrategy) as any) || 'cost_optimized';
    const selection = selectOptimalModel('auto', jev, strategy);

    const estPromptTokens = Math.ceil(prompt.length / 4);
    const estCompletionTokens = 150;
    const costs = calculateCosts(selection.model, estPromptTokens, estCompletionTokens, jev.jevInputTokens);

    res.json({
      prompt,
      jev,
      selection,
      estimatedCosts: costs
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
