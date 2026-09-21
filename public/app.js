// Prompt-Router Dashboard Logic

let currentLogs = [];

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  fetchMetrics();
  fetchLogs();
  fetchSettings();
  fetchCatalog();

  // Polling every 4 seconds for live optics
  setInterval(() => {
    fetchMetrics();
    fetchLogs();
  }, 4000);

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
  document.getElementById('btn-close-catalog-footer').addEventListener('click', closeCatalogModal);
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

  // Filter input
  document.getElementById('log-search').addEventListener('input', (e) => {
    renderLogsTable(e.target.value.toLowerCase());
  });
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
  document.getElementById('val-total-requests').textContent = s.totalRequests.toLocaleString();
  document.getElementById('val-total-tokens').textContent =
    `${s.totalTokens.toLocaleString()} total tokens (${s.totalPromptTokens.toLocaleString()} in / ${s.totalCompletionTokens.toLocaleString()} out)`;

  document.getElementById('val-actual-cost').textContent = '$' + s.totalActualCost.toFixed(4);
  document.getElementById('label-actual-cost').textContent = '$' + s.totalActualCost.toFixed(4);

  document.getElementById('val-claude-cost').textContent = '$' + s.totalClaudeCost.toFixed(4);
  document.getElementById('label-claude-cost').textContent = '$' + s.totalClaudeCost.toFixed(4);

  document.getElementById('val-gpt4o-cost').textContent = '$' + s.totalGpt4oCost.toFixed(4);
  document.getElementById('label-gpt4o-cost').textContent = '$' + s.totalGpt4oCost.toFixed(4);

  document.getElementById('val-savings').textContent = '$' + s.totalSavingsVsClaude.toFixed(4);
  document.getElementById('val-savings-percent').textContent =
    `${s.percentSavedClaude}% saved vs Claude (${s.percentSavedGpt4o}% vs GPT-4o)`;

  document.getElementById('val-jev-speed').textContent = s.avgJevDurationMs + ' ms';

  // Update comparison bars
  const maxCost = Math.max(s.totalClaudeCost, s.totalGpt4oCost, s.totalActualCost, 0.001);
  const actualPct = Math.max(4, Math.round((s.totalActualCost / maxCost) * 100));
  const claudePct = Math.max(4, Math.round((s.totalClaudeCost / maxCost) * 100));
  const gpt4oPct = Math.max(4, Math.round((s.totalGpt4oCost / maxCost) * 100));

  document.getElementById('bar-actual').style.width = actualPct + '%';
  document.getElementById('bar-claude').style.width = claudePct + '%';
  document.getElementById('bar-gpt4o').style.width = gpt4oPct + '%';

  // Render model distribution
  renderModelDistribution(data.modelBreakdown);
}

