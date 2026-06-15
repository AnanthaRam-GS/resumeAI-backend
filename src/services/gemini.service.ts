import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env.js';
import { AppError, ValidationError } from '../utils/errors.js';

export const GEMINI_DEFAULT_MODEL = 'gemini-1.5-flash';

export interface GeminiPromptOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  userPrompt: string;
  jsonMode?: boolean;
}

const geminiClient = new GoogleGenerativeAI(env.GEMINI_API_KEY);

export const requestGeminiText = async (options: GeminiPromptOptions): Promise<string> => {
  try {
    const model = geminiClient.getGenerativeModel({
      model: options.model ?? GEMINI_DEFAULT_MODEL,
      ...(options.systemPrompt ? { systemInstruction: options.systemPrompt } : {}),
      generationConfig: {
        temperature: options.temperature ?? 0.4,
        maxOutputTokens: options.maxTokens ?? 2048,
        ...(options.jsonMode ? { responseMimeType: 'application/json' } : {}),
      },
    });

    const result = await model.generateContent(options.userPrompt);
    const text = result.response.text().trim();

    if (!text) {
      throw new ValidationError('Gemini returned an empty response');
    }

    return text;
  } catch (error) {
    if (error instanceof AppError) throw error;

    const err = error as { status?: number; message?: string };
    if (err.status === 429) {
      throw new AppError('Gemini rate limit exceeded — please try again shortly', 429);
    }

    throw new AppError('Failed to generate Gemini response', 502);
  }
};

export const requestGeminiJson = async <T>(options: GeminiPromptOptions): Promise<T> => {
  const content = await requestGeminiText({ ...options, jsonMode: true });

  // Strip markdown code fences that some model versions still emit despite json mode
  const cleaned = content
    .replace(/^```(?:json)?\s*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new ValidationError('Gemini returned invalid JSON');
  }
};
