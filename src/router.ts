import { JevEvaluation } from './jev.js';
import { callMammouth } from './providers/mammouth.js';
import { callOpenRouter } from './providers/openrouter.js';
import { getSetting } from './db.js';
import { config } from './config.js';
import { getAllCatalogModels, getCatalogModel, CatalogModel } from './catalog.js';

export interface RouteSelection {
  selectedModel: string;
  selectedProvider: 'mammouth' | 'openrouter';
  reasoning: string;
  catalogModel?: CatalogModel;
}

export function selectOptimalModel(
  requestedModel: string,
  jev: JevEvaluation,
  strategy: 'cost_optimized' | 'performance_optimized' | 'balanced' = 'cost_optimized'
): { model: string; reason: string; providerHint?: 'mammouth' | 'openrouter' | 'both' } {
  const req = (requestedModel || '').toLowerCase();
  const isAuto =
    !req ||
    req === 'auto' ||
    req === 'default' ||
    req === 'prompt-router' ||
    req === 'jev' ||
    req === 'jev-smart-router';

  // If client requested an explicit model, honor it
  if (!isAuto && req !== 'jev-smart-router') {
    const existing = getCatalogModel(requestedModel);
    return {
      model: requestedModel,
      reason: `Client explicitly requested model '${requestedModel}'`,
      providerHint: existing ? existing.provider : undefined
    };
  }

  const catalog = getAllCatalogModels();

  // 1. Dedicated Reasoning Tier (applying TypeSafe Consistency Noul Uncertainty Band 0.30 - 0.70)
  const isDefiniteReasoner = jev.needsReasoner >= 0.70;
  const isBorderlineReasoner = jev.needsReasoner >= 0.30 && jev.needsReasoner < 0.70;
  const isReasoningIntent = jev.intent === 'deep_reasoning';
  const requiresReasoningModel = isDefiniteReasoner || (isBorderlineReasoner && isReasoningIntent) || (jev.complexityScore >= 4.6 && isReasoningIntent);

  if (requiresReasoningModel) {
    if (catalog.length > 0) {
      const reasoners = catalog.filter(m => m.tier === 'frontier_reasoning');
      if (reasoners.length > 0) {
        if (strategy === 'cost_optimized') {
          reasoners.sort((a, b) => (a.promptPrice + a.completionPrice) - (b.promptPrice + b.completionPrice));
          const best = reasoners.find(m => m.id.includes('r1') || m.id.includes('deepseek')) || reasoners[0];
          return {
            model: best.id,
            reason: `Jev detected reasoning requirement (prob: ${(jev.needsReasoner * 100).toFixed(0)}%, complexity: ${jev.complexityScore}). Selected '${best.name}' from catalog (${best.provider}) at live rate $${(best.promptPrice * 1e6).toFixed(2)}/M in.`,
            providerHint: best.provider
          };
        } else {
          const premier = reasoners.find(m => m.id.includes('sonnet') || m.id.includes('o1') || m.id.includes('r1')) || reasoners[0];
          return {
            model: premier.id,
            reason: `Jev detected frontier reasoning (score: ${jev.complexityScore}). Selected premier model '${premier.name}' from catalog.`,
            providerHint: premier.provider
          };
        }
      }
    }
    return {
      model: strategy === 'cost_optimized' ? 'deepseek/deepseek-r1' : 'anthropic/claude-3.5-sonnet',
      reason: `Jev detected frontier reasoning (score: ${jev.complexityScore}, reasoner prob: ${(jev.needsReasoner * 100).toFixed(0)}%).`
    };
  }

  // 2. High-End Coding & Complex Refactoring Tier
  if (jev.intent === 'coding_complex' || jev.complexityScore >= 3.6) {
    if (catalog.length > 0) {
      const coders = catalog.filter(m => m.tier === 'frontier_coding');
      if (coders.length > 0) {
        const bestCoder = coders.find(m => m.id.includes('sonnet')) || coders.find(m => m.id.includes('gpt-4o')) || coders[0];
        return {
          model: bestCoder.id,
          reason: `Jev classified complex coding (score: ${jev.complexityScore}, intent: ${jev.intent}). Selected '${bestCoder.name}' from catalog (${bestCoder.provider}).`,
          providerHint: bestCoder.provider
        };
      }
    }
    return {
      model: 'anthropic/claude-3.5-sonnet',
      reason: `Jev classified complex coding (score: ${jev.complexityScore}, intent: ${jev.intent}). Routed to Claude 3.5 Sonnet.`
    };
  }

  // 3. Balanced Coding / Structured Extraction / Mid-tier
  if (jev.intent === 'coding_simple' || jev.intent === 'structured_extraction' || jev.complexityScore >= 2.6) {
    if (catalog.length > 0) {
      const balanced = catalog.filter(m => m.tier === 'balanced');
      if (balanced.length > 0) {
        const bestBalanced = balanced.find(m => m.id.includes('mini') || m.id.includes('flash')) || balanced[0];
        return {
          model: bestBalanced.id,
          reason: `Jev detected standard task (intent: ${jev.intent}, score: ${jev.complexityScore}). Selected '${bestBalanced.name}' from catalog.`,
          providerHint: bestBalanced.provider
        };
      }
    }
    return {
      model: 'openai/gpt-4o-mini',
      reason: `Jev detected standard task (intent: ${jev.intent}, score: ${jev.complexityScore}). Routed to GPT-4o-mini.`
    };
  }

  // 4. Low-complexity / Factual / Creative / Greetings
  if (catalog.length > 0) {
    const cheap = catalog.filter(m => m.tier === 'fast_cheap');
    if (cheap.length > 0) {
      cheap.sort((a, b) => (a.promptPrice + a.completionPrice) - (b.promptPrice + b.completionPrice));
      const fastest = cheap.find(m => m.id.includes('flash')) || cheap[0];
      return {
        model: fastest.id,
        reason: `Jev detected lightweight task (score: ${jev.complexityScore}). Selected '${fastest.name}' from catalog at ultra-low rate.`,
        providerHint: fastest.provider
      };
    }
  }
  return {
    model: 'google/gemini-2.5-flash',
    reason: `Jev detected lightweight task (score: ${jev.complexityScore}). Routed to Gemini 2.5 Flash.`
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

  // 1. Jev decides the best model across both aggregators
  const { model, reason, providerHint } = selectOptimalModel(body.model, jev, strategy);

  const mammouthKey = getSetting('MAMMOUTH_API_KEY', config.mammouthApiKey);
  const openrouterKey = getSetting('OPENROUTER_API_KEY', config.openrouterApiKey);

  // 2. Resolve target provider based on model availability in catalog
  let primaryProvider: 'mammouth' | 'openrouter' = defaultProvider;
  let secondaryProvider: 'mammouth' | 'openrouter' = defaultProvider === 'mammouth' ? 'openrouter' : 'mammouth';

  if (providerHint === 'mammouth') {
    primaryProvider = 'mammouth';
    secondaryProvider = 'openrouter';
  } else if (providerHint === 'openrouter') {
    primaryProvider = 'openrouter';
    secondaryProvider = 'mammouth';
  } else {
    // Model is available on both aggregators: follow user's preferred default
    if (primaryProvider === 'mammouth' && !mammouthKey && openrouterKey) {
      primaryProvider = 'openrouter';
      secondaryProvider = 'mammouth';
    } else if (primaryProvider === 'openrouter' && !openrouterKey && mammouthKey) {
      primaryProvider = 'mammouth';
      secondaryProvider = 'openrouter';
    }
  }

  const modifiedBody = { ...body, model };

  // 3. Dispatch to primary provider
  let res = primaryProvider === 'mammouth'
    ? await callMammouth(modifiedBody, stream)
    : await callOpenRouter(modifiedBody, stream);

  let activeProvider = primaryProvider;

  // 4. Failover to secondary if primary failed
  if (!res.ok) {
    const hasSecondaryKey = secondaryProvider === 'mammouth' ? !!mammouthKey : !!openrouterKey;
    if (hasSecondaryKey) {
      console.warn(`[Router] Primary provider (${primaryProvider}) failed for model ${model}: ${res.error}. Failing over to ${secondaryProvider}...`);
      res = secondaryProvider === 'mammouth'
        ? await callMammouth(modifiedBody, stream)
        : await callOpenRouter(modifiedBody, stream);
      if (res.ok) {
        activeProvider = secondaryProvider;
      }
    }
  }

  if (res.ok) {
    console.log(`⚡ [Prompt-Router] Success: Routed prompt to model '${model}' via ${activeProvider.toUpperCase()}`);
  } else {
    console.warn(`⚠️ [Prompt-Router] Provider error (${activeProvider}): ${res.error}`);
  }

  return {
    providerResponse: res,
    selectedModel: model,
    selectedProvider: activeProvider,
    routingReason: reason
  };
}
