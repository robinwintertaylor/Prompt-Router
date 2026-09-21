import { db, getSetting } from './db.js';
import { config } from './config.js';

export interface CatalogModel {
  id: string;
  name: string;
  description: string;
  provider: 'openrouter' | 'mammouth' | 'both';
  promptPrice: number;       // USD per token
  completionPrice: number;   // USD per token
  contextLength: number;
  supportsReasoning: boolean;
  tier: 'frontier_reasoning' | 'frontier_coding' | 'balanced' | 'fast_cheap';
  updatedAt: string;
}

// In-memory fast cache for high-throughput routing
let memoryCatalog: Map<string, CatalogModel> = new Map();

export function classifyModelTier(id: string, name: string, description: string, promptPrice: number, supportsReasoning: boolean): CatalogModel['tier'] {
  const lower = (id + ' ' + name + ' ' + description).toLowerCase();

  // 1. Frontier Reasoning
  if (
    supportsReasoning ||
    lower.includes('r1') ||
    lower.includes('deepseek-reasoner') ||
    lower.includes('o1') ||
    lower.includes('o3') ||
    lower.includes('reasoning') ||
    lower.includes('thinking')
  ) {
    return 'frontier_reasoning';
  }

  // 2. Frontier Coding & High Complexity
  if (
    lower.includes('claude-3.5-sonnet') ||
    lower.includes('claude-3-5-sonnet') ||
    lower.includes('claude-3.7-sonnet') ||
    lower.includes('sonnet') ||
    lower.includes('gpt-4o') ||
    lower.includes('opus') ||
    lower.includes('gemini-1.5-pro') ||
    lower.includes('gemini-2.5-pro') ||
    lower.includes('mistral-large')
  ) {
    return 'frontier_coding';
  }

  // 3. Ultra Fast & Cheap (< $0.20 per million prompt tokens = $0.00000020 per token)
  if (promptPrice <= 0.00000025 || lower.includes('flash') || lower.includes('mini') || lower.includes('8b')) {
    return 'fast_cheap';
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
          for (const mm of mamModels) {
            // Update or add Mammouth availability
            const existing = newCatalog.get(mm.id);
            if (existing) {
              existing.provider = 'both';
              db.prepare(`UPDATE models_catalog SET provider = 'both' WHERE id = ?`).run(mm.id);
            }
          }
        }
      } catch (mamErr: any) {
        console.warn('[Catalog] Mammouth models fetch error:', mamErr.message);
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
