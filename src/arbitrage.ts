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
}

const metricsBuffer: ProviderMetric[] = [];
const BUFFER_MAX_AGE_MS = 3 * 60 * 1000; // 3 minutes decay window
const MAX_SAMPLES_PER_PROVIDER = 30;

function purgeOldMetrics() {
  const cutoff = Date.now() - BUFFER_MAX_AGE_MS;
  while (metricsBuffer.length > 0 && metricsBuffer[0].timestamp < cutoff) {
    metricsBuffer.shift();
  }
}

export function resetProviderMetrics(provider?: 'mammouth' | 'openrouter') {
  if (!provider) {
    metricsBuffer.length = 0;
  } else {
    for (let i = metricsBuffer.length - 1; i >= 0; i--) {
      if (metricsBuffer[i].provider === provider) {
        metricsBuffer.splice(i, 1);
      }
    }
  }
}

export function recordProviderPerformance(
  provider: 'mammouth' | 'openrouter',
  latencyMs: number,
  success: boolean
) {
  purgeOldMetrics();

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

  const samples = metricsBuffer.filter(m => m.provider === provider);
  if (samples.length === 0) {
    return {
      provider,
      errorRate: 0,
      avgLatencyMs: 0,
      isDegraded: false,
      sampleCount: 0
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
    sampleCount: samples.length
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
  if (mammouth.isDegraded && !openrouter.isDegraded) {
    recommendation = 'prefer_openrouter';
  } else if (openrouter.isDegraded && !mammouth.isDegraded) {
    recommendation = 'prefer_mammouth';
  }

  return { mammouth, openrouter, recommendation };
}
