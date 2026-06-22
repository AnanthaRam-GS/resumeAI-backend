import { env } from '../config/env.js';
import { AppError, ValidationError } from '../utils/errors.js';

const NIM_BASE_URL = 'https://integrate.api.nvidia.com/v1';

// Verify the exact model ID at https://catalog.ngc.nvidia.com/ai-foundation-models
export const NIM_DEFAULT_MODEL = 'deepseek-ai/deepseek-v4-pro';

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
}

interface NimApiResponse {
	choices?: Array<{ message?: { content?: string | null } }>;
}

export interface NimPromptOptions {
	model?: string;
	temperature?: number;
	maxTokens?: number;
	systemPrompt?: string;
	userPrompt: string;
}

const callNim = async (body: NimRequestBody): Promise<string> => {
	const response = await fetch(`${NIM_BASE_URL}/chat/completions`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.NVIDIA_API_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		const text = await response.text().catch(() => '');
		throw new Error(`NVIDIA NIM API error ${response.status}: ${text}`);
	}

	const data = (await response.json()) as NimApiResponse;
	return data.choices?.[0]?.message?.content?.trim() ?? '';
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

export const requestNimText = async (options: NimPromptOptions): Promise<string> => {
	try {
		const content = await callNim({
			model: options.model ?? NIM_DEFAULT_MODEL,
			messages: buildMessages(options),
			temperature: options.temperature ?? 0.2,
			max_tokens: options.maxTokens ?? 800,
		});

		if (!content) {
			throw new ValidationError('NVIDIA NIM returned an empty response');
		}

		return content;
	} catch (error) {
		if (error instanceof AppError) throw error;
		const message = error instanceof Error ? error.message : String(error);
		console.error('[NIM] API call failed:', message, error);
		throw new AppError(`Failed to generate NIM response: ${message}`, 502);
	}
};

export const requestNimJson = async <T>(options: NimPromptOptions): Promise<T> => {
	try {
		const content = await callNim({
			model: options.model ?? NIM_DEFAULT_MODEL,
			messages: buildMessages(options),
			temperature: options.temperature ?? 0.2,
			max_tokens: options.maxTokens ?? 800,
			response_format: { type: 'json_object' },
		});

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
		console.error('[NIM] JSON API call failed:', message, error);
		throw new AppError(`Failed to generate NIM JSON response: ${message}`, 502);
	}
};
