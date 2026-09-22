import { JevEvaluation } from './jev.js';
import { callMammouth } from './providers/mammouth.js';
import { callOpenRouter } from './providers/openrouter.js';
import { getSetting } from './db.js';
import { config } from './config.js';
import { getAllCatalogModels, getCatalogModel, CatalogModel } from './catalog.js';
import { recordProviderPerformance, getArbitrageStatus } from './arbitrage.js';

export interface RouteSelection {
  selectedModel: string;
  selectedProvider: 'mammouth' | 'openrouter';
  reasoning: string;
  catalogModel?: CatalogModel;
}
export interface SessionAffinity {
  anchorModel: string;
  provider: 'mammouth' | 'openrouter';
  providerHint?: 'mammouth' | 'openrouter' | 'both';
  turnCount: number;
  lastSeen: number;
}

const sessionAffinityStore = new Map<string, SessionAffinity>();

// Clean up stale sessions after 45 minutes of inactivity
function purgeStaleSessions() {
  const cutoff = Date.now() - 45 * 60 * 1000;
  for (const [id, s] of sessionAffinityStore.entries()) {
    if (s.lastSeen < cutoff) sessionAffinityStore.delete(id);
  }
}


export function selectOptimalModel(
  requestedModel: string,
  jev: JevEvaluation,
  strategy: 'cost_optimized' | 'performance_optimized' | 'balanced' = 'cost_optimized',
  sessionId?: string,
  contextTokens = 0
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

  // 1. Calculate unconstrained optimal candidate model from Jev evaluation
  const candidate = evaluateCandidateModel(jev, strategy, catalog);

  // 2. Break-Even Cache Affinity Evaluation for active multi-turn sessions
  if (sessionId && isAuto) {
    purgeStaleSessions();
    const session = sessionAffinityStore.get(sessionId);
    if (session) {
      const isExtremeReasoner = jev.needsReasoner >= 0.70 || (jev.needsReasoner >= 0.40 && jev.intent === 'deep_reasoning');

      // Hysteresis Rule: dedicated reasoning model always overrides anchor
      if (!isExtremeReasoner) {
        if (session.anchorModel === candidate.model) {
          session.turnCount++;
          session.lastSeen = Date.now();
          return {
            model: session.anchorModel,
            reason: `Preserving session cache affinity on active anchor '${session.anchorModel}' (${contextTokens.toLocaleString()} tokens, turn ${session.turnCount}).`,
            providerHint: session.providerHint
          };
        }

        // Context check: evaluate break-even cache economics
        if (contextTokens >= 4_000) {
          const anchorModelData = getCatalogModel(session.anchorModel);
          const candidateModelData = getCatalogModel(candidate.model);

          // Standard 85% prompt cache read discount for anchor
          const anchorBaseRate = anchorModelData?.promptPrice || 0.000003;
          const anchorCachedRate = anchorBaseRate * 0.15;
          const candidateUncachedRate = candidateModelData?.promptPrice || 0.000001;

          const anchorCachedCost = (contextTokens / 1_000_000) * (anchorCachedRate * 1e6);
          const candidateUncachedCost = (contextTokens / 1_000_000) * (candidateUncachedRate * 1e6);

          // Expected re-cache penalty: if session returns to anchor after TTL, paying full prompt write rate
          const rebuildRiskProb = contextTokens >= 12_000 ? 0.35 : 0.15;
          const anchorRebuildCost = (contextTokens / 1_000_000) * (anchorBaseRate * 1e6);
          const expectedSwitchCost = candidateUncachedCost + (rebuildRiskProb * anchorRebuildCost);

          if (expectedSwitchCost >= anchorCachedCost) {
            session.turnCount++;
            session.lastSeen = Date.now();
            return {
              model: session.anchorModel,
              reason: `Break-even cache affinity: staying on '${session.anchorModel}' cached context ($${anchorCachedCost.toFixed(4)}) is cheaper than expected switch cost ($${expectedSwitchCost.toFixed(4)} uncached + TTL rebuild risk). Preserving warm prompt cache.`,
              providerHint: session.providerHint
            };
          }
        }
      }
    }
  }

  function finalizeDecision(res: { model: string; reason: string; providerHint?: 'mammouth' | 'openrouter' | 'both' }) {
    if (sessionId) {
      const existing = sessionAffinityStore.get(sessionId);
      sessionAffinityStore.set(sessionId, {
        anchorModel: res.model,
        provider: res.providerHint === 'openrouter' ? 'openrouter' : 'mammouth',
        providerHint: res.providerHint,
        turnCount: (existing?.turnCount || 0) + 1,
        lastSeen: Date.now()
      });
    }
    return res;
  }

  return finalizeDecision(candidate);
}