function renderModelDistribution(breakdown) {
  const container = document.getElementById('model-distribution-list');
  if (!breakdown || breakdown.length === 0) {
    container.innerHTML = '<div class="empty-state">No requests routed yet. Connect your IDE or test below!</div>';
    return;
  }

  const total = breakdown.reduce((sum, item) => sum + item.count, 0);
  let html = '';

  for (const item of breakdown) {
    const pct = Math.round((item.count / total) * 100);
    html += `
      <div class="dist-item">
        <div>
          <span class="dist-name">${escapeHtml(item.model_routed)}</span>
          <span class="badge badge-blue ml-2">${escapeHtml(item.provider_used)}</span>
        </div>
        <div class="dist-meta">
          <strong>${item.count}</strong> requests (${pct}%) &middot; ${item.tokens.toLocaleString()} tokens &middot; $${Number(item.cost).toFixed(4)}
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

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-4" style="color: var(--text-muted);">
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

    html += `
      <tr>
        <td style="font-family: var(--font-mono); font-size: 11px;">${timeStr}</td>
        <td><span class="badge badge-purple">${escapeHtml(log.client_agent || 'client')}</span></td>
        <td style="max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(log.prompt_preview)}">
          ${escapeHtml(log.prompt_preview || '')}
        </td>
        <td>
          ${intentBadge}
          <span class="badge badge-blue">Score: ${Number(log.jev_complexity).toFixed(1)}/5</span>
        </td>
        <td>
          <strong>${escapeHtml(log.model_routed)}</strong>
          <span style="font-size: 11px; color: var(--text-muted); display: block;">via ${escapeHtml(log.provider_used)}</span>
        </td>
        <td style="font-family: var(--font-mono); font-size: 12px;">
          ${(log.prompt_tokens + log.completion_tokens).toLocaleString()}
          <span style="font-size: 10px; color: var(--text-muted); display: block;">${log.prompt_tokens} in / ${log.completion_tokens} out</span>
        </td>
        <td style="font-family: var(--font-mono); font-weight: 600; color: #60a5fa;">
          $${Number(log.cost_actual).toFixed(4)}
        </td>
        <td style="font-family: var(--font-mono); color: #f59e0b;">
          $${Number(log.cost_if_claude).toFixed(4)}
        </td>
        <td style="font-family: var(--font-mono); font-weight: 700; color: #10b981;">
          +$${savings.toFixed(4)}
        </td>
      </tr>
    `;
  }
  tbody.innerHTML = html;
}

function getIntentBadge(intent) {
  if (intent === 'coding_complex') return '<span class="badge badge-purple">Complex Code</span>';
  if (intent === 'coding_simple') return '<span class="badge badge-blue">Simple Code</span>';
  if (intent === 'deep_reasoning') return '<span class="badge badge-amber">Deep Reasoning</span>';
  if (intent === 'structured_extraction') return '<span class="badge badge-emerald">Extraction</span>';
  return `<span class="badge badge-blue">${escapeHtml(intent || 'standard')}</span>`;
}


async function runPromptTest() {
  const input = document.getElementById('test-prompt-input');
  const prompt = input.value.trim();
  if (!prompt) return;

  const btn = document.getElementById('btn-run-test');
  btn.disabled = true;
  btn.textContent = 'Evaluating & Executing...';

  const panel = document.getElementById('test-result-panel');
  panel.classList.remove('hidden');
  panel.innerHTML = '<div style="color: var(--text-muted);">Step 1: Evaluating with TypeSafe Jev System One...<br>Step 2: Dispatching prompt to model aggregator...</div>';

  try {
    const res = await fetch('/api/test-route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });

    const data = await res.json();
    const j = data.jev;
    const c = data.costs || {};
    const providerName = data.selectedProvider === 'openrouter' ? 'OpenRouter' : 'Mammouth AI';
    const providerBadgeClass = data.selectedProvider === 'openrouter' ? 'badge-purple' : 'badge-emerald';

    panel.innerHTML = `
      <div class="result-grid">
        <div class="result-stat">
          <span class="result-stat-label">Jev Intent Class</span>
          <span class="result-stat-val text-accent">${j.intent} (${Math.round(j.intentConfidence * 100)}% conf)</span>
        </div>
        <div class="result-stat">
          <span class="result-stat-label">Cognitive Complexity</span>
          <span class="result-stat-val">${Number(j.complexityScore).toFixed(1)} / 5.0</span>
        </div>
        <div class="result-stat">
          <span class="result-stat-label">Needs Reasoner Model</span>
          <span class="result-stat-val">${Math.round(j.needsReasoner * 100)}% prob</span>
        </div>
        <div class="result-stat">
          <span class="result-stat-label">Jev Decision Speed</span>
          <span class="result-stat-val text-emerald">${j.jevDurationMs} ms</span>
        </div>
      </div>

      <div style="margin-top: 10px; padding: 12px; background: rgba(59, 130, 246, 0.08); border-radius: 8px; border: 1px solid rgba(59, 130, 246, 0.2); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
        <div>
          <strong>Routed Model:</strong> <code style="color: #93c5fd; font-weight: 700; font-size: 14px;">${escapeHtml(data.selectedModel)}</code>
          <span style="font-size: 12px; color: var(--text-muted); display: block; margin-top: 2px;">${escapeHtml(data.routingReason)}</span>
        </div>
        <div>
          <span class="badge ${providerBadgeClass}" style="font-size: 13px; padding: 6px 14px; letter-spacing: 0.03em;">
            via ${providerName}
          </span>
        </div>
      </div>

      <div style="margin-top: 12px; background: rgba(0, 0, 0, 0.35); border: 1px solid var(--border); border-radius: 8px; padding: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">
            💬 Response from ${escapeHtml(data.selectedModel)} (via ${providerName}):
          </span>
          <span style="font-size: 11px; font-family: var(--font-mono); color: var(--text-muted);">
            Tokens: ${data.usage?.promptTokens || 0} in / ${data.usage?.completionTokens || 0} out (${data.usage?.totalTokens || 0} total)
          </span>
        </div>
        <pre style="white-space: pre-wrap; font-family: inherit; font-size: 13px; line-height: 1.6; color: var(--text-primary); max-height: 280px; overflow-y: auto; background: rgba(255,255,255,0.02); padding: 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">${escapeHtml(data.responseContent || 'No response content returned')}</pre>
      </div>

      <div style="margin-top: 10px; font-size: 12px; color: var(--text-secondary);">
        Actual Spend: <strong>$${(c.totalActualCost || 0).toFixed(5)}</strong> &middot;
        Claude 3.5 Would Cost: <strong>$${(c.costIfClaude || 0).toFixed(5)}</strong> &middot;
        Savings: <strong style="color: #10b981;">+$${(c.savingsVsClaude || 0).toFixed(5)} (${Math.round(((c.savingsVsClaude || 0) / Math.max(0.0001, c.costIfClaude || 0)) * 100)}%)</strong>
      </div>
    `;
  } catch (err) {
    panel.innerHTML = `<div style="color: #f43f5e;">Error evaluating test: ${err.message}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '⚡ Evaluate Route with Jev';
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
    if (data.routingStrategy) document.getElementById('select-strategy').value = data.routingStrategy;
    if (data.defaultProvider) document.getElementById('select-provider').value = data.defaultProvider;
  } catch (err) {
    console.error('Error fetching settings:', err);
  }
}

