import Groq from 'groq-sdk';
import { env } from '../config/env.js';
import { AppError, ValidationError } from '../utils/errors.js';

export const GROQ_DEFAULT_MODEL = 'llama-3.1-8b-instant';

export interface GroqPromptOptions {
	model?: string;
	temperature?: number;
	maxTokens?: number;
	systemPrompt?: string;
	userPrompt: string;
}

export const groqClient = new Groq({ apiKey: env.GROQ_API_KEY });

const getGroqContent = (response: unknown): string => {
	const choices = (response as { choices?: Array<{ message?: { content?: string | null } }> }).choices;
	const content = choices?.[0]?.message?.content;
	return typeof content === 'string' ? content.trim() : '';
};

export const requestGroqText = async (options: GroqPromptOptions): Promise<string> => {
	try {
		const response = await groqClient.chat.completions.create({
			model: options.model ?? GROQ_DEFAULT_MODEL,
			temperature: options.temperature ?? 0.2,
			max_tokens: options.maxTokens ?? 800,
			messages: [
				...(options.systemPrompt
					? [{ role: 'system' as const, content: options.systemPrompt }]
					: []),
				{ role: 'user' as const, content: options.userPrompt },
			],
			response_format: { type: 'json_object' },
		});

		const content = getGroqContent(response);

		if (!content) {
			throw new ValidationError('Groq returned an empty response');
		}

		return content;
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Failed to generate Groq response', 502);
	}
};

export const requestGroqJson = async <T>(options: GroqPromptOptions): Promise<T> => {
	const content = await requestGroqText(options);

	try {
		return JSON.parse(content) as T;
	} catch {
		throw new ValidationError('Groq returned invalid JSON');
	}
};
