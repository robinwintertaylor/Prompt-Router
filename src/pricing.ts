import { getCatalogModel } from './catalog.js';

export interface ModelPrice {
  inputPerMillion: number;
  outputPerMillion: number;
  displayName: string;
}

export const FALLBACK_MODEL_PRICES: Record<string, ModelPrice> = {
  // Evaluator
  'jev': {
    inputPerMillion: 0.042,
    outputPerMillion: 0.0,
    displayName: 'TypeSafe Jev System One'
  },
  // Default frontier benchmarks
  'anthropic/claude-fable-5.1': {
    inputPerMillion: 10.00,
    outputPerMillion: 50.00,
    displayName: 'Claude Fable 5.1'
  },
  'openai/gpt-6-astra': {
    inputPerMillion: 10.00,
    outputPerMillion: 50.00,
    displayName: 'OpenAI GPT-6 Astra'
  },
  'anthropic/claude-3.5-sonnet': {
    inputPerMillion: 3.00,
    outputPerMillion: 15.00,
    displayName: 'Claude 3.5 Sonnet'
  },
  'openai/gpt-4o': {
    inputPerMillion: 2.50,
    outputPerMillion: 10.00,
    displayName: 'OpenAI GPT-4o'
  },
  'openai/gpt-4o-mini': {
    inputPerMillion: 0.15,
    outputPerMillion: 0.60,
    displayName: 'OpenAI GPT-4o-mini'
  },
  'google/gemini-2.5-flash': {
    inputPerMillion: 0.075,
    outputPerMillion: 0.30,
    displayName: 'Gemini 2.5 Flash'
  },
  'deepseek/deepseek-r1': {
    inputPerMillion: 0.55,
    outputPerMillion: 2.19,
    displayName: 'DeepSeek R1'
  }
};

export interface CostCalculation {
  jevCost: number;
  modelCost: number;
  totalActualCost: number;
  costIfClaude: number;
  costIfGpt4o: number;
  savingsVsClaude: number;
  savingsVsGpt4o: number;
}

export function normalizeModelName(rawModel: string): string {
  const m = rawModel.toLowerCase();
  if (m.includes('claude-3-5') || m.includes('claude-3.5') || m.includes('sonnet')) return 'anthropic/claude-3.5-sonnet';
  if (m.includes('gpt-4o-mini')) return 'openai/gpt-4o-mini';
  if (m.includes('gpt-4o') || m.includes('gpt-4.5')) return 'openai/gpt-4o';
  if (m.includes('r1')) return 'deepseek/deepseek-r1';
  if (m.includes('deepseek')) return 'deepseek/deepseek-chat';
  if (m.includes('gemini') && m.includes('flash')) return 'google/gemini-2.5-flash';
  if (m.includes('gemini')) return 'google/gemini-2.5-pro';
  if (m.includes('mistral-small')) return 'mistralai/mistral-small';
  return rawModel;
}

export function calculateCosts(
  modelName: string,
  promptTokens: number,
  completionTokens: number,
  jevInputTokens: number = 0
): CostCalculation {
  // 1. Calculate Jev cost ($0.042 / 1M input tokens, free output)
  const jevCost = (jevInputTokens / 1_000_000) * 0.042;

  // 2. Check live catalog for the model
  const catalogEntry = getCatalogModel(modelName) || getCatalogModel(normalizeModelName(modelName));
  let modelCost = 0;

  if (catalogEntry && (catalogEntry.promptPrice > 0 || catalogEntry.completionPrice > 0)) {
    // Exact live aggregator rates per token
    modelCost = (promptTokens * catalogEntry.promptPrice) + (completionTokens * catalogEntry.completionPrice);
  } else {
    // Fallback table per million
    const norm = normalizeModelName(modelName);
    const fallback = FALLBACK_MODEL_PRICES[norm] || { inputPerMillion: 1.0, outputPerMillion: 3.0, displayName: modelName };
    modelCost = (promptTokens / 1_000_000) * fallback.inputPerMillion + (completionTokens / 1_000_000) * fallback.outputPerMillion;
  }

  const totalActualCost = jevCost + modelCost;

  // 3. Live Benchmark: If 100% Anthropic Frontier (Claude Fable 5.1 / Opus 5.5)
  const claudeCatalog = getCatalogModel('anthropic/claude-fable-5.1')
    || getCatalogModel('anthropic/claude-opus-5')
    || getCatalogModel('anthropic/claude-opus-4.8');
  let costIfClaude = 0;
  if (claudeCatalog && claudeCatalog.promptPrice > 0) {
    costIfClaude = (promptTokens * claudeCatalog.promptPrice) + (completionTokens * claudeCatalog.completionPrice);
  } else {
    costIfClaude = (promptTokens / 1_000_000) * 10.00 + (completionTokens / 1_000_000) * 50.00;
  }

  // 4. Live Benchmark: If 100% OpenAI Frontier (GPT-6 Astra / Sol 5.6)
  const gpt4oCatalog = getCatalogModel('openai/gpt-6-astra')
    || getCatalogModel('~openai/gpt-astra-latest')
    || getCatalogModel('openai/gpt-5.6-sol');
  let costIfGpt4o = 0;
  if (gpt4oCatalog && gpt4oCatalog.promptPrice > 0) {
    costIfGpt4o = (promptTokens * gpt4oCatalog.promptPrice) + (completionTokens * gpt4oCatalog.completionPrice);
  } else {
    costIfGpt4o = (promptTokens / 1_000_000) * 10.00 + (completionTokens / 1_000_000) * 50.00;
  }

  const savingsVsClaude = Math.max(0, costIfClaude - totalActualCost);
  const savingsVsGpt4o = Math.max(0, costIfGpt4o - totalActualCost);

  return {
    jevCost,
    modelCost,
    totalActualCost,
    costIfClaude,
    costIfGpt4o,
    savingsVsClaude,
    savingsVsGpt4o
  };
}

