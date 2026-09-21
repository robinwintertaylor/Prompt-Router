import { JevEvaluation } from './jev.js';
import { callMammouth } from './providers/mammouth.js';
import { callOpenRouter } from './providers/openrouter.js';
import { getSetting } from './db.js';
import { config } from './config.js';

export interface RouteSelection {
  selectedModel: string;
  selectedProvider: 'mammouth' | 'openrouter';
  reasoning: string;
}

export function selectOptimalModel(
  requestedModel: string,
  jev: JevEvaluation,
  strategy: 'cost_optimized' | 'performance_optimized' | 'balanced' = 'cost_optimized'
): { model: string; reason: string } {
  const req = (requestedModel || '').toLowerCase();
  const isAuto =
    !req ||
    req === 'auto' ||
    req === 'default' ||
    req === 'prompt-router' ||
    req === 'jev' ||
    req === 'jev-smart-router';

  // If client requested an explicit model, keep it unless it is an auto alias
  if (!isAuto && req !== 'jev-smart-router') {
    return {
      model: requestedModel,
      reason: `Client explicitly requested model '${requestedModel}'`
    };
  }

  // 1. Extreme Reasoning / Math / Logic Tier
  if (jev.needsReasoner > 0.65 || jev.complexityScore >= 4.5) {
    if (strategy === 'cost_optimized') {
      return {
        model: 'deepseek/deepseek-r1',
        reason: `Jev detected deep reasoning (score: ${jev.complexityScore}, reasoner prob: ${(jev.needsReasoner * 100).toFixed(0)}%). Selected DeepSeek R1 for premier reasoning at 1/5th cost.`
      };
    } else {
      return {
        model: 'anthropic/claude-3.5-sonnet',
        reason: `Jev detected frontier complexity (score: ${jev.complexityScore}). Selected Claude 3.5 Sonnet for maximum capability.`
      };
    }
  }

  // 2. High-End Coding & Complex Refactoring Tier
  if (jev.intent === 'coding_complex' || jev.complexityScore >= 3.6) {
    if (strategy === 'cost_optimized' && jev.complexityScore < 4.0) {
      return {
        model: 'openai/gpt-4o-mini',
        reason: `Jev detected structured coding task with moderate complexity (score: ${jev.complexityScore}). Routed to GPT-4o-mini for 90%+ cost savings.`
      };
    }
    return {
      model: 'anthropic/claude-3.5-sonnet',
      reason: `Jev classified as complex coding (score: ${jev.complexityScore}, intent: ${jev.intent}). Routed to Claude 3.5 Sonnet.`
    };
  }

  // 3. Balanced Coding / Structured Extraction / Mid-tier
  if (jev.intent === 'coding_simple' || jev.intent === 'structured_extraction' || jev.complexityScore >= 2.6) {
    return {
      model: 'openai/gpt-4o-mini',
      reason: `Jev detected standard task (intent: ${jev.intent}, score: ${jev.complexityScore}). Routed to GPT-4o-mini.`
    };
  }

  // 4. Low-complexity / Factual / Creative / Greetings
  return {
    model: 'google/gemini-2.5-flash',
    reason: `Jev detected lightweight/conversational task (score: ${jev.complexityScore}). Routed to Gemini 2.5 Flash for ultra-fast response.`
  };
}

export async function executeRoutedCompletion(
  body: any,
  jev: JevEvaluation,
  stream = false
): Promise<{
  providerResponse: any;
  selectedModel: string;
  selectedProvider: 'mammouth' | 'openrouter';
  routingReason: string;
}> {
  const strategy = (getSetting('ROUTING_STRATEGY', config.routingStrategy) as any) || 'cost_optimized';
  const defaultProvider = (getSetting('DEFAULT_PROVIDER', config.defaultProvider) as any) || 'mammouth';

  const { model, reason } = selectOptimalModel(body.model, jev, strategy);

  const mammouthKey = getSetting('MAMMOUTH_API_KEY', config.mammouthApiKey);
  const openrouterKey = getSetting('OPENROUTER_API_KEY', config.openrouterApiKey);

  let primaryProvider: 'mammouth' | 'openrouter' = defaultProvider;
  let secondaryProvider: 'mammouth' | 'openrouter' = defaultProvider === 'mammouth' ? 'openrouter' : 'mammouth';

  // If primary provider key is missing but secondary is available, swap them
  if (primaryProvider === 'mammouth' && !mammouthKey && openrouterKey) {
    primaryProvider = 'openrouter';
    secondaryProvider = 'mammouth';
  } else if (primaryProvider === 'openrouter' && !openrouterKey && mammouthKey) {
    primaryProvider = 'mammouth';
    secondaryProvider = 'openrouter';
  }

  const modifiedBody = { ...body, model };

  // Try primary provider
  let res = primaryProvider === 'mammouth'
    ? await callMammouth(modifiedBody, stream)
    : await callOpenRouter(modifiedBody, stream);

  let activeProvider = primaryProvider;

  // Failover to secondary if primary failed and secondary key exists
  if (!res.ok) {
    const hasSecondaryKey = secondaryProvider === 'mammouth' ? !!mammouthKey : !!openrouterKey;
    if (hasSecondaryKey) {
      console.warn(`[Router] Primary provider (${primaryProvider}) failed: ${res.error}. Failing over to ${secondaryProvider}...`);
      res = secondaryProvider === 'mammouth'
        ? await callMammouth(modifiedBody, stream)
        : await callOpenRouter(modifiedBody, stream);
      if (res.ok) {
        activeProvider = secondaryProvider;
      }
    }
  }

  return {
    providerResponse: res,
    selectedModel: model,
    selectedProvider: activeProvider,
    routingReason: reason
  };
}
