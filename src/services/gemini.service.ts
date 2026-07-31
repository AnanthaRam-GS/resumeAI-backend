import { env } from '../config/env.js';
import { AppError, ValidationError } from '../utils/errors.js';
import { withCircuitBreaker } from './circuit-breaker.service.js';

export const GEMINI_DEFAULT_MODEL = 'google/gemini-2.5-flash';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface GeminiPromptOptions {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  systemPrompt?: string;
  userPrompt: string;
}

const ensureGeminiConfigured = (): void => {
  if (!env.OPENROUTER_API_KEY) {
    throw new AppError(
      'Gemini API is not configured for this environment',
      503,
      'GEMINI_NOT_CONFIGURED',
    );
  }
};

interface OpenRouterChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

const callOpenRouter = async (
  options: GeminiPromptOptions,
  modelId: string,
  responseFormat?: { type: 'json_object' },
): Promise<string> => {
  const messages = [
    ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
    { role: 'user', content: options.userPrompt },
  ];

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxOutputTokens ?? 1024,
      ...(responseFormat ? { response_format: responseFormat } : {}),
    }),
  });

  const data = (await response.json()) as OpenRouterChatResponse;

  if (!response.ok) {
    throw new Error(data.error?.message ?? `OpenRouter request failed with status ${response.status}`);
  }

  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new ValidationError('Gemini returned an empty response');
  }

  return text;
};

export const requestGeminiText = async (options: GeminiPromptOptions): Promise<string> => {
  ensureGeminiConfigured();
  try {
    const modelId = options.model ?? GEMINI_DEFAULT_MODEL;
    return await withCircuitBreaker(
      { provider: 'gemini', operation: 'chat_text', model: modelId },
      () => callOpenRouter(options, modelId),
    );
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error('[Gemini] API call failed:', message, error);
    throw new AppError(`Failed to generate Gemini response: ${message}`, 502);
  }
};

const stripMarkdownFences = (raw: string): string => {
  return raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
};

export const requestGeminiJson = async <T>(options: GeminiPromptOptions): Promise<T> => {
  ensureGeminiConfigured();
  try {
    const modelId = options.model ?? GEMINI_DEFAULT_MODEL;
    return await withCircuitBreaker(
      { provider: 'gemini', operation: 'chat_json', model: modelId },
      async () => {
        const raw = await callOpenRouter(options, modelId, { type: 'json_object' });
        const cleaned = stripMarkdownFences(raw);
        try {
          return JSON.parse(cleaned) as T;
        } catch {
          throw new ValidationError('Gemini returned invalid JSON');
        }
      },
    );
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Gemini] JSON API call failed:', message, error);
    throw new AppError(`Failed to generate Gemini JSON response: ${message}`, 502);
  }
};
