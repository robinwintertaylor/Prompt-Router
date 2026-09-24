export interface ProviderMetric {
  provider: 'mammouth' | 'openrouter';
  latencyMs: number;
  success: boolean;
  timestamp: number;
}

export interface ProviderHealth {
  provider: 'mammouth' | 'openrouter';
  errorRate: number;      // 0.0 to 1.0
  avgLatencyMs: number;
  isDegraded: boolean;
  sampleCount: number;
  budgetExceeded?: boolean;
}

const metricsBuffer: ProviderMetric[] = [];
const BUFFER_MAX_AGE_MS = 3 * 60 * 1000; // 3 minutes decay window
const MAX_SAMPLES_PER_PROVIDER = 30;

let mammouthBudgetExceededUntil = 0;
let openrouterBudgetExceededUntil = 0;

export function markProviderBudgetExceeded(provider: 'mammouth' | 'openrouter', durationMs = 60 * 60 * 1000) {
  if (provider === 'mammouth') {
    mammouthBudgetExceededUntil = Date.now() + durationMs;
  } else {
    openrouterBudgetExceededUntil = Date.now() + durationMs;
  }
}

export function clearProviderBudgetExceeded(provider: 'mammouth' | 'openrouter') {
  if (provider === 'mammouth') {
    mammouthBudgetExceededUntil = 0;
  } else {
    openrouterBudgetExceededUntil = 0;
  }
}

export function isProviderBudgetExceeded(provider: 'mammouth' | 'openrouter'): boolean {
  if (provider === 'mammouth') {
    return Date.now() < mammouthBudgetExceededUntil;
  }
  return Date.now() < openrouterBudgetExceededUntil;
}

function purgeOldMetrics() {
  const cutoff = Date.now() - BUFFER_MAX_AGE_MS;
  while (metricsBuffer.length > 0 && metricsBuffer[0].timestamp < cutoff) {
    metricsBuffer.shift();
  }
}

export function resetProviderMetrics(provider?: 'mammouth' | 'openrouter') {
  if (!provider) {
    metricsBuffer.length = 0;
    mammouthBudgetExceededUntil = 0;
    openrouterBudgetExceededUntil = 0;
  } else {
    for (let i = metricsBuffer.length - 1; i >= 0; i--) {
      if (metricsBuffer[i].provider === provider) {
        metricsBuffer.splice(i, 1);
      }
    }
    clearProviderBudgetExceeded(provider);
  }
}

export function recordProviderPerformance(
  provider: 'mammouth' | 'openrouter',
  latencyMs: number,
  success: boolean,
  errorMessage?: string
) {
  purgeOldMetrics();

  if (errorMessage && (
    errorMessage.includes('budget_exceeded') ||
    errorMessage.includes('ExceededBudget') ||
    errorMessage.includes('insufficient_quota') ||
    errorMessage.includes('insufficient_credits')
  )) {
    markProviderBudgetExceeded(provider);
  } else if (success) {
    clearProviderBudgetExceeded(provider);
  }

  metricsBuffer.push({
    provider,
    latencyMs: Math.max(1, latencyMs),
    success,
    timestamp: Date.now()
  });

  // Limit total entries to avoid unbounded growth
  if (metricsBuffer.length > MAX_SAMPLES_PER_PROVIDER * 4) {
    metricsBuffer.splice(0, metricsBuffer.length - MAX_SAMPLES_PER_PROVIDER * 2);
  }
}

export function getProviderHealth(provider: 'mammouth' | 'openrouter'): ProviderHealth {
  purgeOldMetrics();

  const budgetExceeded = isProviderBudgetExceeded(provider);
  const samples = metricsBuffer.filter(m => m.provider === provider);

  if (budgetExceeded) {
    return {
      provider,
      errorRate: 1.0,
      avgLatencyMs: 0,
      isDegraded: true,
      sampleCount: samples.length,
      budgetExceeded: true
    };
  }

  if (samples.length === 0) {
    return {
      provider,
      errorRate: 0,
      avgLatencyMs: 0,
      isDegraded: false,
      sampleCount: 0,
      budgetExceeded: false
    };
  }

  const failures = samples.filter(m => !m.success).length;
  const errorRate = failures / samples.length;

  const successfulSamples = samples.filter(m => m.success);
  const totalLatency = successfulSamples.reduce((sum, s) => sum + s.latencyMs, 0);
  const avgLatencyMs = successfulSamples.length > 0 ? Math.round(totalLatency / successfulSamples.length) : 0;

  // Degraded if error rate >= 25% with >= 3 samples, or avg latency >= 6000ms with >= 3 samples
  const isDegraded = samples.length >= 3 && (errorRate >= 0.25 || avgLatencyMs >= 6000);

  return {
    provider,
    errorRate: Math.round(errorRate * 100) / 100,
    avgLatencyMs,
    isDegraded,
    sampleCount: samples.length,
    budgetExceeded: false
  };
}

export function getArbitrageStatus(): {
  mammouth: ProviderHealth;
  openrouter: ProviderHealth;
  recommendation: 'normal' | 'prefer_openrouter' | 'prefer_mammouth';
} {
  const mammouth = getProviderHealth('mammouth');
  const openrouter = getProviderHealth('openrouter');

  let recommendation: 'normal' | 'prefer_openrouter' | 'prefer_mammouth' = 'normal';
  if ((mammouth.isDegraded || mammouth.budgetExceeded) && !openrouter.isDegraded && !openrouter.budgetExceeded) {
    recommendation = 'prefer_openrouter';
  } else if ((openrouter.isDegraded || openrouter.budgetExceeded) && !mammouth.isDegraded && !mammouth.budgetExceeded) {
    recommendation = 'prefer_mammouth';
  }

  return { mammouth, openrouter, recommendation };
}
