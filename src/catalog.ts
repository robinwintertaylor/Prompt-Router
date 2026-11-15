import { db, getSetting } from './db.js';
import { config } from './config.js';

export interface CatalogModel {
  id: string;
  name: string;
  description: string;
  provider: 'openrouter' | 'mammouth' | 'both' | 'nvidia' | 'mistral' | 'deepseek' | string;
  promptPrice: number;       // USD per token
  completionPrice: number;   // USD per token
  contextLength: number;
  supportsReasoning: boolean;
  tier: 'frontier_reasoning' | 'frontier_coding' | 'balanced' | 'fast_cheap';
  updatedAt: string;
}

// In-memory fast cache for high-throughput routing
let memoryCatalog: Map<string, CatalogModel> = new Map();

function findMatchingModel(catalog: Map<string, CatalogModel>, id: string): CatalogModel | undefined {
  if (catalog.has(id)) return catalog.get(id);
  const prefixes = ['openai/', 'anthropic/', 'mistralai/', 'meta-llama/', 'google/', 'deepseek/', 'qwen/', 'meta/'];
  for (const p of prefixes) {
    if (catalog.has(p + id)) return catalog.get(p + id);
  }
  const slashIdx = id.indexOf('/');
  if (slashIdx !== -1) {
    const stripped = id.slice(slashIdx + 1);
    if (catalog.has(stripped)) return catalog.get(stripped);
    for (const p of prefixes) {
      if (catalog.has(p + stripped)) return catalog.get(p + stripped);
    }
  }
  return undefined;
}

export function classifyModelTier(id: string, name: string, description: string, promptPrice: number, supportsReasoning: boolean): CatalogModel['tier'] {
  const lower = (id + ' ' + name + ' ' + description).toLowerCase();

  // 1. Ultra Fast & Cheap (< $0.20 per million prompt tokens or small/flash models)
  if (
    (promptPrice <= 0.00000025 && !lower.includes('r1') && !lower.includes('o1') && !lower.includes('o3')) ||
    (lower.includes('flash') && !lower.includes('r1')) ||
    lower.includes('mini') ||
    lower.includes('8b')
  ) {
    return 'fast_cheap';
  }

  // 2. Dedicated Frontier Reasoning (CoT, R1, o1, o3, thinking)
  if (
    lower.includes('r1') ||
    lower.includes('deepseek-reasoner') ||
    lower.includes('o1') ||
    lower.includes('o3') ||
    lower.includes(':thinking') ||
    (supportsReasoning && (lower.includes('reason') || lower.includes('qwq')))
  ) {
    return 'frontier_reasoning';
  }

  // 3. Frontier Coding & High Complexity
  if (
    lower.includes('claude-3.5-sonnet') ||
    lower.includes('claude-3-5-sonnet') ||
    lower.includes('claude-3.7-sonnet') ||
    lower.includes('claude-sonnet') ||
    lower.includes('sonnet') ||
    lower.includes('gpt-4o') ||
    lower.includes('opus') ||
    lower.includes('gemini-1.5-pro') ||
    lower.includes('gemini-2.5-pro') ||
    lower.includes('mistral-large') ||
    lower.includes('codestral')
  ) {
    return 'frontier_coding';
  }

  return 'balanced';
}

