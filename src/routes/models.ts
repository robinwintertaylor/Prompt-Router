import { Request, Response } from 'express';

export function handleListModels(req: Request, res: Response) {
  const models = [
    {
      id: 'auto',
      object: 'model',
      created: 1726876800,
      owned_by: 'prompt-router',
      permission: [],
      root: 'auto',
      parent: null,
      description: 'Jev System One Intelligent Dynamic Router (Auto-selects optimal model per prompt)'
    },
    {
      id: 'jev-smart-router',
      object: 'model',
      created: 1726876800,
      owned_by: 'prompt-router',
      permission: [],
      root: 'jev-smart-router',
      parent: null,
      description: 'Jev Fast Non-Autoregressive Evaluator & Cost Optimizer'
    },
    {
      id: 'anthropic/claude-3.5-sonnet',
      object: 'model',
      created: 1726876800,
      owned_by: 'anthropic',
      permission: [],
      root: 'claude-3.5-sonnet',
      parent: null
    },
    {
      id: 'openai/gpt-4o',
      object: 'model',
      created: 1726876800,
      owned_by: 'openai',
      permission: [],
      root: 'gpt-4o',
      parent: null
    },
    {
      id: 'openai/gpt-4o-mini',
      object: 'model',
      created: 1726876800,
      owned_by: 'openai',
      permission: [],
      root: 'gpt-4o-mini',
      parent: null
    },
    {
      id: 'deepseek/deepseek-r1',
      object: 'model',
      created: 1726876800,
      owned_by: 'deepseek',
      permission: [],
      root: 'deepseek-r1',
      parent: null
    },
    {
      id: 'google/gemini-2.5-flash',
      object: 'model',
      created: 1726876800,
      owned_by: 'google',
      permission: [],
      root: 'gemini-2.5-flash',
      parent: null
    },
    {
      id: 'google/gemini-2.5-pro',
      object: 'model',
      created: 1726876800,
      owned_by: 'google',
      permission: [],
      root: 'gemini-2.5-pro',
      parent: null
    },
    {
      id: 'mistralai/mistral-small',
      object: 'model',
      created: 1726876800,
      owned_by: 'mistralai',
      permission: [],
      root: 'mistral-small',
      parent: null
    }
  ];

  res.json({
    object: 'list',
    data: models
  });
}
