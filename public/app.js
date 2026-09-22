// Prompt-Router Dashboard Logic

let currentLogs = [];
let sseConnection = null;

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  initTheme();
  initTelemetryStream();
  fetchMetrics();
  fetchLogs();
  fetchSettings();
  fetchCatalog();
  fetchArbitrageStatus();

  // Polling every 6 seconds as background fallback for live optics
  setInterval(() => {
    if (!sseConnection || sseConnection.readyState !== EventSource.OPEN) {
      fetchMetrics();
      fetchLogs();
      fetchArbitrageStatus();
    }
  }, 6000);

  // Setup Event Listeners
  document.getElementById('btn-refresh').addEventListener('click', () => {
    fetchMetrics();
    fetchLogs();
    fetchCatalog();
  });

  document.getElementById('btn-open-settings').addEventListener('click', openSettingsModal);
  document.getElementById('btn-close-settings').addEventListener('click', closeSettingsModal);
  document.getElementById('btn-cancel-settings').addEventListener('click', closeSettingsModal);
  document.getElementById('btn-save-settings').addEventListener('click', saveSettings);

  document.getElementById('btn-open-catalog').addEventListener('click', openCatalogModal);
  document.getElementById('btn-close-catalog').addEventListener('click', closeCatalogModal);
  document.getElementById('btn-close-catalog-footer')?.addEventListener('click', closeCatalogModal);
  document.getElementById('btn-sync-catalog').addEventListener('click', triggerCatalogSync);
  document.getElementById('btn-modal-sync-catalog').addEventListener('click', triggerCatalogSync);

  document.getElementById('catalog-search').addEventListener('input', () => fetchCatalog());
  document.getElementById('catalog-tier-filter').addEventListener('change', () => fetchCatalog());

  document.getElementById('btn-run-test').addEventListener('click', runPromptTest);

  // Playground preset chips
  document.querySelectorAll('.btn-chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const prompt = e.target.getAttribute('data-prompt');
      document.getElementById('test-prompt-input').value = prompt;
      runPromptTest();
    });
  });

  // Sub-toolbar Quick Tabs
  document.getElementById('tab-metrics')?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  document.getElementById('tab-catalog-quick')?.addEventListener('click', () => {
    openCatalogModal();
  });

  document.getElementById('tab-simulator-jump')?.addEventListener('click', () => {
    document.getElementById('simulator-section')?.scrollIntoView({ behavior: 'smooth' });
  });

  // Backdrop click to close modals
  document.getElementById('settings-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'settings-modal') closeSettingsModal();
  });
  document.getElementById('catalog-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'catalog-modal') closeCatalogModal();
  });

  // Escape key to close any active modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSettingsModal();
      closeCatalogModal();
    }
  });

  // Strategy quick selector in toolbar
  document.getElementById('select-strategy-quick')?.addEventListener('change', async (e) => {
    const strategy = e.target.value;
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routingStrategy: strategy })
      });
      const modalSelect = document.getElementById('select-strategy');
      if (modalSelect) modalSelect.value = strategy;
    } catch (err) {
      console.error('Failed to update strategy:', err);
    }
  });

  // Filter input
  document.getElementById('log-search')?.addEventListener('input', (e) => {
    renderLogsTable(e.target.value.toLowerCase());
  });
}

// --------------------------------------------------------------------------
// Real-Time SSE Telemetry & Dynamic Arbitrage Client
// --------------------------------------------------------------------------
function initTelemetryStream() {
  if (!window.EventSource) return;

  try {
    sseConnection = new EventSource('/api/telemetry/stream');

    sseConnection.addEventListener('initial_state', (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.metrics) renderMetrics(payload.metrics);
        if (payload.arbitrage) updateArbitrageBadge(payload.arbitrage);
        updateSseStatus(true);
      } catch (err) {
        console.warn('[Telemetry] Error in initial_state:', err);
      }
    });

    sseConnection.addEventListener('request_completed', (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.metrics) {
          renderMetrics(payload.metrics);
          pulseMetricsCards();
        }
        if (payload.log) {
          prependLiveLogRow(payload.log);
        }
        fetchArbitrageStatus();
        updateSseStatus(true);
      } catch (err) {
        console.warn('[Telemetry] Error in request_completed:', err);
      }
    });

    sseConnection.onopen = () => {
      updateSseStatus(true);
    };

    sseConnection.onerror = () => {
      updateSseStatus(false);
    };
  } catch (err) {
    console.warn('[Telemetry] EventSource connection failed:', err);
    updateSseStatus(false);
  }
}

