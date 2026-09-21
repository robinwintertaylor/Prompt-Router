import { config } from './config.js';
import { getSetting } from './db.js';

export interface JevEvaluation {
  intent: 'coding_complex' | 'coding_simple' | 'deep_reasoning' | 'factual_lookup' | 'creative_prose' | 'structured_extraction';
  intentConfidence: number;
  complexityScore: number; // 1 to 5
  complexityConfidence: number;
  needsReasoner: number; // 0 to 1
  jevDurationMs: number;
  isFallback: boolean;
  jevInputTokens: number;
}

export function extractStateFromMessages(messages: any[]): { stateText: string; promptPreview: string } {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { stateText: '', promptPreview: 'Empty message' };
  }

  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  let promptPreview = '';

  if (lastUserMsg) {
    if (typeof lastUserMsg.content === 'string') {
      promptPreview = lastUserMsg.content.slice(0, 160).trim();
    } else if (Array.isArray(lastUserMsg.content)) {
      const textParts = lastUserMsg.content
        .filter((part: any) => part.type === 'text')
        .map((part: any) => part.text)
        .join(' ');
      promptPreview = textParts.slice(0, 160).trim();
    }
  }

  const recentMessages = messages.slice(-5);
  const formattedLines: string[] = [];

  for (const msg of recentMessages) {
    let content = '';
    if (typeof msg.content === 'string') {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      content = msg.content
        .map((p: any) => (p.type === 'text' ? p.text : '[Attachment: ' + (p.type || 'media') + ']'))
        .join(' ');
    }
    formattedLines.push(`[${msg.role?.toUpperCase() || 'USER'}]: ${content}`);
  }

  const fullState = formattedLines.join('\n\n');
  const stateText = fullState.length > 32000 ? fullState.slice(-32000) : fullState;

  return { stateText, promptPreview: promptPreview || 'User prompt' };
}