function openSettingsModal() {
  document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettingsModal() {
  document.getElementById('settings-modal').classList.add('hidden');
}

async function saveSettings() {
  const typesafeApiKey = document.getElementById('input-typesafe-key').value;
  const mammouthApiKey = document.getElementById('input-mammouth-key').value;
  const openrouterApiKey = document.getElementById('input-openrouter-key').value;
  const routingStrategy = document.getElementById('select-strategy').value;
  const defaultProvider = document.getElementById('select-provider').value;

  const payload = { routingStrategy, defaultProvider };
  if (typesafeApiKey) payload.typesafeApiKey = typesafeApiKey;
  if (mammouthApiKey) payload.mammouthApiKey = mammouthApiKey;
  if (openrouterApiKey) payload.openrouterApiKey = openrouterApiKey;

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
        <td colspan="6" class="text-center py-4" style="color: var(--text-muted);">
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
      ? '<span class="badge badge-emerald">Mammouth &amp; OR</span>'
      : (m.provider === 'mammouth' ? '<span class="badge badge-blue">Mammouth</span>' : '<span class="badge badge-purple">OpenRouter</span>');

    html += `
      <tr>
        <td>
          <div style="font-family: var(--font-mono); font-weight: 600; font-size: 13px;">${escapeHtml(m.id)}</div>
          <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(m.name || '')}</div>
        </td>
        <td>${providerBadge}</td>
        <td>${tierBadge}</td>
        <td style="font-family: var(--font-mono); color: #60a5fa;">$${promptPriceMTok}/M</td>
        <td style="font-family: var(--font-mono); color: #93c5fd;">$${completionPriceMTok}/M</td>
        <td style="font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary);">${m.contextLength ? (m.contextLength / 1000).toFixed(0) + 'k' : 'N/A'}</td>
      </tr>
    `;
  }
  tbody.innerHTML = html;
}

function getTierBadge(tier) {
  if (tier === 'frontier_reasoning') return '<span class="badge badge-amber">Reasoning</span>';
  if (tier === 'frontier_coding') return '<span class="badge badge-purple">Frontier Coding</span>';
  if (tier === 'balanced') return '<span class="badge badge-blue">Balanced</span>';
  if (tier === 'fast_cheap') return '<span class="badge badge-emerald">Fast &amp; Cheap</span>';
  return `<span class="badge badge-blue">${escapeHtml(tier)}</span>`;
}

function openCatalogModal() {
  document.getElementById('catalog-modal').classList.remove('hidden');
  fetchCatalog();
}

function closeCatalogModal() {
  document.getElementById('catalog-modal').classList.add('hidden');
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