function updateSseStatus(connected) {
  const el = document.getElementById('badge-sse-status');
  if (!el) return;
  if (connected) {
    el.className = 'badge badge-live-stream';
    el.textContent = '⚡ LIVE STREAM';
    el.style.opacity = '1';
  } else {
    el.className = 'badge badge-warning';
    el.textContent = '⚠️ POLLING (RECONNECTING)';
  }
}

function updateArbitrageBadge(arbitrage) {
  const el = document.getElementById('badge-arbitrage-status');
  if (!el) return;

  if (arbitrage.recommendation === 'prefer_openrouter') {
    el.className = 'badge badge-arbitrage-alert';
    el.textContent = 'ARBITRAGE: PREFER OPENROUTER';
    el.title = `Mammouth error rate: ${(arbitrage.mammouth.errorRate * 100).toFixed(0)}%, latency: ${arbitrage.mammouth.avgLatencyMs}ms`;
  } else if (arbitrage.recommendation === 'prefer_mammouth') {
    el.className = 'badge badge-arbitrage-alert';
    el.textContent = 'ARBITRAGE: PREFER MAMMOUTH';
    el.title = `OpenRouter error rate: ${(arbitrage.openrouter.errorRate * 100).toFixed(0)}%, latency: ${arbitrage.openrouter.avgLatencyMs}ms`;
  } else {
    el.className = 'badge badge-arbitrage-ok';
    el.textContent = 'ARBITRAGE: HEALTHY';
    el.title = 'All upstream providers operating within nominal latency and zero error rate thresholds.';
  }
}

async function fetchArbitrageStatus() {
  try {
    const res = await fetch('/api/arbitrage');
    if (!res.ok) return;
    const data = await res.json();
    updateArbitrageBadge(data);
  } catch (_) {
    // Non-blocking
  }
}

function pulseMetricsCards() {
  const targets = [
    document.getElementById('val-total-requests'),
    document.getElementById('val-actual-cost'),
    document.getElementById('val-savings'),
    document.getElementById('val-total-tokens')
  ];
  for (const t of targets) {
    if (t) {
      t.classList.remove('val-pulse');
      void t.offsetWidth; // Trigger reflow for clean re-animation
      t.classList.add('val-pulse');
    }
  }
}

function prependLiveLogRow(log) {
  currentLogs.unshift(log);
  if (currentLogs.length > 50) currentLogs.pop();

  const tbody = document.getElementById('logs-table-body');
  if (!tbody) return;

  const searchFilter = (document.getElementById('log-search')?.value || '').toLowerCase();
  if (searchFilter) {
    const matches =
      (log.prompt_preview || '').toLowerCase().includes(searchFilter) ||
      (log.model_routed || '').toLowerCase().includes(searchFilter) ||
      (log.client_agent || '').toLowerCase().includes(searchFilter) ||
      (log.jev_intent || '').toLowerCase().includes(searchFilter);
    if (!matches) return;
  }

  if (tbody.querySelector('.empty-state')) {
    tbody.innerHTML = '';
  }

  const timeStr = new Date(log.timestamp).toLocaleTimeString();
  const intentBadge = getIntentBadge(log.jev_intent);
  const savings = Number(log.savings_vs_claude || 0);
  const clientName = escapeHtml(log.client_agent || 'client');
  const clientBadgeClass = clientName.includes('cursor') ? 'badge-gateway' : 'badge-purple';

  const tr = document.createElement('tr');
  tr.className = 'row-live-highlight';
  tr.innerHTML = `
    <td style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">${timeStr}</td>
    <td><span class="badge ${clientBadgeClass}">${clientName}</span></td>
    <td style="max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(log.prompt_preview)}">
      ${escapeHtml(log.prompt_preview || '')}
    </td>
    <td>
      ${intentBadge}
      <span class="badge badge-gateway" style="font-size: 10px;">${Number(log.jev_complexity).toFixed(1)}/5</span>
    </td>
    <td>
      <strong style="color: var(--gateway-teal-dark);">${escapeHtml(log.model_routed)}</strong>
      <span style="font-size: 10.5px; color: var(--text-muted); display: block;">via ${escapeHtml(log.provider_used)}</span>
    </td>
    <td style="font-family: var(--font-mono); font-size: 11.5px;">
      ${(log.prompt_tokens + log.completion_tokens).toLocaleString()}
      <span style="font-size: 10px; color: var(--text-muted); display: block;">${log.prompt_tokens} in / ${log.completion_tokens} out</span>
    </td>
    <td style="font-family: var(--font-mono); font-weight: 700; color: var(--gateway-teal-dark);">
      $${Number(log.cost_actual).toFixed(4)}
    </td>
    <td style="font-family: var(--font-mono); color: var(--text-muted);">
      $${Number(log.cost_if_claude).toFixed(4)}
    </td>
    <td style="font-family: var(--font-mono); font-weight: 700; color: var(--savings-green-dark);">
      +$${savings.toFixed(4)}
    </td>
  `;

  tbody.insertBefore(tr, tbody.firstChild);

  while (tbody.children.length > 50) {
    tbody.removeChild(tbody.lastChild);
  }

  const badgeCounter = document.getElementById('logs-counter-badge');
  if (badgeCounter) badgeCounter.textContent = `${currentLogs.length} Requests`;
}

