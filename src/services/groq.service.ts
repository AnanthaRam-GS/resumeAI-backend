import Groq from 'groq-sdk';
import { env } from '../config/env.js';
import { AppError, ValidationError } from '../utils/errors.js';
import { withCircuitBreaker } from './circuit-breaker.service.js';

export const GROQ_DEFAULT_MODEL = 'llama-3.1-8b-instant';

export interface GroqPromptOptions {
	model?: string;
	temperature?: number;
	maxTokens?: number;
	systemPrompt?: string;
	userPrompt: string;
}

export const groqClient = env.GROQ_API_KEY ? new Groq({ apiKey: env.GROQ_API_KEY }) : null;

const ensureGroqConfigured = (): void => {
	if (!env.GROQ_API_KEY) {
		throw new AppError('Groq API is not configured for this environment', 503, 'GROQ_NOT_CONFIGURED');
	}
};

const getGroqContent = (response: unknown): string => {
	const choices = (response as { choices?: Array<{ message?: { content?: string | null } }> }).choices;
	const content = choices?.[0]?.message?.content;
	return typeof content === 'string' ? content.trim() : '';
};

export const requestGroqText = async (options: GroqPromptOptions): Promise<string> => {
	ensureGroqConfigured();
	try {
		if (!groqClient) {
			throw new AppError('Groq client is not configured', 503, 'GROQ_NOT_CONFIGURED');
		}
		const modelId = options.model ?? GROQ_DEFAULT_MODEL;
		const response = await withCircuitBreaker(
			{ provider: 'groq', operation: 'chat_text', model: modelId },
			() => groqClient.chat.completions.create({
			model: modelId,
			temperature: options.temperature ?? 0.2,
			max_tokens: options.maxTokens ?? 800,
			messages: [
				...(options.systemPrompt
					? [{ role: 'system' as const, content: options.systemPrompt }]
					: []),
				{ role: 'user' as const, content: options.userPrompt },
			],
		}),
		);

		const content = getGroqContent(response);

		if (!content) {
			throw new ValidationError('Groq returned an empty response');
		}

		return content;
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		const message = error instanceof Error ? error.message : String(error);
		console.error('[Groq] API call failed:', message, error);
		throw new AppError(`Failed to generate Groq response: ${message}`, 502);
	}
};

export const requestGroqJson = async <T>(options: GroqPromptOptions): Promise<T> => {
	ensureGroqConfigured();
	try {
		if (!groqClient) {
			throw new AppError('Groq client is not configured', 503, 'GROQ_NOT_CONFIGURED');
		}
		const modelId = options.model ?? GROQ_DEFAULT_MODEL;
		const response = await withCircuitBreaker(
			{ provider: 'groq', operation: 'chat_json', model: modelId },
			() => groqClient.chat.completions.create({
			model: modelId,
			temperature: options.temperature ?? 0.2,
			max_tokens: options.maxTokens ?? 800,
			messages: [
				...(options.systemPrompt
					? [{ role: 'system' as const, content: options.systemPrompt }]
					: []),
				{ role: 'user' as const, content: options.userPrompt },
			],
			response_format: { type: 'json_object' },
		}),
		);

		const content = getGroqContent(response);

		if (!content) {
			throw new ValidationError('Groq returned an empty response');
		}

		return JSON.parse(content) as T;
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		const message = error instanceof Error ? error.message : String(error);
		console.error('[Groq] JSON API call failed:', message, error);
		throw new AppError(`Failed to generate Groq response: ${message}`, 502);
	}
};