export async function syncCatalog(): Promise<{ count: number; error?: string }> {
  let syncedCount = 0;
  const newCatalog: Map<string, CatalogModel> = new Map();

  try {
    // 1. Fetch from OpenRouter Catalog
    console.log('[Catalog] Fetching live models and real-time token rates from OpenRouter...');
    const orRes = await fetch('https://openrouter.ai/api/v1/models');
    if (orRes.ok) {
      const orData: any = await orRes.json();
      const models = orData.data || [];

      const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO models_catalog (
          id, name, description, provider, prompt_price, completion_price,
          context_length, supports_reasoning, tier, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      for (const m of models) {
        const promptPrice = parseFloat(m.pricing?.prompt || '0');
        const completionPrice = parseFloat(m.pricing?.completion || '0');
        const supportsReasoning = !!(m.reasoning?.default_enabled || m.reasoning?.mandatory || m.id.includes('r1') || m.id.includes('o1') || m.id.includes('o3'));
        const tier = classifyModelTier(m.id, m.name || '', m.description || '', promptPrice, supportsReasoning);

        insertStmt.run(
          m.id,
          m.name || m.id,
          (m.description || '').slice(0, 500),
          'openrouter',
          promptPrice,
          completionPrice,
          m.context_length || 0,
          supportsReasoning ? 1 : 0,
          tier
        );

        newCatalog.set(m.id, {
          id: m.id,
          name: m.name || m.id,
          description: m.description || '',
          provider: 'openrouter',
          promptPrice,
          completionPrice,
          contextLength: m.context_length || 0,
          supportsReasoning,
          tier,
          updatedAt: new Date().toISOString()
        });

        syncedCount++;
      }
    }

    // 2. Fetch from Mammouth AI Catalog if API key is present
    const mammouthApiKey = getSetting('MAMMOUTH_API_KEY', config.mammouthApiKey);
    if (mammouthApiKey && mammouthApiKey.trim() !== '') {
      try {
        console.log('[Catalog] Fetching live models from Mammouth AI...');
        const mamRes = await fetch('https://api.mammouth.ai/v1/models', {
          headers: { 'Authorization': `Bearer ${mammouthApiKey.trim()}` }
        });
        if (mamRes.ok) {
          const mamData: any = await mamRes.json();
          const mamModels = mamData.data || [];
          const insertStmt = db.prepare(`
            INSERT OR REPLACE INTO models_catalog (
              id, name, description, provider, prompt_price, completion_price,
              context_length, supports_reasoning, tier, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `);

          let mamAdded = 0;
          for (const mm of mamModels) {
            const modelId = mm.id;
            const existing = findMatchingModel(newCatalog, modelId);
            if (existing) {
              existing.provider = 'both';
              db.prepare(`UPDATE models_catalog SET provider = 'both' WHERE id = ?`).run(existing.id);
            }
            if (!newCatalog.has(modelId)) {
              const tier = classifyModelTier(modelId, mm.name || modelId, '', 0.000001, modelId.includes('r1') || modelId.includes('reason'));
              const provider = existing ? 'both' : 'mammouth';
              insertStmt.run(
                modelId,
                mm.name || modelId,
                'Mammouth AI direct model',
                provider,
                0.000001,
                0.000002,
                mm.max_input_tokens || 128000,
                tier === 'frontier_reasoning' ? 1 : 0,
                tier
              );

              newCatalog.set(modelId, {
                id: modelId,
                name: mm.name || modelId,
                description: 'Mammouth AI direct model',
                provider,
                promptPrice: 0.000001,
                completionPrice: 0.000002,
                contextLength: mm.max_input_tokens || 128000,
                supportsReasoning: tier === 'frontier_reasoning',
                tier,
                updatedAt: new Date().toISOString()
              });
              syncedCount++;
              mamAdded++;
            }
          }
          console.log(`[Catalog] Ingested ${mamAdded} new models from Mammouth AI (${mamModels.length} total).`);
        }
      } catch (mamErr: any) {
        console.warn('[Catalog] Mammouth models fetch error:', mamErr.message);
      }
    }

    // 3. Fetch from NVIDIA NIM Catalog
    try {
      const nvRes = await fetch('https://integrate.api.nvidia.com/v1/models', {
        signal: AbortSignal.timeout(5000)
      });
      if (nvRes.ok) {
        const nvData: any = await nvRes.json();
        const nvModels = nvData.data || [];
        const insertStmt = db.prepare(`
          INSERT OR REPLACE INTO models_catalog (
            id, name, description, provider, prompt_price, completion_price,
            context_length, supports_reasoning, tier, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);

        let nvAdded = 0;
        for (const nm of nvModels) {
          const modelId = nm.id;
          const existing = findMatchingModel(newCatalog, modelId);
          if (existing && existing.provider === 'openrouter') {
            existing.provider = 'both';
            db.prepare(`UPDATE models_catalog SET provider = 'both' WHERE id = ?`).run(existing.id);
          }
          if (!newCatalog.has(modelId)) {
            const tier = classifyModelTier(modelId, nm.id, '', 0.0, modelId.includes('r1') || modelId.includes('reason') || modelId.includes('nemotron'));
            const provider = existing ? 'both' : 'nvidia';
            insertStmt.run(
              modelId,
              modelId,
              'NVIDIA NIM Direct Inference Model',
              provider,
              0.0,
              0.0,
              128000,
              tier === 'frontier_reasoning' ? 1 : 0,
              tier
            );

            newCatalog.set(modelId, {
              id: modelId,
              name: modelId,
              description: 'NVIDIA NIM Direct Inference Model',
              provider,
              promptPrice: 0.0,
              completionPrice: 0.0,
              contextLength: 128000,
              supportsReasoning: tier === 'frontier_reasoning',
              tier,
              updatedAt: new Date().toISOString()
            });
            syncedCount++;
            nvAdded++;
          }
        }
        console.log(`[Catalog] Ingested ${nvAdded} models from NVIDIA NIM.`);
      }
    } catch (nvErr: any) {
      console.warn('[Catalog] NVIDIA NIM models fetch error:', nvErr.message);
    }

    // 4. Fetch from Mistral AI Catalog if API key is present
    const mistralApiKey = getSetting('MISTRAL_API_KEY', config.mistralApiKey);
    if (mistralApiKey && mistralApiKey.trim() !== '') {
      try {
        console.log('[Catalog] Fetching live models from Mistral AI...');
        const misRes = await fetch('https://api.mistral.ai/v1/models', {
          headers: { 'Authorization': `Bearer ${mistralApiKey.trim()}` },
          signal: AbortSignal.timeout(5000)
        });
        if (misRes.ok) {
          const misData: any = await misRes.json();
          const misModels = misData.data || [];
          const insertStmt = db.prepare(`
            INSERT OR REPLACE INTO models_catalog (
              id, name, description, provider, prompt_price, completion_price,
              context_length, supports_reasoning, tier, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `);

          let misAdded = 0;
          for (const mm of misModels) {
            const modelId = mm.id;
            const existing = findMatchingModel(newCatalog, modelId);
            if (existing && existing.provider === 'openrouter') {
              existing.provider = 'both';
              db.prepare(`UPDATE models_catalog SET provider = 'both' WHERE id = ?`).run(existing.id);
            }
            if (!newCatalog.has(modelId)) {
              const tier = classifyModelTier(modelId, mm.name || modelId, mm.description || '', 0.000002, modelId.includes('large') || modelId.includes('codestral'));
              const provider = existing ? 'both' : 'mistral';
              insertStmt.run(
                modelId,
                mm.name || modelId,
                mm.description || 'Mistral AI direct sovereign model',
                provider,
                0.000002,
                0.000006,
                mm.max_context_length || 128000,
                tier === 'frontier_reasoning' ? 1 : 0,
                tier
              );

              newCatalog.set(modelId, {
                id: modelId,
                name: mm.name || modelId,
                description: mm.description || 'Mistral AI direct sovereign model',
                provider,
                promptPrice: 0.000002,
                completionPrice: 0.000006,
                contextLength: mm.max_context_length || 128000,
                supportsReasoning: tier === 'frontier_reasoning',
                tier,
                updatedAt: new Date().toISOString()
              });
              syncedCount++;
              misAdded++;
            }
          }
          console.log(`[Catalog] Ingested ${misAdded} new models from Mistral AI (${misModels.length} total).`);
        }
      } catch (misErr: any) {
        console.warn('[Catalog] Mistral models fetch error:', misErr.message);
      }
    }

    memoryCatalog = newCatalog;
    console.log(`[Catalog] Successfully synchronized ${syncedCount} models with live aggregator rates.`);
    return { count: syncedCount };
  } catch (err: any) {
    console.error('[Catalog] Failed to sync models catalog:', err.message);
    return { count: syncedCount, error: err.message };
  }
}

export function loadCatalogFromDb() {
  const rows = db.prepare(`SELECT * FROM models_catalog`).all() as any[];
  memoryCatalog.clear();
  for (const r of rows) {
    memoryCatalog.set(r.id, {
      id: r.id,
      name: r.name,
      description: r.description,
      provider: r.provider,
      promptPrice: r.prompt_price,
      completionPrice: r.completion_price,
      contextLength: r.context_length,
      supportsReasoning: !!r.supports_reasoning,
      tier: r.tier,
      updatedAt: r.updated_at
    });
  }
  console.log(`[Catalog] Loaded ${memoryCatalog.size} models from SQLite catalog.`);
}

export function getCatalogModel(id: string): CatalogModel | undefined {
  return memoryCatalog.get(id);
}

export function getAllCatalogModels(): CatalogModel[] {
  return Array.from(memoryCatalog.values());
}