// Concept 1 Theme Switcher (Parallel Junction Light / Dark Mode)
function initTheme() {
  const savedTheme = localStorage.getItem('prompt_router_theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
  applyTheme(initialTheme);

  // Banner theme button
  const btnTheme = document.getElementById('btn-theme-toggle');
  if (btnTheme) {
    btnTheme.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });
  }

  // Subtoolbar toggle switch (Image 5: Active state glows teal)
  const themeCheckbox = document.getElementById('theme-checkbox');
  if (themeCheckbox) {
    themeCheckbox.addEventListener('change', (e) => {
      applyTheme(e.target.checked ? 'dark' : 'light');
    });
  }

  // Listen to OS scheme changes if user hasn't explicitly set localStorage
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('prompt_router_theme')) {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('prompt_router_theme', theme);

  const isDark = theme === 'dark';
  const themeCheckbox = document.getElementById('theme-checkbox');
  if (themeCheckbox) themeCheckbox.checked = isDark;

  const stateLabel = document.getElementById('switch-state-label');
  if (stateLabel) {
    stateLabel.textContent = isDark ? 'ACTIVE' : 'INACTIVE';
  }

  const btnIcon = document.getElementById('theme-btn-icon');
  const btnText = document.getElementById('theme-btn-text');
  if (btnIcon) btnIcon.textContent = isDark ? '☀️' : '🌙';
  if (btnText) btnText.textContent = isDark ? 'Light Mode' : 'Dark Mode';
}

async function fetchMetrics() {
  try {
    const res = await fetch('/api/metrics');
    if (!res.ok) return;
    const data = await res.json();
    renderMetrics(data);
  } catch (err) {
    console.error('Error fetching metrics:', err);
  }
}

