import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env.js';
import { AppError, ValidationError } from '../utils/errors.js';
import { withCircuitBreaker } from './circuit-breaker.service.js';

export const GEMINI_DEFAULT_MODEL = 'gemini-2.0-flash';

export interface GeminiPromptOptions {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  systemPrompt?: string;
  userPrompt: string;
}

export const geminiClient = env.GEMINI_API_KEY ? new GoogleGenerativeAI(env.GEMINI_API_KEY) : null;

const ensureGeminiConfigured = (): void => {
  if (!env.GEMINI_API_KEY) {
    throw new AppError(
      'Gemini API is not configured for this environment',
      503,
      'GEMINI_NOT_CONFIGURED',
    );
  }
};

export const requestGeminiText = async (options: GeminiPromptOptions): Promise<string> => {
  ensureGeminiConfigured();
  try {
    if (!geminiClient) {
      throw new AppError('Gemini client is not configured', 503, 'GEMINI_NOT_CONFIGURED');
    }
    const modelId = options.model ?? GEMINI_DEFAULT_MODEL;
    return await withCircuitBreaker(
      { provider: 'gemini', operation: 'chat_text', model: modelId },
      async () => {
        const model = geminiClient.getGenerativeModel({
          model: modelId,
          systemInstruction: options.systemPrompt,
          generationConfig: {
            temperature: options.temperature ?? 0.2,
            maxOutputTokens: options.maxOutputTokens ?? 1024,
          },
        });

        const result = await model.generateContent(options.userPrompt);
        const text = result.response.text().trim();

        if (!text) {
          throw new ValidationError('Gemini returned an empty response');
        }

        return text;
      },
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
    if (!geminiClient) {
      throw new AppError('Gemini client is not configured', 503, 'GEMINI_NOT_CONFIGURED');
    }
    const modelId = options.model ?? GEMINI_DEFAULT_MODEL;
    return await withCircuitBreaker(
      { provider: 'gemini', operation: 'chat_json', model: modelId },
      async () => {
        const model = geminiClient.getGenerativeModel({
          model: modelId,
          systemInstruction: options.systemPrompt,
          generationConfig: {
            temperature: options.temperature ?? 0.2,
            maxOutputTokens: options.maxOutputTokens ?? 1024,
            responseMimeType: 'application/json',
          },
        });

        const result = await model.generateContent(options.userPrompt);
        const raw = result.response.text().trim();

        if (!raw) {
          throw new ValidationError('Gemini returned an empty response');
        }

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