function evaluateCandidateModel(
  jev: JevEvaluation,
  strategy: 'cost_optimized' | 'performance_optimized' | 'balanced',
  catalog: CatalogModel[]
): { model: string; reason: string; providerHint?: 'mammouth' | 'openrouter' | 'both' } {


  // 1. Dedicated Reasoning Tier (applying TypeSafe Consistency Noul Uncertainty Band 0.30 - 0.70)
  const isDefiniteReasoner = jev.needsReasoner >= 0.70;
  const isBorderlineReasoner = jev.needsReasoner >= 0.30 && jev.needsReasoner < 0.70;
  const isReasoningIntent = jev.intent === 'deep_reasoning';
  const isHighComplexityAlgorithm = jev.complexityScore >= 3.8 && (jev.intent === 'coding_complex' || isReasoningIntent);
  const requiresReasoningModel =
    isDefiniteReasoner ||
    (isBorderlineReasoner && (isReasoningIntent || isHighComplexityAlgorithm)) ||
    (jev.complexityScore >= 4.6 && isReasoningIntent);

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

  // Confidence-Gated Safety Fallback (TypeSafe 0.60 Rule):
  // When Jev is uncertain on either intent or complexity, avoid downgrading to ultra-cheap flash tier.
  const isUncertain = jev.intentConfidence < 0.60 || jev.complexityConfidence < 0.60;
  if (isUncertain) {
    if (catalog.length > 0) {
      const safeguard = strategy === 'cost_optimized'
        ? (catalog.find(m => m.tier === 'balanced') || catalog.find(m => m.tier === 'frontier_coding'))
        : (catalog.find(m => m.tier === 'frontier_coding') || catalog.find(m => m.tier === 'balanced'));
      if (safeguard) {
        return {
          model: safeguard.id,
          reason: `Confidence-gated safeguard: Jev reported uncertainty (intent conf: ${(jev.intentConfidence * 100).toFixed(0)}%, complexity conf: ${(jev.complexityConfidence * 100).toFixed(0)}%). Elevating from lightweight tier to safeguard model '${safeguard.name}' to prevent failure.`,
          providerHint: safeguard.provider
        };
      }
    }
    return {
      model: strategy === 'cost_optimized' ? 'openai/gpt-4o-mini' : 'anthropic/claude-3.5-sonnet',
      reason: `Confidence-gated safeguard: Jev reported uncertainty (intent conf: ${(jev.intentConfidence * 100).toFixed(0)}%, complexity conf: ${(jev.complexityConfidence * 100).toFixed(0)}%). Elevating to safeguard model.`
    };
  }

  // 4. Confident Low-complexity / Factual / Creative / Greetings
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
  stream = false,
  sessionId?: string,
  contextTokens = 0
): Promise<{
  providerResponse: any;
  selectedModel: string;
  selectedProvider: 'mammouth' | 'openrouter';
  routingReason: string;
}> {
  const strategy = (getSetting('ROUTING_STRATEGY', config.routingStrategy) as any) || 'cost_optimized';
  const defaultProvider = (getSetting('DEFAULT_PROVIDER', config.defaultProvider) as any) || 'mammouth';

  // 1. Jev decides the best model across both aggregators (with session cache affinity)
  const { model, reason, providerHint } = selectOptimalModel(body.model, jev, strategy, sessionId, contextTokens);

  // 2. Register / update active session anchor
  if (sessionId) {
    const existing = sessionAffinityStore.get(sessionId);
    sessionAffinityStore.set(sessionId, {
      anchorModel: model,
      provider: providerHint === 'openrouter' ? 'openrouter' : (providerHint === 'mammouth' ? 'mammouth' : defaultProvider),
      providerHint,
      turnCount: (existing?.turnCount || 0) + 1,
      lastSeen: Date.now()
    });
  }

  const mammouthKey = getSetting('MAMMOUTH_API_KEY', config.mammouthApiKey);
  const openrouterKey = getSetting('OPENROUTER_API_KEY', config.openrouterApiKey);

  // 3. Resolve target provider based on model availability and real-time health arbitrage
  let primaryProvider: 'mammouth' | 'openrouter' = defaultProvider;
  let secondaryProvider: 'mammouth' | 'openrouter' = defaultProvider === 'mammouth' ? 'openrouter' : 'mammouth';

  const arbitrage = getArbitrageStatus();

  if (providerHint === 'mammouth') {
    primaryProvider = 'mammouth';
    secondaryProvider = 'openrouter';
  } else if (providerHint === 'openrouter') {
    primaryProvider = 'openrouter';
    secondaryProvider = 'mammouth';
  } else {
    // Model is available on both aggregators: check real-time latency & error arbitrage
    if (arbitrage.recommendation === 'prefer_openrouter' && openrouterKey) {
      console.log(`⚡ [Arbitrage] Mammouth is degraded (error rate: ${(arbitrage.mammouth.errorRate * 100).toFixed(0)}%, avg latency: ${arbitrage.mammouth.avgLatencyMs}ms). Arbitraging priority to OpenRouter.`);
      primaryProvider = 'openrouter';
      secondaryProvider = 'mammouth';
    } else if (arbitrage.recommendation === 'prefer_mammouth' && mammouthKey) {
      console.log(`⚡ [Arbitrage] OpenRouter is degraded (error rate: ${(arbitrage.openrouter.errorRate * 100).toFixed(0)}%, avg latency: ${arbitrage.openrouter.avgLatencyMs}ms). Arbitraging priority to Mammouth.`);
      primaryProvider = 'mammouth';
      secondaryProvider = 'openrouter';
    } else {
      // Normal preference based on key availability and configured default
      if (primaryProvider === 'mammouth' && !mammouthKey && openrouterKey) {
        primaryProvider = 'openrouter';
        secondaryProvider = 'mammouth';
      } else if (primaryProvider === 'openrouter' && !openrouterKey && mammouthKey) {
        primaryProvider = 'mammouth';
        secondaryProvider = 'openrouter';
      }
    }
  }

  const modifiedBody = { ...body, model };

  // 4. Dispatch to primary provider and measure latency
  const primaryStartTime = Date.now();
  let res = primaryProvider === 'mammouth'
    ? await callMammouth(modifiedBody, stream)
    : await callOpenRouter(modifiedBody, stream);
  const primaryDuration = Date.now() - primaryStartTime;
  recordProviderPerformance(primaryProvider, primaryDuration, res.ok);

  let activeProvider = primaryProvider;

  // 5. Failover to secondary if primary failed
  if (!res.ok) {
    const hasSecondaryKey = secondaryProvider === 'mammouth' ? !!mammouthKey : !!openrouterKey;
    if (hasSecondaryKey) {
      console.warn(`[Router] Primary provider (${primaryProvider}) failed for model ${model} in ${primaryDuration}ms: ${res.error}. Failing over to ${secondaryProvider}...`);
      const secondaryStartTime = Date.now();
      res = secondaryProvider === 'mammouth'
        ? await callMammouth(modifiedBody, stream)
        : await callOpenRouter(modifiedBody, stream);
      const secondaryDuration = Date.now() - secondaryStartTime;
      recordProviderPerformance(secondaryProvider, secondaryDuration, res.ok);
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
