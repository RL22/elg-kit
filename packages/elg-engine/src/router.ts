/**
 * @file router.ts
 * Future-proofed Model Routing Matrix & Wire Engine for elg-kit.
 *
 * Core Architecture:
 * 1. 4 Semantic Capability Tiers: 'triage', 'workhorse', 'reasoning', 'frontier'
 * 2. 2-Wire Engine Protocol:
 *    - Wire 1: Universal OpenAI-compatible Wire (OpenRouter, OpenAI, Groq, DeepSeek, Ollama)
 *    - Wire 2: Anthropic Native Wire (used when ANTHROPIC_API_KEY is supplied without OPENROUTER_API_KEY)
 * 3. 1-Level Automatic Failover:
 *    - Retries once on the fallback model for 429, 503, or timeout errors.
 * 4. Output Sanitization:
 *    - Strips <think>...</think> and [thinking]...[/thinking] tags.
 * 5. Reasoning Model Constraints:
 *    - Omits temperature when matching /o1|o3|r1|thinking/i.
 * 6. Zero External Dependencies:
 *    - Pure TypeScript using built-in fetch (Node 18+, Edge, Cloudflare Workers).
 */

export type SemanticTier = 'triage' | 'workhorse' | 'reasoning' | 'frontier';

export interface TierModelDefinition {
  primary: string;
  fallback: string;
}

export const TIER_MODELS: Record<SemanticTier, TierModelDefinition> = {
  triage: {
    primary: 'google/gemini-3.8-flash',
    fallback: 'anthropic/claude-haiku-4-5',
  },
  workhorse: {
    primary: 'anthropic/claude-3.7-sonnet',
    fallback: 'google/gemini-3.8-flash',
  },
  reasoning: {
    primary: 'deepseek/deepseek-r1',
    fallback: 'openai/o3-mini',
  },
  frontier: {
    primary: 'anthropic/claude-opus-5',
    fallback: 'google/gemini-3.1-pro-high',
  },
};

export interface SemanticTaskOptions {
  system?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  apiKey?: string;
  baseUrl?: string;
  provider?: 'openrouter' | 'anthropic' | 'openai' | 'groq' | 'deepseek' | 'ollama' | 'gateway';
  modelId?: string;
  fallbackModelId?: string;
  headers?: Record<string, string>;
  fetchFn?: typeof fetch;
}

export interface SemanticTaskResult {
  text: string;
  model: string;
  tier: SemanticTier;
  fallbackUsed: boolean;
  rawText: string;
  toString(): string;
  valueOf(): string;
}

export class RouterError extends Error {
  public status?: number;
  public code?: string;
  public isTimeout: boolean;
  public isRetryable: boolean;

  constructor(
    message: string,
    options: { status?: number; code?: string; isTimeout?: boolean; cause?: unknown } = {}
  ) {
    super(message);
    this.name = 'RouterError';
    this.status = options.status;
    this.code = options.code;
    this.isTimeout = options.isTimeout ?? false;
    this.isRetryable = options.status === 429 || options.status === 503 || this.isTimeout;
    if (options.cause) {
      this.cause = options.cause;
    }
  }
}

/**
 * Strips <think>...</think> and [thinking]...[/thinking] tags from model outputs.
 */
export function sanitizeOutput(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/\[thinking\][\s\S]*?\[\/thinking\]/gi, '')
    .trim();
}

/**
 * Checks whether a model ID represents a reasoning model where temperature must be omitted.
 */
export function isReasoningModel(modelId: string): boolean {
  return /o1|o3|r1|thinking/i.test(modelId);
}

function getEnv(key: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
}

/**
 * Resolves whether to use Wire 1 (Universal OpenAI-compatible) or Wire 2 (Anthropic Native).
 */
export function resolveWireProtocol(options: SemanticTaskOptions = {}): 'openai' | 'anthropic' {
  if (options.provider === 'anthropic') {
    return 'anthropic';
  }

  const openrouterKey = options.apiKey?.startsWith('sk-or-')
    ? options.apiKey
    : getEnv('OPENROUTER_API_KEY');

  const anthropicKey = options.apiKey?.startsWith('sk-ant-')
    ? options.apiKey
    : getEnv('ANTHROPIC_API_KEY');

  // Wire 2 is active if ANTHROPIC_API_KEY is supplied without OPENROUTER_API_KEY
  if (anthropicKey && !openrouterKey && options.provider !== 'openrouter') {
    return 'anthropic';
  }

  return 'openai';
}

