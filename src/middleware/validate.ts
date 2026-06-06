import type { FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { ZodTypeAny } from 'zod';
import { ValidationError } from '../utils/errors.js';

type ValidationSchemas = {
	body?: ZodTypeAny;
	params?: ZodTypeAny;
	query?: ZodTypeAny;
};

const formatIssues = (section: string, message: string, path: string[]) => {
	const location = path.length > 0 ? `${section}.${path.join('.')}` : section;
	return `${location}: ${message}`;
};

const validateSection = <T>(
	section: 'body' | 'params' | 'query',
	schema: ZodTypeAny,
	value: unknown,
) => {
	const parsed = schema.safeParse(value);

	if (!parsed.success) {
		const details = parsed.error.issues
			.map((issue) => formatIssues(section, issue.message, issue.path.map(String)))
			.join('; ');

		throw new ValidationError(`Invalid ${section} payload: ${details}`);
	}

	return parsed.data as T;
};

export const validate = (schemas: ValidationSchemas): preHandlerHookHandler => {
	return async (request: FastifyRequest) => {
		if (schemas.body) {
			(request as FastifyRequest & { body: unknown }).body = validateSection(
				'body',
				schemas.body,
				request.body,
			);
		}

		if (schemas.params) {
			(request as FastifyRequest & { params: unknown }).params = validateSection(
				'params',
				schemas.params,
				request.params,
			);
		}

		if (schemas.query) {
			(request as FastifyRequest & { query: unknown }).query = validateSection(
				'query',
				schemas.query,
				request.query,
			);
		}
	};
};
