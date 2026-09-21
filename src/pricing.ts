export interface ModelPrice {
  inputPerMillion: number;
  outputPerMillion: number;
  displayName: string;
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  // Evaluator
  'jev': {
    inputPerMillion: 0.042,
    outputPerMillion: 0.0,
    displayName: 'TypeSafe Jev System One'
  },
  // Frontier Reference Models for Optics comparison
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
  'google/gemini-2.5-pro': {
    inputPerMillion: 1.25,
    outputPerMillion: 5.00,
    displayName: 'Gemini 2.5 Pro'
  },
  'google/gemini-2.5-flash': {
    inputPerMillion: 0.10,
    outputPerMillion: 0.40,
    displayName: 'Gemini 2.5 Flash'
  },
  'deepseek/deepseek-r1': {
    inputPerMillion: 0.55,
    outputPerMillion: 2.19,
    displayName: 'DeepSeek R1 (Reasoning)'
  },
  'deepseek/deepseek-chat': {
    inputPerMillion: 0.14,
    outputPerMillion: 0.28,
    displayName: 'DeepSeek V3'
  },
  'mistralai/mistral-small': {
    inputPerMillion: 0.20,
    outputPerMillion: 0.60,
    displayName: 'Mistral Small'
  },
  'mistralai/mistral-large': {
    inputPerMillion: 2.00,
    outputPerMillion: 6.00,
    displayName: 'Mistral Large'
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
  if (m.includes('mistral')) return 'mistralai/mistral-large';
  return rawModel;
}

export function calculateCosts(
  modelName: string,
  promptTokens: number,
  completionTokens: number,
  jevInputTokens: number = 0
): CostCalculation {
  const normalized = normalizeModelName(modelName);
  const targetPrice = MODEL_PRICES[normalized] || { inputPerMillion: 1.0, outputPerMillion: 3.0, displayName: modelName };
  const claudePrice = MODEL_PRICES['anthropic/claude-3.5-sonnet'];
  const gpt4oPrice = MODEL_PRICES['openai/gpt-4o'];
  const jevPrice = MODEL_PRICES['jev'];

  // Jev cost: $0.042 / 1M input tokens
  const jevCost = (jevInputTokens / 1_000_000) * jevPrice.inputPerMillion;

  // Actual routed model cost
  const modelCost =
    (promptTokens / 1_000_000) * targetPrice.inputPerMillion +
    (completionTokens / 1_000_000) * targetPrice.outputPerMillion;

  const totalActualCost = jevCost + modelCost;

  // Comparison benchmark: If all traffic had gone to Claude 3.5 Sonnet
  const costIfClaude =
    (promptTokens / 1_000_000) * claudePrice.inputPerMillion +
    (completionTokens / 1_000_000) * claudePrice.outputPerMillion;

  // Comparison benchmark: If all traffic had gone to OpenAI GPT-4o
  const costIfGpt4o =
    (promptTokens / 1_000_000) * gpt4oPrice.inputPerMillion +
    (completionTokens / 1_000_000) * gpt4oPrice.outputPerMillion;

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
