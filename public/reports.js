/**
 * Prompt-Router Detailed Reporting & Decision Intelligence
 * Client-Side Application Logic
 */

let currentFilters = {
  timeframe: 'all',
  provider: 'all',
  model: 'all',
  intent: 'all',
  client: 'all',
  search: '',
  limit: 50,
  offset: 0
};

let currentReportData = null;
let currentView = 'models';
let searchDebounceTimer = null;
let filterOptionsLoaded = false;

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initFilters();
  initViewTabs();
  initInspectorTabs();
  initPagination();
  initActions();
  fetchReportData();
});

function initTheme() {
  const savedTheme = localStorage.getItem('prompt_router_theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
  applyTheme(initialTheme);

  const btnTheme = document.getElementById('btn-theme-toggle');
  if (btnTheme) {
    btnTheme.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('prompt_router_theme', theme);
  const icon = document.getElementById('theme-btn-icon');
  const text = document.getElementById('theme-btn-text');
  if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  if (text) text.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
}

function initFilters() {
  // Timeframe pills
  document.querySelectorAll('.btn-time-pill').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.btn-time-pill').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      currentFilters.timeframe = e.currentTarget.getAttribute('data-timeframe');
      currentFilters.offset = 0;
      fetchReportData();
    });
  });

  // Dropdown selects
  const providerSel = document.getElementById('filter-provider');
  const modelSel = document.getElementById('filter-model');
  const intentSel = document.getElementById('filter-intent');
  const clientSel = document.getElementById('filter-client');

  providerSel?.addEventListener('change', (e) => {
    currentFilters.provider = e.target.value;
    currentFilters.offset = 0;
    fetchReportData();
  });

  modelSel?.addEventListener('change', (e) => {
    currentFilters.model = e.target.value;
    currentFilters.offset = 0;
    fetchReportData();
  });

  intentSel?.addEventListener('change', (e) => {
    currentFilters.intent = e.target.value;
    currentFilters.offset = 0;
    fetchReportData();
  });

  clientSel?.addEventListener('change', (e) => {
    currentFilters.client = e.target.value;
    currentFilters.offset = 0;
    fetchReportData();
  });

  // Search input with debounce
  const searchInput = document.getElementById('filter-search');
  searchInput?.addEventListener('input', (e) => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      currentFilters.search = e.target.value.trim();
      currentFilters.offset = 0;
      fetchReportData();
    }, 300);
  });

  // Clear filters
  document.getElementById('btn-reset-filters')?.addEventListener('click', () => {
    currentFilters = {
      timeframe: 'all',
      provider: 'all',
      model: 'all',
      intent: 'all',
      client: 'all',
      search: '',
      limit: currentFilters.limit,
      offset: 0
    };

    document.querySelectorAll('.btn-time-pill').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-timeframe') === 'all');
    });

    if (providerSel) providerSel.value = 'all';
    if (modelSel) modelSel.value = 'all';
    if (intentSel) intentSel.value = 'all';
    if (clientSel) clientSel.value = 'all';
    if (searchInput) searchInput.value = '';

    fetchReportData();
  });
}

function initViewTabs() {
  const tabs = document.querySelectorAll('.reports-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      tabs.forEach(t => t.classList.remove('active'));
      e.currentTarget.classList.add('active');

      const view = e.currentTarget.getAttribute('data-view');
      currentView = view;

      document.querySelectorAll('.report-view-content').forEach(p => p.classList.add('hidden'));
      const activePanel = document.getElementById(`view-panel-${view}`);
      if (activePanel) activePanel.classList.remove('hidden');
    });
  });
}

function initInspectorTabs() {
  const tabs = document.querySelectorAll('.inspector-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      tabs.forEach(t => t.classList.remove('active'));
      e.currentTarget.classList.add('active');

      const tabId = e.currentTarget.getAttribute('data-tab');
      document.querySelectorAll('.inspector-panel-content').forEach(p => p.classList.add('hidden'));
      const activePanel = document.getElementById(`inspect-panel-${tabId}`);
      if (activePanel) activePanel.classList.remove('hidden');
    });
  });

  const closeModal = () => {
    document.getElementById('modal-decision-inspector')?.classList.add('hidden');
  };

  document.getElementById('btn-close-inspector')?.addEventListener('click', closeModal);
  document.getElementById('btn-close-inspector-footer')?.addEventListener('click', closeModal);
  document.getElementById('modal-decision-inspector')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-decision-inspector') closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