interface WireCallParams {
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  apiKey?: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  fetchFn?: typeof fetch;
}

/**
 * Wire 1: Universal OpenAI-Compatible Wire
 * POST ${baseUrl}/chat/completions
 * Powers OpenRouter, OpenAI, Groq, DeepSeek, Ollama.
 */
async function callOpenAIWire(params: WireCallParams): Promise<string> {
  const fetcher = params.fetchFn || fetch;
  const rawBase =
    params.baseUrl ||
    getEnv('AI_BASE_URL') ||
    getEnv('OPENAI_BASE_URL') ||
    'https://openrouter.ai/api/v1';

  const baseUrl = rawBase.replace(/\/+$/, '');
  const url = `${baseUrl}/chat/completions`;

  const apiKey =
    params.apiKey ||
    getEnv('OPENROUTER_API_KEY') ||
    getEnv('OPENAI_API_KEY') ||
    getEnv('GROQ_API_KEY') ||
    getEnv('DEEPSEEK_API_KEY') ||
    '';

  const isOpenRouter = baseUrl.includes('openrouter.ai');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    ...(isOpenRouter
      ? {
          'HTTP-Referer': 'https://github.com/RL22/elg-kit',
          'X-Title': 'elg-kit',
        }
      : {}),
    ...params.headers,
  };

  const messages: Array<{ role: string; content: string }> = [];
  if (params.system) {
    messages.push({ role: 'system', content: params.system });
  }
  messages.push({ role: 'user', content: params.prompt });

  const payload: Record<string, any> = {
    model: params.model,
    messages,
  };

  // Omit temperature for reasoning models
  if (!isReasoningModel(params.model) && params.temperature !== undefined) {
    payload.temperature = params.temperature;
  }
  if (params.maxTokens !== undefined) {
    payload.max_tokens = params.maxTokens;
  }

  const timeoutMs = params.timeoutMs ?? 60000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`OpenAI wire request timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  try {
    const response = await fetcher(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new RouterError(
        `OpenAI wire error (${response.status}): ${errorBody || response.statusText}`,
        { status: response.status }
      );
    }

    const data = (await response.json()) as any;
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new RouterError(`Invalid response format from OpenAI wire: missing content`);
    }

    return content;
  } catch (err: any) {
    if (err instanceof RouterError) {
      throw err;
    }
    const isTimeout =
      err?.name === 'AbortError' ||
      err?.code === 'ETIMEDOUT' ||
      err?.code === 'ECONNRESET' ||
      /timeout/i.test(err?.message || '');

    throw new RouterError(`OpenAI wire execution failed: ${err?.message || String(err)}`, {
      code: err?.code,
      isTimeout,
      cause: err,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Wire 2: Anthropic Native Wire
 * POST ${baseUrl}/v1/messages
 * Active when ANTHROPIC_API_KEY is supplied without OPENROUTER_API_KEY.
 */
async function callAnthropicWire(params: WireCallParams): Promise<string> {
  const fetcher = params.fetchFn || fetch;
  const rawBase =
    params.baseUrl ||
    getEnv('AI_BASE_URL') ||
    getEnv('ANTHROPIC_BASE_URL') ||
    'https://api.anthropic.com';

  const baseUrl = rawBase.replace(/\/+$/, '');
  const url = `${baseUrl}/v1/messages`;

  const apiKey = params.apiKey || getEnv('ANTHROPIC_API_KEY') || '';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(apiKey ? { 'x-api-key': apiKey } : {}),
    'anthropic-version': '2023-06-01',
    ...params.headers,
  };

  // Strip provider prefix when calling Anthropic directly
  const cleanModel = params.model.replace(/^anthropic\//, '');

  const payload: Record<string, any> = {
    model: cleanModel,
    messages: [{ role: 'user', content: params.prompt }],
    max_tokens: params.maxTokens ?? 4096,
  };

  if (params.system) {
    payload.system = params.system;
  }

  // Omit temperature for reasoning models
  if (!isReasoningModel(cleanModel) && params.temperature !== undefined) {
    payload.temperature = params.temperature;
  }

  const timeoutMs = params.timeoutMs ?? 60000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Anthropic wire request timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  try {
    const response = await fetcher(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new RouterError(
        `Anthropic wire error (${response.status}): ${errorBody || response.statusText}`,
        { status: response.status }
      );
    }

    const data = (await response.json()) as any;
    const text =
      data.content
        ?.filter((c: any) => c.type === 'text')
        ?.map((c: any) => c.text)
        ?.join('') || data.content?.[0]?.text;

    if (typeof text !== 'string') {
      throw new RouterError(`Invalid response format from Anthropic wire: missing text content`);
    }

    return text;
  } catch (err: any) {
    if (err instanceof RouterError) {
      throw err;
    }
    const isTimeout =
      err?.name === 'AbortError' ||
      err?.code === 'ETIMEDOUT' ||
      err?.code === 'ECONNRESET' ||
      /timeout/i.test(err?.message || '');

    throw new RouterError(`Anthropic wire execution failed: ${err?.message || String(err)}`, {
      code: err?.code,
      isTimeout,
      cause: err,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Dispatches a generation request using the resolved wire protocol.
 */
async function dispatchWireCall(
  model: string,
  prompt: string,
  options: SemanticTaskOptions
): Promise<string> {
  const protocol = resolveWireProtocol(options);

  const callParams: WireCallParams = {
    model,
    prompt,
    system: options.system,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    timeoutMs: options.timeoutMs,
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    headers: options.headers,
    fetchFn: options.fetchFn,
  };

  if (protocol === 'anthropic') {
    return callAnthropicWire(callParams);
  }
  return callOpenAIWire(callParams);
}

/**
 * Executes a semantic task for a specified tier with 1-level automatic failover,
 * reasoning temperature omission, and output sanitization.
 *
 * @param tier Semantic tier: 'triage' | 'workhorse' | 'reasoning' | 'frontier'
 * @param prompt Prompt text to send
 * @param options Semantic task options (system prompt, temperature, keys, etc.)
 */
export async function executeSemanticTask(
  tier: SemanticTier,
  prompt: string,
  options: SemanticTaskOptions = {}
): Promise<SemanticTaskResult> {
  const tierConfig = TIER_MODELS[tier];
  if (!tierConfig) {
    throw new RouterError(`Unknown semantic tier: "${tier}". Valid tiers: triage, workhorse, reasoning, frontier.`);
  }

  const primaryModel = options.modelId || tierConfig.primary;
  const fallbackModel = options.fallbackModelId || tierConfig.fallback;

  let rawOutput: string;
  let finalModel = primaryModel;
  let fallbackUsed = false;

  try {
    rawOutput = await dispatchWireCall(primaryModel, prompt, options);
  } catch (primaryErr: any) {
    const isRetryable =
      primaryErr instanceof RouterError
        ? primaryErr.isRetryable
        : primaryErr?.status === 429 ||
          primaryErr?.status === 503 ||
          primaryErr?.name === 'AbortError' ||
          /timeout/i.test(primaryErr?.message || '');

    if (!isRetryable) {
      throw primaryErr;
    }

    // 1-Level Automatic Failover on 429, 503, or timeout
    console.warn(
      `[elg-router] Primary model "${primaryModel}" failed (${primaryErr.message}). Initiating 1-level failover to "${fallbackModel}"...`
    );

    try {
      rawOutput = await dispatchWireCall(fallbackModel, prompt, options);
      finalModel = fallbackModel;
      fallbackUsed = true;
    } catch (fallbackErr: any) {
      throw new RouterError(
        `[elg-router] Both primary ("${primaryModel}") and fallback ("${fallbackModel}") failed. Fallback error: ${
          fallbackErr.message || String(fallbackErr)
        }`,
        {
          cause: fallbackErr,
          status: fallbackErr.status || primaryErr.status,
          isTimeout: fallbackErr.isTimeout || primaryErr.isTimeout,
        }
      );
    }
  }

  const sanitized = sanitizeOutput(rawOutput);

  return {
    text: sanitized,
    model: finalModel,
    tier,
    fallbackUsed,
    rawText: rawOutput,
    toString() {
      return sanitized;
    },
    valueOf() {
      return sanitized;
    },
  };
}
