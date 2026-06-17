import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env.js';
import { AppError, ValidationError } from '../utils/errors.js';

export const GEMINI_DEFAULT_MODEL = 'gemini-1.5-flash';

export interface GeminiPromptOptions {
	model?: string;
	temperature?: number;
	maxOutputTokens?: number;
	systemPrompt?: string;
	userPrompt: string;
}

export const geminiClient = new GoogleGenerativeAI(env.GEMINI_API_KEY);

export const requestGeminiText = async (options: GeminiPromptOptions): Promise<string> => {
	try {
		const model = geminiClient.getGenerativeModel({
			model: options.model ?? GEMINI_DEFAULT_MODEL,
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
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Failed to generate Gemini response', 502);
	}
};

export const requestGeminiJson = async <T>(options: GeminiPromptOptions): Promise<T> => {
	const content = await requestGeminiText(options);

	try {
		return JSON.parse(content) as T;
	} catch {
		throw new ValidationError('Gemini returned invalid JSON');
	}
};