function initPagination() {
  document.getElementById('btn-prev-page')?.addEventListener('click', () => {
    if (currentFilters.offset > 0) {
      currentFilters.offset = Math.max(0, currentFilters.offset - currentFilters.limit);
      fetchReportData();
    }
  });

  document.getElementById('btn-next-page')?.addEventListener('click', () => {
    if (currentReportData && currentFilters.offset + currentFilters.limit < (currentReportData.pagination?.total || 0)) {
      currentFilters.offset += currentFilters.limit;
      fetchReportData();
    }
  });

  document.getElementById('page-size-select')?.addEventListener('change', (e) => {
    currentFilters.limit = parseInt(e.target.value, 10);
    currentFilters.offset = 0;
    fetchReportData();
  });
}

function initActions() {
  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    fetchReportData();
  });

  document.getElementById('btn-export-csv')?.addEventListener('click', () => {
    const params = new URLSearchParams();
    if (currentFilters.timeframe !== 'all') params.set('timeframe', currentFilters.timeframe);
    if (currentFilters.provider !== 'all') params.set('provider', currentFilters.provider);
    if (currentFilters.model !== 'all') params.set('model', currentFilters.model);
    if (currentFilters.intent !== 'all') params.set('intent', currentFilters.intent);
    if (currentFilters.client !== 'all') params.set('client', currentFilters.client);
    if (currentFilters.search) params.set('search', currentFilters.search);
    params.set('format', 'csv');
    params.set('limit', '1000');

    window.location.href = `/api/reports?${params.toString()}`;
  });
}