function renderMetrics(data) {
  const s = data.summary;
  
  const reqCountEl = document.getElementById('val-total-requests');
  if (reqCountEl) reqCountEl.textContent = s.totalRequests.toLocaleString();
  
  const tabReqCount = document.getElementById('tab-requests-count');
  if (tabReqCount) tabReqCount.textContent = s.totalRequests.toLocaleString();

  const totalTokensEl = document.getElementById('val-total-tokens');
  if (totalTokensEl) {
    totalTokensEl.textContent = `${s.totalTokens.toLocaleString()} total tokens (${s.totalPromptTokens.toLocaleString()} in / ${s.totalCompletionTokens.toLocaleString()} out)`;
  }

  const actualCostEl = document.getElementById('val-actual-cost');
  if (actualCostEl) actualCostEl.textContent = '$' + s.totalActualCost.toFixed(4);
  
  const labelActualCost = document.getElementById('label-actual-cost');
  if (labelActualCost) labelActualCost.textContent = '$' + s.totalActualCost.toFixed(4);

  const claudeCostEl = document.getElementById('val-claude-cost');
  if (claudeCostEl) claudeCostEl.textContent = '$' + s.totalClaudeCost.toFixed(4);
  
  const labelClaudeCost = document.getElementById('label-claude-cost');
  if (labelClaudeCost) labelClaudeCost.textContent = '$' + s.totalClaudeCost.toFixed(4);

  const gpt4oCostEl = document.getElementById('val-gpt4o-cost');
  if (gpt4oCostEl) gpt4oCostEl.textContent = '$' + s.totalGpt4oCost.toFixed(4);
  
  const labelGpt4oCost = document.getElementById('label-gpt4o-cost');
  if (labelGpt4oCost) labelGpt4oCost.textContent = '$' + s.totalGpt4oCost.toFixed(4);

  const savingsEl = document.getElementById('val-savings');
  if (savingsEl) savingsEl.textContent = '$' + s.totalSavingsVsClaude.toFixed(4);

  const savingsPctEl = document.getElementById('val-savings-percent');
  if (savingsPctEl) {
    savingsPctEl.textContent = `${s.percentSavedClaude}% saved vs Claude (${s.percentSavedGpt4o}% vs GPT-4o)`;
  }

  const jevSpeedEl = document.getElementById('val-jev-speed');
  if (jevSpeedEl) {
    jevSpeedEl.textContent = (s.avgJevDurationMs || 120) + ' ms';
  }

  // Update comparison bars
  const maxCost = Math.max(s.totalClaudeCost, s.totalGpt4oCost, s.totalActualCost, 0.001);
  const actualPct = Math.max(4, Math.round((s.totalActualCost / maxCost) * 100));
  const claudePct = Math.max(4, Math.round((s.totalClaudeCost / maxCost) * 100));
  const gpt4oPct = Math.max(4, Math.round((s.totalGpt4oCost / maxCost) * 100));

  const barActual = document.getElementById('bar-actual');
  if (barActual) barActual.style.width = actualPct + '%';

  const barClaude = document.getElementById('bar-claude');
  if (barClaude) barClaude.style.width = claudePct + '%';

  const barGpt4o = document.getElementById('bar-gpt4o');
  if (barGpt4o) barGpt4o.style.width = gpt4oPct + '%';

  // Render model distribution
  renderModelDistribution(data.modelBreakdown);
}

function renderModelDistribution(breakdown) {
  const container = document.getElementById('model-distribution-list');
  if (!container) return;
  if (!breakdown || breakdown.length === 0) {
    container.innerHTML = '<div class="empty-state">No requests routed yet. Connect your IDE or test below!</div>';
    return;
  }

  const total = breakdown.reduce((sum, item) => sum + item.count, 0);
  let html = '';

  for (const item of breakdown) {
    const pct = Math.round((item.count / total) * 100);
    const providerBadge = item.provider_used === 'mammouth'
      ? '<span class="badge badge-savings">Mammouth</span>'
      : '<span class="badge badge-gateway">OpenRouter</span>';

    html += `
      <div class="dist-item">
        <div style="min-width: 170px;">
          <div class="dist-model-name">${escapeHtml(item.model_routed)}</div>
          <div style="margin-top: 3px;">${providerBadge}</div>
        </div>
        <div class="dist-bar-wrap">
          <div class="dist-bar-inner" style="width: ${pct}%;"></div>
        </div>
        <div class="dist-stats">
          <strong>${item.count}</strong> req (${pct}%) &middot; $${Number(item.cost).toFixed(4)}
        </div>
      </div>
    `;
  }
  container.innerHTML = html;
}

async function fetchLogs() {
  try {
    const res = await fetch('/api/logs?limit=50');
    if (!res.ok) return;
    const data = await res.json();
    currentLogs = data.logs || [];
    renderLogsTable();
  } catch (err) {
    console.error('Error fetching logs:', err);
  }
}

