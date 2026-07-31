import crypto from 'crypto';
import { env } from '../config/env.js';
import { AppError, ValidationError } from '../utils/errors.js';
import { withCircuitBreaker } from './circuit-breaker.service.js';
import { logger } from '../utils/logger.js';

// Verify the exact model ID at https://catalog.ngc.nvidia.com/ai-foundation-models
export const NIM_DEFAULT_MODEL = env.NVIDIA_NIM_MODEL;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface NimRequestBody {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
  nvext?: {
    guided_json?: unknown;
  };
}

interface NimApiResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

export interface NimPromptOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  maxRetries?: number;
  timeoutMs?: number;
  systemPrompt?: string;
  userPrompt: string;
  guidedJson?: unknown;
}

interface CachedNimResponse {
  expiresAt: number;
  content: string;
}

const responseCache = new Map<string, CachedNimResponse>();
let rateWindowStartedAt = Date.now();
let rateWindowCount = 0;

const nimApiKey = (): string => env.NVIDIA_NIM_API_KEY || env.NVIDIA_API_KEY;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const enforceRateLimit = async () => {
  const now = Date.now();
  if (now - rateWindowStartedAt >= 60_000) {
    rateWindowStartedAt = now;
    rateWindowCount = 0;
  }

  if (rateWindowCount < env.NVIDIA_NIM_RATE_LIMIT_PER_MINUTE) {
    rateWindowCount += 1;
    return;
  }

  const waitMs = Math.max(0, 60_000 - (now - rateWindowStartedAt));
  throw new AppError(
    `NVIDIA NIM local rate limit reached. Retry in ${Math.ceil(waitMs / 1000)} seconds.`,
    429,
    'NVIDIA_RATE_LIMITED',
  );
};

const cacheKeyForBody = (body: NimRequestBody) =>
  crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');

const getCached = (key: string) => {
  if (env.NVIDIA_NIM_CACHE_TTL_SECONDS <= 0) return null;
  const cached = responseCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return null;
  }
  return cached.content;
};

const setCached = (key: string, content: string) => {
  if (env.NVIDIA_NIM_CACHE_TTL_SECONDS <= 0) return;
  responseCache.set(key, {
    content,
    expiresAt: Date.now() + env.NVIDIA_NIM_CACHE_TTL_SECONDS * 1000,
  });
};

const boundedTimeoutMs = (timeoutMs?: number): number =>
  Math.min(Math.max(timeoutMs ?? env.NVIDIA_NIM_TIMEOUT_MS, 1000), 360000);

const callNim = async (body: NimRequestBody, timeoutMs?: number): Promise<string> => {
  const cacheKey = cacheKeyForBody(body);
  const cached = getCached(cacheKey);
  if (cached) return cached;

  await enforceRateLimit();
  const requestTimeoutMs = boundedTimeoutMs(timeoutMs);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, requestTimeoutMs);

  let response: Response;
  try {
    response = await fetch(`${env.NVIDIA_NIM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${nimApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut || (error instanceof Error && error.name === 'AbortError')) {
      throw new Error(`NVIDIA NIM request timed out after ${requestTimeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`NVIDIA NIM API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as NimApiResponse;
  const content = data.choices?.[0]?.message?.content?.trim() ?? '';
  setCached(cacheKey, content);
  return content;
};

const callNimWithRetries = async (
  body: NimRequestBody,
  timeoutMs?: number,
  maxRetries = env.NVIDIA_NIM_MAX_RETRIES,
): Promise<string> => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await callNim(body, timeoutMs);
    } catch (error) {
      lastError = error;
      if (error instanceof AppError && error.statusCode === 429) throw error;
      if (attempt >= maxRetries) break;
      await sleep(Math.min(250 * 2 ** attempt, 4000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
};

const buildMessages = (options: NimPromptOptions): ChatMessage[] => [
  ...(options.systemPrompt ? [{ role: 'system' as const, content: options.systemPrompt }] : []),
  { role: 'user' as const, content: options.userPrompt },
];

const stripMarkdownFences = (raw: string): string =>
  raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

const ensureNimConfigured = (): void => {
  if (!nimApiKey()) {
    throw new AppError(
      'NVIDIA NIM API is not configured for this environment',
      503,
      'NVIDIA_NOT_CONFIGURED',
    );
  }
};

export const requestNimText = async (options: NimPromptOptions): Promise<string> => {
  ensureNimConfigured();
  try {
    const modelId = options.model ?? NIM_DEFAULT_MODEL;
    const content = await withCircuitBreaker(
      { provider: 'nvidia', operation: 'chat_text', model: modelId },
      () =>
        callNimWithRetries(
          {
            model: modelId,
            messages: buildMessages(options),
            temperature: options.temperature ?? 0.2,
            max_tokens: options.maxTokens ?? 800,
          },
          options.timeoutMs,
          options.maxRetries,
        ),
    );

    if (!content) {
      throw new ValidationError('NVIDIA NIM returned an empty response');
    }

    return content;
  } catch (error) {
    if (error instanceof AppError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(
      { err: error, provider: 'nvidia', operation: 'chat_text' },
      'NVIDIA NIM text call failed',
    );
    throw new AppError(
      `NVIDIA NIM is temporarily unavailable: ${message}`,
      502,
      'NVIDIA_NIM_FAILED',
    );
  }
};

export const requestNimJson = async <T>(options: NimPromptOptions): Promise<T> => {
  ensureNimConfigured();
  try {
    const modelId = options.model ?? NIM_DEFAULT_MODEL;
    const content = await withCircuitBreaker(
      { provider: 'nvidia', operation: 'chat_json', model: modelId },
      () =>
        callNimWithRetries(
          {
            model: modelId,
            messages: buildMessages(options),
            temperature: options.temperature ?? 0.2,
            max_tokens: options.maxTokens ?? 800,
            response_format: { type: 'json_object' },
            ...(options.guidedJson ? { nvext: { guided_json: options.guidedJson } } : {}),
          },
          options.timeoutMs,
          options.maxRetries,
        ),
    );

    if (!content) {
      throw new ValidationError('NVIDIA NIM returned an empty response');
    }

    try {
      return JSON.parse(stripMarkdownFences(content)) as T;
    } catch {
      throw new ValidationError('NVIDIA NIM returned invalid JSON');
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(
      { err: error, provider: 'nvidia', operation: 'chat_json' },
      'NVIDIA NIM JSON call failed',
    );
    throw new AppError(
      `NVIDIA NIM is temporarily unavailable: ${message}`,
      502,
      'NVIDIA_NIM_FAILED',
    );
  }
};