async function fetchReportData() {
  const qs = new URLSearchParams();
  if (currentFilters.timeframe !== 'all') qs.set('timeframe', currentFilters.timeframe);
  if (currentFilters.provider !== 'all') qs.set('provider', currentFilters.provider);
  if (currentFilters.model !== 'all') qs.set('model', currentFilters.model);
  if (currentFilters.intent !== 'all') qs.set('intent', currentFilters.intent);
  if (currentFilters.client !== 'all') qs.set('client', currentFilters.client);
  if (currentFilters.search) qs.set('search', currentFilters.search);
  qs.set('limit', String(currentFilters.limit));
  qs.set('offset', String(currentFilters.offset));

  try {
    const res = await fetch(`/api/reports?${qs.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    currentReportData = data;

    if (!filterOptionsLoaded && data.filterOptions) {
      populateFilterOptions(data.filterOptions);
      filterOptionsLoaded = true;
    }

    renderSummaryKPIs(data.summary);
    renderModelsTable(data.modelBreakdown, data.summary?.total_requests || 0);
    renderProvidersTable(data.providerBreakdown, data.summary?.total_requests || 0);
    renderIntentsTable(data.intentBreakdown);
    renderLogsTable(data.logs);
    renderPagination(data.pagination);
  } catch (err) {
    console.error('Failed to fetch reporting data:', err);
  }
}

function populateFilterOptions(options) {
  const populate = (selectId, items, placeholder) => {
    const sel = document.getElementById(selectId);
    if (!sel || !items) return;
    const currentVal = sel.value;
    sel.innerHTML = `<option value="all">${placeholder}</option>`;
    items.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item;
      opt.textContent = item;
      sel.appendChild(opt);
    });
    sel.value = currentVal;
  };

  populate('filter-provider', options.providers, 'All Providers');
  populate('filter-model', options.models, 'All Models');
  populate('filter-intent', options.intents, 'All Intents');
  populate('filter-client', options.clients, 'All Client Agents');
}

function renderSummaryKPIs(s) {
  if (!s) return;
  const totalReq = Number(s.total_requests || 0);
  const promptTokens = Number(s.total_prompt_tokens || 0);
  const completionTokens = Number(s.total_completion_tokens || 0);
  const totalTokens = Number(s.total_tokens || 0);
  const actualCost = Number(s.total_actual_cost || 0);
  const claudeCost = Number(s.total_claude_cost || 0);
  const savings = Number(s.total_savings_claude || 0);
  const avgDuration = Math.round(Number(s.avg_duration_ms || 0));
  const avgJev = Math.round(Number(s.avg_jev_duration_ms || 0));

  document.getElementById('kpi-total-requests').textContent = totalReq.toLocaleString();
  document.getElementById('kpi-prompt-tokens').textContent = promptTokens.toLocaleString();
  document.getElementById('kpi-completion-tokens').textContent = completionTokens.toLocaleString();
  document.getElementById('kpi-total-tokens').textContent = totalTokens.toLocaleString();

  const ratio = completionTokens > 0 ? (promptTokens / completionTokens).toFixed(2) : '-';
  document.getElementById('kpi-token-ratio').textContent = `In/Out Ratio: ${ratio}:1`;

  document.getElementById('kpi-actual-cost').textContent = `$${actualCost.toFixed(4)}`;
  document.getElementById('kpi-claude-cost').textContent = `$${claudeCost.toFixed(4)}`;
  document.getElementById('kpi-total-savings').textContent = `+$${savings.toFixed(4)}`;

  const savingsRate = claudeCost > 0 ? Math.round((savings / claudeCost) * 100) : 0;
  document.getElementById('kpi-savings-percent').textContent = `${savingsRate}% Savings Rate`;

  document.getElementById('kpi-avg-latency').textContent = `⚡ ${avgJev}ms / ${avgDuration}ms`;
}

function renderModelsTable(models, totalReqs) {
  const tbody = document.getElementById('models-table-body');
  const countBadge = document.getElementById('count-models');
  if (countBadge) countBadge.textContent = (models || []).length;
  if (!tbody) return;

  if (!models || models.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty-state">No model activity matching current filters.</td></tr>';
    return;
  }

  tbody.innerHTML = models.map(m => {
    const count = Number(m.count || 0);
    const share = totalReqs > 0 ? ((count / totalReqs) * 100).toFixed(1) : '0.0';
    const promptTokens = Number(m.prompt_tokens || 0);
    const completionTokens = Number(m.completion_tokens || 0);
    const totalTokens = Number(m.total_tokens || 0);
    const costActual = Number(m.cost_actual || 0);
    const costClaude = Number(m.cost_claude || 0);
    const savings = Number(m.savings || 0);
    const avgDuration = Math.round(Number(m.avg_duration_ms || 0));

    const providerClass = m.provider_used === 'openrouter' ? 'badge-gateway' : 'badge-savings';

    return `
      <tr>
        <td><strong style="color: var(--gateway-teal-dark);">${escapeHtml(m.model_routed || 'unknown')}</strong></td>
        <td><span class="badge ${providerClass}">${escapeHtml(m.provider_used || '-')}</span></td>
        <td style="text-align: right; font-weight: 700;">${count.toLocaleString()}</td>
        <td style="text-align: right;">${share}%</td>
        <td style="text-align: right; font-family: var(--font-mono);">${promptTokens.toLocaleString()}</td>
        <td style="text-align: right; font-family: var(--font-mono);">${completionTokens.toLocaleString()}</td>
        <td style="text-align: right; font-family: var(--font-mono); font-weight: 700;">${totalTokens.toLocaleString()}</td>
        <td style="text-align: right; font-family: var(--font-mono); color: var(--gateway-teal-dark);">$${costActual.toFixed(4)}</td>
        <td style="text-align: right; font-family: var(--font-mono); color: var(--text-muted);">$${costClaude.toFixed(4)}</td>
        <td style="text-align: right; font-family: var(--font-mono); color: var(--savings-green-dark); font-weight: 700;">+$${savings.toFixed(4)}</td>
        <td style="text-align: right; font-family: var(--font-mono);">${avgDuration}ms</td>
      </tr>
    `;
  }).join('');
}

function renderProvidersTable(providers, totalReqs) {
  const tbody = document.getElementById('providers-table-body');
  const countBadge = document.getElementById('count-providers');
  if (countBadge) countBadge.textContent = (providers || []).length;
  if (!tbody) return;

  if (!providers || providers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-state">No provider activity matching current filters.</td></tr>';
    return;
  }

  tbody.innerHTML = providers.map(p => {
    const count = Number(p.count || 0);
    const share = totalReqs > 0 ? ((count / totalReqs) * 100).toFixed(1) : '0.0';
    const promptTokens = Number(p.prompt_tokens || 0);
    const completionTokens = Number(p.completion_tokens || 0);
    const totalTokens = Number(p.total_tokens || 0);
    const costActual = Number(p.cost_actual || 0);
    const savings = Number(p.savings || 0);
    const avgDuration = Math.round(Number(p.avg_duration_ms || 0));

    const ratePerMillion = totalTokens > 0 ? ((costActual / totalTokens) * 1000000).toFixed(4) : '0.0000';
    const providerClass = p.provider_used === 'openrouter' ? 'badge-gateway' : 'badge-savings';

    return `
      <tr>
        <td><span class="badge ${providerClass}" style="font-size: 13px; font-weight: 700;">${escapeHtml(p.provider_used || '-')}</span></td>
        <td style="text-align: right; font-weight: 700;">${count.toLocaleString()}</td>
        <td style="text-align: right;">${share}%</td>
        <td style="text-align: right; font-family: var(--font-mono);">${promptTokens.toLocaleString()}</td>
        <td style="text-align: right; font-family: var(--font-mono);">${completionTokens.toLocaleString()}</td>
        <td style="text-align: right; font-family: var(--font-mono); font-weight: 700;">${totalTokens.toLocaleString()}</td>
        <td style="text-align: right; font-family: var(--font-mono); color: var(--gateway-teal-dark); font-weight: 700;">$${costActual.toFixed(4)}</td>
        <td style="text-align: right; font-family: var(--font-mono); color: var(--gateway-teal-light);">$${ratePerMillion}</td>
        <td style="text-align: right; font-family: var(--font-mono); color: var(--savings-green-dark); font-weight: 700;">+$${savings.toFixed(4)}</td>
        <td style="text-align: right; font-family: var(--font-mono);">${avgDuration}ms</td>
      </tr>
    `;
  }).join('');
}

function renderIntentsTable(intents) {
  const tbody = document.getElementById('intents-table-body');
  const countBadge = document.getElementById('count-intents');
  if (countBadge) countBadge.textContent = (intents || []).length;
  if (!tbody) return;

  if (!intents || intents.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No task intents recorded.</td></tr>';
    return;
  }

  tbody.innerHTML = intents.map(i => {
    const count = Number(i.count || 0);
    const complexity = Number(i.avg_complexity || 0).toFixed(1);
    const promptTokens = Number(i.prompt_tokens || 0);
    const completionTokens = Number(i.completion_tokens || 0);
    const totalTokens = Number(i.total_tokens || 0);
    const costActual = Number(i.cost_actual || 0);
    const savings = Number(i.savings || 0);

    return `
      <tr>
        <td>${getIntentBadge(i.jev_intent)}</td>
        <td style="text-align: right; font-weight: 700;">${count.toLocaleString()}</td>
        <td style="text-align: right; font-family: var(--font-mono);">${complexity} / 5.0</td>
        <td style="text-align: right; font-family: var(--font-mono);">${promptTokens.toLocaleString()}</td>
        <td style="text-align: right; font-family: var(--font-mono);">${completionTokens.toLocaleString()}</td>
        <td style="text-align: right; font-family: var(--font-mono); font-weight: 700;">${totalTokens.toLocaleString()}</td>
        <td style="text-align: right; font-family: var(--font-mono); color: var(--gateway-teal-dark); font-weight: 700;">$${costActual.toFixed(4)}</td>
        <td style="text-align: right; font-family: var(--font-mono); color: var(--savings-green-dark); font-weight: 700;">+$${savings.toFixed(4)}</td>
      </tr>
    `;
  }).join('');
}

function renderLogsTable(logs) {
  const tbody = document.getElementById('logs-table-body');
  const countBadge = document.getElementById('count-logs');
  if (countBadge && currentReportData) {
    countBadge.textContent = (currentReportData.pagination?.total || 0).toLocaleString();
  }
  if (!tbody) return;

  if (!logs || logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty-state">No request logs match current filter criteria.</td></tr>';
    return;
  }

  tbody.innerHTML = logs.map(log => {
    const timeStr = formatTimestamp(log.timestamp);
    const promptTokens = Number(log.prompt_tokens || 0);
    const completionTokens = Number(log.completion_tokens || 0);
    const costActual = Number(log.cost_actual || 0);
    const savings = Number(log.savings_vs_claude || 0);
    const duration = log.duration_ms || 0;
    const jevDuration = log.jev_duration_ms || 120;
    const providerClass = log.provider_used === 'openrouter' ? 'badge-gateway' : 'badge-savings';

    const reasonSnippet = log.routing_reason
      ? escapeHtml(log.routing_reason.length > 55 ? log.routing_reason.slice(0, 52) + '...' : log.routing_reason)
      : `<span style="color: var(--text-muted); font-style: italic;">Heuristic dispatch</span>`;

    return `
      <tr>
        <td style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); white-space: nowrap;">${timeStr}</td>
        <td>
          <a href="javascript:void(0)" onclick="openInspector('${escapeHtml(log.id)}')" style="font-family: var(--font-mono); font-size: 12px; font-weight: 700; color: var(--gateway-teal);">
            ${escapeHtml(log.id.slice(0, 14))}
          </a>
        </td>
        <td><span class="badge badge-client">${escapeHtml(log.client_agent || 'unknown')}</span></td>
        <td><strong style="color: var(--gateway-teal-dark);">${escapeHtml(log.model_routed || '-')}</strong></td>
        <td><span class="badge ${providerClass}">${escapeHtml(log.provider_used || '-')}</span></td>
        <td>
          <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
            ${getIntentBadge(log.jev_intent)}
            <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">${Number(log.jev_complexity || 0).toFixed(1)}/5</span>
          </div>
        </td>
        <td style="text-align: right; font-family: var(--font-mono); white-space: nowrap;">
          <span style="color: var(--gateway-teal);">${promptTokens}</span> / <span style="color: var(--gateway-teal-light);">${completionTokens}</span>
        </td>
        <td style="text-align: right; font-family: var(--font-mono); white-space: nowrap;">
          <span style="color: var(--gateway-teal-dark); font-weight: 600;">$${costActual.toFixed(4)}</span>
          <span style="color: var(--savings-green-dark); font-weight: 700; margin-left: 4px;">+$${savings.toFixed(4)}</span>
        </td>
        <td style="text-align: right; font-family: var(--font-mono); font-size: 11.5px; white-space: nowrap;">
          <span style="color: var(--gateway-teal-light);">⚡ ${jevDuration}ms</span> / ${duration}ms
        </td>
        <td style="font-size: 12px; color: var(--text-gray);" title="${escapeHtml(log.routing_reason || '')}">
          ${reasonSnippet}
        </td>
        <td style="text-align: center;">
          <button class="btn btn-secondary btn-sm" onclick="openInspector('${escapeHtml(log.id)}')" style="padding: 3px 8px; font-size: 11px;">
            Inspect
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderPagination(p) {
  if (!p) return;
  const total = p.total || 0;
  const limit = p.limit || 50;
  const offset = p.offset || 0;

  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + limit, total);
  const curPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const infoEl = document.getElementById('pagination-info');
  const pageDisp = document.getElementById('page-display');
  const prevBtn = document.getElementById('btn-prev-page');
  const nextBtn = document.getElementById('btn-next-page');

  if (infoEl) infoEl.textContent = `Showing ${start.toLocaleString()} - ${end.toLocaleString()} of ${total.toLocaleString()} entries`;
  if (pageDisp) pageDisp.textContent = `Page ${curPage} of ${totalPages}`;
  if (prevBtn) prevBtn.disabled = offset <= 0;
  if (nextBtn) nextBtn.disabled = offset + limit >= total;
}

async function openInspector(logId) {
  let log = null;
  if (currentReportData && currentReportData.logs) {
    log = currentReportData.logs.find(l => l.id === logId);
  }

  if (!log) {
    try {
      const res = await fetch(`/api/logs/${encodeURIComponent(logId)}`);
      if (res.ok) {
        const data = await res.json();
        log = data.log;
      }
    } catch (err) {
      console.warn('Could not fetch log detail from server:', err);
    }
  }

  if (!log) return;

  document.getElementById('inspect-modal-id').textContent = log.id;
  document.getElementById('inspect-intent').textContent = (log.jev_intent || 'standard').toUpperCase();
  document.getElementById('inspect-confidence').textContent = `Confidence: ${(Number(log.jev_confidence || 0.95) * 100).toFixed(0)}%`;

  const complexity = Number(log.jev_complexity || 1.0);
  document.getElementById('inspect-complexity').textContent = `${complexity.toFixed(1)} / 5.0`;
  const compBar = document.getElementById('inspect-complexity-bar');
  if (compBar) compBar.style.width = `${Math.min(100, Math.max(0, (complexity / 5.0) * 100))}%`;

  const reasonerProb = Number(log.jev_needs_reasoner || 0);
  document.getElementById('inspect-reasoner-prob').textContent = `${(reasonerProb * 100).toFixed(0)}%`;
  document.getElementById('inspect-jev-speed').textContent = `Jev Flash: ⚡ ${log.jev_duration_ms || 120}ms`;

  document.getElementById('inspect-routing-reason').textContent = log.routing_reason ||
    `Optimal model ${log.model_routed} chosen based on intent '${log.jev_intent}' and token cost efficiency.`;

  document.getElementById('inspect-model-routed').textContent = log.model_routed || '-';
  document.getElementById('inspect-provider-used').textContent = `via ${log.provider_used || 'aggregator'}`;
  document.getElementById('inspect-client-agent').textContent = log.client_agent || 'general-client';
  document.getElementById('inspect-model-requested').textContent = `Requested: ${log.model_requested || 'auto'}`;

  // Telemetry Tab
  document.getElementById('inspect-prompt-tokens').textContent = (log.prompt_tokens || 0).toLocaleString();
  document.getElementById('inspect-completion-tokens').textContent = (log.completion_tokens || 0).toLocaleString();
  document.getElementById('inspect-total-tokens').textContent = (log.total_tokens || 0).toLocaleString();
  document.getElementById('inspect-total-duration').textContent = `${log.duration_ms || 0} ms`;
  document.getElementById('inspect-jev-duration').textContent = `Jev: ⚡ ${log.jev_duration_ms || 120}ms`;

  document.getElementById('inspect-cost-actual').textContent = `$${Number(log.cost_actual || 0).toFixed(6)}`;
  document.getElementById('inspect-cost-claude').textContent = `$${Number(log.cost_if_claude || 0).toFixed(6)}`;
  document.getElementById('inspect-cost-gpt4o').textContent = `$${Number(log.cost_if_gpt4o || 0).toFixed(6)}`;
  document.getElementById('inspect-savings').textContent = `+$${Number(log.savings_vs_claude || 0).toFixed(6)}`;

  // Content Preview Tab
  document.getElementById('inspect-prompt-preview').textContent = log.prompt_preview || 'No prompt preview recorded.';
  document.getElementById('inspect-response-preview').textContent = log.response_preview || 'No response content recorded.';

  // Default to Decision tab
  document.querySelectorAll('.inspector-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-inspect-decision')?.classList.add('active');
  document.querySelectorAll('.inspector-panel-content').forEach(p => p.classList.add('hidden'));
  document.getElementById('inspect-panel-decision')?.classList.remove('hidden');

  document.getElementById('modal-decision-inspector')?.classList.remove('hidden');
}

window.openInspector = openInspector;

function formatTimestamp(ts) {
  if (!ts) return '-';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return ts;
  }
}

function getIntentBadge(intent) {
  if (!intent) return '<span class="badge badge-gateway">Standard</span>';
  if (intent.includes('coding_complex') || intent.includes('deep_reasoning')) {
    return `<span class="badge badge-frontier">${escapeHtml(intent)}</span>`;
  }
  if (intent.includes('coding_simple')) {
    return `<span class="badge badge-gateway">Simple Code</span>`;
  }
  if (intent.includes('extraction')) {
    return `<span class="badge badge-savings">Extraction</span>`;
  }
  return `<span class="badge badge-gateway">${escapeHtml(intent)}</span>`;
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