function renderLogsTable(filter = '') {
  const tbody = document.getElementById('logs-table-body');
  const filtered = currentLogs.filter(log => {
    if (!filter) return true;
    return (
      (log.prompt_preview || '').toLowerCase().includes(filter) ||
      (log.model_routed || '').toLowerCase().includes(filter) ||
      (log.client_agent || '').toLowerCase().includes(filter) ||
      (log.jev_intent || '').toLowerCase().includes(filter)
    );
  });

  const badgeCounter = document.getElementById('logs-counter-badge');
  if (badgeCounter) badgeCounter.textContent = `${filtered.length} Requests`;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="empty-state">
          No matching requests found.
        </td>
      </tr>
    `;
    return;
  }

  let html = '';
  for (const log of filtered) {
    const timeStr = new Date(log.timestamp).toLocaleTimeString();
    const intentBadge = getIntentBadge(log.jev_intent);
    const savings = Number(log.savings_vs_claude || 0);
    const clientName = escapeHtml(log.client_agent || 'client');
    const clientBadgeClass = clientName.includes('cursor') ? 'badge-gateway' : 'badge-purple';

    html += `
      <tr>
        <td style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">${timeStr}</td>
        <td><span class="badge ${clientBadgeClass}">${clientName}</span></td>
        <td style="max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(log.prompt_preview)}">
          ${escapeHtml(log.prompt_preview || '')}
        </td>
        <td>
          ${intentBadge}
          <span class="badge badge-gateway" style="font-size: 10px;">${Number(log.jev_complexity).toFixed(1)}/5</span>
        </td>
        <td>
          <strong style="color: var(--gateway-teal-dark);">${escapeHtml(log.model_routed)}</strong>
          <span style="font-size: 10.5px; color: var(--text-muted); display: block;">via ${escapeHtml(log.provider_used)}</span>
        </td>
        <td style="font-family: var(--font-mono); font-size: 11.5px;">
          ${(log.prompt_tokens + log.completion_tokens).toLocaleString()}
          <span style="font-size: 10px; color: var(--text-muted); display: block;">${log.prompt_tokens} in / ${log.completion_tokens} out</span>
        </td>
        <td style="font-family: var(--font-mono); font-weight: 700; color: var(--gateway-teal-dark);">
          $${Number(log.cost_actual).toFixed(4)}
        </td>
        <td style="font-family: var(--font-mono); color: var(--text-muted);">
          $${Number(log.cost_if_claude).toFixed(4)}
        </td>
        <td style="font-family: var(--font-mono); font-weight: 700; color: var(--savings-green-dark);">
          +$${savings.toFixed(4)}
        </td>
      </tr>
    `;
  }
  tbody.innerHTML = html;
}

function getIntentBadge(intent) {
  if (intent === 'coding_complex') return '<span class="badge badge-purple">Complex Code</span>';
  if (intent === 'coding_simple') return '<span class="badge badge-gateway">Simple Code</span>';
  if (intent === 'deep_reasoning') return '<span class="badge badge-warning">Reasoning</span>';
  if (intent === 'structured_extraction') return '<span class="badge badge-savings">Extraction</span>';
  return `<span class="badge badge-gateway">${escapeHtml(intent || 'standard')}</span>`;
}


async function runPromptTest() {
  const input = document.getElementById('test-prompt-input');
  const prompt = input.value.trim();
  if (!prompt) return;

  const btn = document.getElementById('btn-run-test');
  btn.disabled = true;
  btn.innerHTML = '⚡ Intercepting with Jev...';

  const panel = document.getElementById('test-result-panel');
  panel.classList.remove('hidden');
  panel.innerHTML = '<div class="empty-state">Executing The Parallel Junction: Jev System One non-autoregressive 120ms pass &amp; dynamic aggregator dispatch...</div>';

  try {
    const res = await fetch('/api/test-route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });

    const data = await res.json();
    const j = data.jev || {};
    const c = data.costs || {};
    const providerName = data.selectedProvider === 'openrouter' ? 'OpenRouter' : 'Mammouth AI';
    const providerBadgeClass = data.selectedProvider === 'openrouter' ? 'badge-gateway' : 'badge-savings';

    panel.innerHTML = `
      <div class="route-result-card">
        <div class="result-junction-header">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span class="badge badge-jev">⚡ JEV INTERCEPTION FLASH</span>
            <strong style="font-size: 14px; color: var(--gateway-teal-dark);">${escapeHtml(data.selectedModel)}</strong>
            <span class="badge ${providerBadgeClass}">via ${providerName}</span>
          </div>
          <span style="font-size: 12px; font-weight: 700; color: var(--savings-green-dark); font-family: var(--font-mono);">
            Saved +$${Number(c.savingsVsClaude || 0).toFixed(5)} vs Claude
          </span>
        </div>

        <div class="result-grid-stats">
          <div class="res-stat-box">
            <div class="res-stat-label">Jev Decision Speed</div>
            <div class="res-stat-val" style="color: var(--gateway-teal-light);">⚡ ${j.jevDurationMs || 120} ms</div>
          </div>
          <div class="res-stat-box">
            <div class="res-stat-label">Cognitive Complexity</div>
            <div class="res-stat-val">${Number(j.complexityScore || 0).toFixed(1)} / 5.0</div>
          </div>
          <div class="res-stat-box">
            <div class="res-stat-label">Evaluated Intent</div>
            <div class="res-stat-val">${escapeHtml(j.intent || 'standard')}</div>
          </div>
          <div class="res-stat-box">
            <div class="res-stat-label">Total Tokens</div>
            <div class="res-stat-val">${data.usage?.totalTokens || 0}</div>
          </div>
          <div class="res-stat-box">
            <div class="res-stat-label">Actual Routed Cost</div>
            <div class="res-stat-val" style="color: var(--gateway-teal-dark);">$${Number(c.totalActualCost || 0).toFixed(5)}</div>
          </div>
        </div>

        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 10px;">
          <strong>Routing Rationale:</strong> ${escapeHtml(data.routingReason || '')}
        </div>

        <div class="res-output-box">
          <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px;">
            Streamed Model Output:
          </div>
          <pre style="white-space: pre-wrap; font-family: inherit; font-size: 13px;">${escapeHtml(data.responseContent || 'No response content returned')}</pre>
        </div>
      </div>
    `;
    
    // Refresh optics immediately after test
    fetchMetrics();
    fetchLogs();
  } catch (err) {
    panel.innerHTML = `<div style="color: #D32F2F; padding: 12px;">Error evaluating route: ${escapeHtml(err.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '⚡ Intercept &amp; Route with Jev';
  }
}

async function fetchSettings() {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) return;
    const data = await res.json();
    if (data.port) document.getElementById('port-display').textContent = data.port;
    if (data.typesafeKeyMasked) document.getElementById('input-typesafe-key').placeholder = data.typesafeKeyMasked;
    if (data.mammouthKeyMasked) document.getElementById('input-mammouth-key').placeholder = data.mammouthKeyMasked;
    if (data.openrouterKeyMasked) document.getElementById('input-openrouter-key').placeholder = data.openrouterKeyMasked;
    if (data.anthropicKeyMasked) document.getElementById('input-anthropic-key').placeholder = data.anthropicKeyMasked;
    if (data.openaiKeyMasked) document.getElementById('input-openai-key').placeholder = data.openaiKeyMasked;
    if (data.mistralKeyMasked) document.getElementById('input-mistral-key').placeholder = data.mistralKeyMasked;
    if (data.deepseekKeyMasked) document.getElementById('input-deepseek-key').placeholder = data.deepseekKeyMasked;
    if (data.geminiKeyMasked) document.getElementById('input-gemini-key').placeholder = data.geminiKeyMasked;
    if (data.routingStrategy) document.getElementById('select-strategy').value = data.routingStrategy;
    if (data.defaultProvider) document.getElementById('select-provider').value = data.defaultProvider;
  } catch (err) {
    console.error('Error fetching settings:', err);
  }
}