export async function evaluateWithJev(messages: any[]): Promise<JevEvaluation> {
  const { stateText } = extractStateFromMessages(messages);
  const apiKey = getSetting('TYPESAFE_API_KEY', config.typesafeApiKey);

  const startTime = Date.now();
  const estimatedInputTokens = Math.ceil(stateText.length / 4);

  if (!apiKey || apiKey.trim() === '') {
    return runHeuristicEvaluation(stateText, estimatedInputTokens, Date.now() - startTime);
  }

  try {
    const payload = {
      model: 'jev-latest',
      state: stateText,
      questions: {
        intent: {
          type: 'choice',
          instructions: 'Classify the primary task type of the user request',
          criteria: {
            coding_complex: 'Multi-file architecture, tricky debugging, deep algorithm design, refactoring large codebase',
            coding_simple: 'Single-function edits, boilerplate, basic scripts, CSS/HTML adjustments, minor bug fixes',
            deep_reasoning: 'Intricate logical puzzles, math proofs, multi-step formal planning, rigorous analysis',
            factual_lookup: 'Documentation lookup, definitions, simple questions, quick fact retrieval',
            creative_prose: 'Creative writing, conversational chat, brainstorming ideas, casual banter',
            structured_extraction: 'JSON data formatting, schema extraction, table restructuring, summarization'
          }
        },
        complexity: {
          type: 'score',
          instructions: 'Rate the cognitive difficulty and model capability required',
          criteria: [
            'Level 1: Trivial greeting or minor factual lookup',
            'Level 2: Standard task with low cognitive load',
            'Level 3: Moderate complexity requiring solid coding or logical reasoning',
            'Level 4: High complexity requiring advanced domain expertise or deep debugging',
            'Level 5: Frontier complexity, intricate architecture, or cutting-edge reasoning'
          ]
        },
        needs_reasoner: {
          type: 'noul',
          instructions: 'Does this request specifically require an extended chain-of-thought reasoning model like o1, o3, or DeepSeek R1?'
        }
      }
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);

    const response = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[Jev API] Returned status ${response.status}. Falling back to heuristic.`);
      return runHeuristicEvaluation(stateText, estimatedInputTokens, Date.now() - startTime);
    }

    const data: any = await response.json();
    const duration = Date.now() - startTime;

    const intentAnswer = data.answers?.intent;
    const complexityAnswer = data.answers?.complexity;
    const needsReasonerAnswer = data.answers?.needs_reasoner;

    return {
      intent: (intentAnswer?.choice as any) || 'coding_complex',
      intentConfidence: intentAnswer?.confidence ?? 0.85,
      complexityScore: complexityAnswer?.score ?? 3,
      complexityConfidence: complexityAnswer?.confidence ?? 0.85,
      needsReasoner: needsReasonerAnswer?.noul ?? 0.2,
      jevDurationMs: duration,
      isFallback: false,
      jevInputTokens: data.usage?.prompt_tokens || estimatedInputTokens
    };
  } catch (err: any) {
    console.warn(`[Jev API] Error during evaluation: ${err.message}. Using heuristic fallback.`);
    return runHeuristicEvaluation(stateText, estimatedInputTokens, Date.now() - startTime);
  }
}

function runHeuristicEvaluation(stateText: string, tokens: number, elapsed: number): JevEvaluation {
  const lower = stateText.toLowerCase();

  const isGreeting =
    lower.length < 50 &&
    (lower.includes('hello') || lower.includes('hi') || lower.includes('hey') || lower.includes('test'));

  const isComplexArchitecture =
    lower.includes('architect') ||
    lower.includes('microservices') ||
    lower.includes('distributed') ||
    lower.includes('event-driven') ||
    lower.includes('kafka') ||
    lower.includes('consensus') ||
    lower.includes('concurrency') ||
    lower.includes('multi-file') ||
    lower.includes('refactor');

  const isCoding =
    isComplexArchitecture ||
    lower.includes('function') ||
    lower.includes('def ') ||
    lower.includes('class ') ||
    lower.includes('const ') ||
    lower.includes('import ') ||
    lower.includes('export ') ||
    lower.includes('```') ||
    lower.includes('error') ||
    lower.includes('bug') ||
    lower.includes('fix') ||
    lower.includes('code') ||
    lower.includes('script') ||
    lower.includes('python') ||
    lower.includes('typescript') ||
    lower.includes('javascript') ||
    lower.includes('sql') ||
    lower.includes('api');

  const isReasoning =
    lower.includes('prove') ||
    lower.includes('theorem') ||
    lower.includes('puzzle') ||
    lower.includes('logic') ||
    lower.includes('algorithm') ||
    lower.includes('calculate') ||
    lower.includes('math') ||
    lower.includes('step-by-step');

  let intent: JevEvaluation['intent'] = 'coding_simple';
  let complexity = 2.5;
  let needsReasoner = 0.1;

  if (isGreeting) {
    intent = 'creative_prose';
    complexity = 1.0;
  } else if (isComplexArchitecture) {
    intent = 'coding_complex';
    complexity = 4.2;
    needsReasoner = 0.3;
  } else if (isReasoning && isCoding) {
    intent = 'coding_complex';
    complexity = 4.3;
    needsReasoner = 0.8;
  } else if (isCoding && stateText.length > 500) {
    intent = 'coding_complex';
    complexity = 3.8;
  } else if (isCoding) {
    intent = 'coding_simple';
    complexity = 2.8;
  } else if (isReasoning) {
    intent = 'deep_reasoning';
    complexity = 4.0;
    needsReasoner = 0.75;
  } else if (lower.includes('json') || lower.includes('extract') || lower.includes('table')) {
    intent = 'structured_extraction';
    complexity = 2.2;
  } else {
    intent = 'factual_lookup';
    complexity = 2.0;
  }

  return {
    intent,
    intentConfidence: 0.75,
    complexityScore: complexity,
    complexityConfidence: 0.75,
    needsReasoner,
    jevDurationMs: Math.max(1, elapsed),
    isFallback: true,
    jevInputTokens: tokens
  };
}

