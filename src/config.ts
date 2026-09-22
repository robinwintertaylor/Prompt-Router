import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export interface RouterConfig {
  port: number;
  host: string;
  typesafeApiKey: string;
  mammouthApiKey: string;
  openrouterApiKey: string;
  anthropicApiKey: string;
  openaiApiKey: string;
  mistralApiKey: string;
  deepseekApiKey: string;
  geminiApiKey: string;
  routingStrategy: 'cost_optimized' | 'performance_optimized' | 'balanced';
  defaultProvider: 'mammouth' | 'openrouter';
  fallbackModel: string;
  siteUrl: string;
  siteName: string;
}

export const config: RouterConfig = {
  port: parseInt(process.env.PORT || '4000', 10),
  host: process.env.HOST || '0.0.0.0',
  typesafeApiKey: process.env.TYPESAFE_API_KEY || '',
  mammouthApiKey: process.env.MAMMOUTH_API_KEY || '',
  openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  mistralApiKey: process.env.MISTRAL_API_KEY || '',
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  routingStrategy: (process.env.ROUTING_STRATEGY as any) || 'cost_optimized',
  defaultProvider: (process.env.DEFAULT_PROVIDER as any) || 'mammouth',
  fallbackModel: process.env.FALLBACK_MODEL || 'anthropic/claude-3.5-sonnet',
  siteUrl: process.env.SITE_URL || 'http://localhost:4000',
  siteName: process.env.SITE_NAME || 'Prompt-Router',
};