function openSettingsModal() {
  document.getElementById('settings-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeSettingsModal() {
  document.getElementById('settings-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

async function saveSettings() {
  const typesafeApiKey = document.getElementById('input-typesafe-key').value;
  const mammouthApiKey = document.getElementById('input-mammouth-key').value;
  const openrouterApiKey = document.getElementById('input-openrouter-key').value;
  const anthropicApiKey = document.getElementById('input-anthropic-key').value;
  const openaiApiKey = document.getElementById('input-openai-key').value;
  const mistralApiKey = document.getElementById('input-mistral-key').value;
  const deepseekApiKey = document.getElementById('input-deepseek-key').value;
  const geminiApiKey = document.getElementById('input-gemini-key').value;
  const routingStrategy = document.getElementById('select-strategy').value;
  const defaultProvider = document.getElementById('select-provider').value;

  const payload = { routingStrategy, defaultProvider };
  if (typesafeApiKey) payload.typesafeApiKey = typesafeApiKey;
  if (mammouthApiKey) payload.mammouthApiKey = mammouthApiKey;
  if (openrouterApiKey) payload.openrouterApiKey = openrouterApiKey;
  if (anthropicApiKey) payload.anthropicApiKey = anthropicApiKey;
  if (openaiApiKey) payload.openaiApiKey = openaiApiKey;
  if (mistralApiKey) payload.mistralApiKey = mistralApiKey;
  if (deepseekApiKey) payload.deepseekApiKey = deepseekApiKey;
  if (geminiApiKey) payload.geminiApiKey = geminiApiKey;

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      closeSettingsModal();
      fetchSettings();
      alert('Settings saved successfully!');
    }
  } catch (err) {
    alert('Failed to save settings: ' + err.message);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


async function fetchCatalog() {
  try {
    const search = document.getElementById('catalog-search')?.value || '';
    const tier = document.getElementById('catalog-tier-filter')?.value || 'all';

    const res = await fetch(`/api/catalog?search=${encodeURIComponent(search)}&tier=${tier}`);
    if (!res.ok) return;
    const data = await res.json();

    const countDisplay = document.getElementById('catalog-count-display');
    if (countDisplay) countDisplay.textContent = data.total;

    const tabCount = document.getElementById('tab-models-count');
    if (tabCount) tabCount.textContent = data.total;

    renderCatalogTable(data);
  } catch (err) {
    console.error('Error fetching catalog:', err);
  }
}

function renderCatalogTable(data) {
  const tbody = document.getElementById('catalog-table-body');
  const summary = document.getElementById('catalog-modal-summary');
  if (!tbody) return;

  if (summary) {
    summary.textContent = `Showing ${data.filteredCount} of ${data.total} synchronized models`;
  }

  if (!data.models || data.models.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">
          No models found matching criteria. Click 'Sync Live Rates' to refresh from aggregators.
        </td>
      </tr>
    `;
    return;
  }

  let html = '';
  for (const m of data.models) {
    const promptPriceMTok = (m.promptPrice * 1_000_000).toFixed(3);
    const completionPriceMTok = (m.completionPrice * 1_000_000).toFixed(3);
    const tierBadge = getTierBadge(m.tier);
    const providerBadge = m.provider === 'both'
      ? '<span class="badge badge-savings">Mammouth &amp; OR</span>'
      : (m.provider === 'mammouth' ? '<span class="badge badge-savings">Mammouth</span>' : '<span class="badge badge-gateway">OpenRouter</span>');

    html += `
      <tr>
        <td>
          <div style="font-family: var(--font-mono); font-weight: 700; font-size: 12.5px; color: var(--gateway-teal-dark);">${escapeHtml(m.id)}</div>
          <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(m.name || '')}</div>
        </td>
        <td>${providerBadge}</td>
        <td>${tierBadge}</td>
        <td style="font-family: var(--font-mono); font-weight: 600; color: var(--gateway-teal-dark);">$${promptPriceMTok}/M</td>
        <td style="font-family: var(--font-mono); font-weight: 600; color: var(--gateway-teal-light);">$${completionPriceMTok}/M</td>
        <td style="font-family: var(--font-mono); font-size: 11px; color: var(--text-gray);">${m.contextLength ? (m.contextLength / 1000).toFixed(0) + 'k' : 'N/A'}</td>
      </tr>
    `;
  }
  tbody.innerHTML = html;
}

function getTierBadge(tier) {
  if (tier === 'frontier_reasoning') return '<span class="badge badge-warning">Reasoning</span>';
  if (tier === 'frontier_coding') return '<span class="badge badge-purple">Frontier Coding</span>';
  if (tier === 'balanced') return '<span class="badge badge-gateway">Balanced</span>';
  if (tier === 'fast_cheap') return '<span class="badge badge-savings">Fast &amp; Cheap</span>';
  return `<span class="badge badge-gateway">${escapeHtml(tier)}</span>`;
}

function openCatalogModal() {
  document.getElementById('catalog-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  fetchCatalog();
}

function closeCatalogModal() {
  document.getElementById('catalog-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

async function triggerCatalogSync() {
  const syncButtons = [
    document.getElementById('btn-sync-catalog'),
    document.getElementById('btn-modal-sync-catalog')
  ];
  syncButtons.forEach(b => { if (b) { b.disabled = true; b.textContent = 'Syncing...'; } });

  try {
    const res = await fetch('/api/catalog/sync', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert(`Successfully synchronized ${data.count} models with live aggregator rates!`);
      fetchCatalog();
    } else {
      alert(`Sync failed: ${data.error}`);
    }
  } catch (err) {
    alert(`Sync request failed: ${err.message}`);
  } finally {
    syncButtons.forEach(b => {
      if (b) {
        b.disabled = false;
        b.textContent = b.id === 'btn-modal-sync-catalog' ? '🔄 Sync Live Rates' : '🔄 Sync Aggregators';
      }
    });
  }
}

