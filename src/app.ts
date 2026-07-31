import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import rawBody from 'fastify-raw-body';
import { env } from './config/env.js';
import { authRoutes } from './modules/auth/index.js';
import { portfolioRoutes } from './modules/portfolio/index.js';
import { profileRoutes } from './modules/profile/index.js';
import { settingsRoutes } from './modules/settings/index.js';
import { resumeRoutes } from './modules/resume/resume.routes.js';
import { coverLetterRoutes } from './modules/cover-letter/cover-letter.routes.js';
import { analyticsRoutes } from './modules/analytics/analytics.routes.js';
import { documentsRoutes } from './modules/documents/documents.routes.js';
import { resumeImportRoutes } from './modules/resume-import/resume-import.routes.js';
import { githubRoutes } from './modules/github/github.routes.js';
import { jobTargetRoutes } from './modules/job-targets/index.js';
import { linkedInImportRoutes } from './modules/linkedin-import/index.js';
import { applicationRoutes } from './modules/applications/index.js';
import { profileExtractionRoutes } from './modules/profile-extraction/profile-extraction.routes.js';
import { AppError } from './utils/errors.js';
import { error as errorResponse } from './utils/response.js';
import { registerWebSocket } from './services/websocket.service.js';
import { getCorsConfig } from './utils/cors.js';
import { pool } from './db/client.js';

const buildLoggerOptions = () => {
	if (env.NODE_ENV === 'test') {
		return false as const;
	}

	if (env.NODE_ENV === 'production') {
		return { level: 'info' } as const;
	}

	return {
		level: 'debug',
		transport: {
			target: 'pino-pretty',
			options: {
				translateTime: 'SYS:standard',
				ignore: 'pid,hostname',
			},
		},
	} as const;
};

const isDatabaseConnectionError = (error: unknown) => {
	if (typeof error !== 'object' || error === null) {
		return false;
	}

	const code =
		'code' in error && typeof error.code === 'string' ? error.code : undefined;
	const message =
		'message' in error && typeof error.message === 'string' ? error.message : '';

	return (
		code === 'ENOTFOUND' ||
		code === 'ECONNREFUSED' ||
		code === 'ETIMEDOUT' ||
		code === 'ECONNRESET' ||
		code === 'XX000' && message.includes('tenant/user') ||
		message.includes('getaddrinfo ENOTFOUND')
	);
};

const registerRoutes = (app: FastifyInstance) => {
	app.get('/health', async () => {
		return {
			success: true,
			message: 'ResumeAI Backend is running',
		};
	});

	app.get('/health/db', async (_request, reply) => {
		try {
			await pool.query('SELECT 1');
			return { success: true, status: 'ok' };
		} catch {
			return reply.code(503).send({ success: false, status: 'unavailable' });
		}
	});

	app.get('/health/ready', async (_request, reply) => {
		try {
			await pool.query('SELECT 1');
			return { success: true, status: 'ready' };
		} catch {
			return reply.code(503).send({ success: false, status: 'not_ready' });
		}
	});

	app.register(authRoutes, { prefix: '/auth' });
	app.register(profileRoutes, { prefix: '/profile' });
	app.register(profileExtractionRoutes, { prefix: '/profile' });
	app.register(portfolioRoutes, { prefix: '/portfolio' });
	app.register(settingsRoutes, { prefix: '/settings' });
	app.register(resumeRoutes, { prefix: '/resume' });
	app.register(coverLetterRoutes, { prefix: '/resume' });
	app.register(analyticsRoutes, { prefix: '/analytics' });
	app.register(documentsRoutes, { prefix: '/portfolio' });
	app.register(resumeImportRoutes, { prefix: '/resume-import' });
	app.register(githubRoutes, { prefix: '/github' });
	app.register(jobTargetRoutes, { prefix: '/job-targets' });
	app.register(linkedInImportRoutes, { prefix: '/linkedin-import' });
	app.register(applicationRoutes, { prefix: '/applications' });
};

export const buildApp = (): FastifyInstance => {
	const app = Fastify({ logger: buildLoggerOptions() });

	app.register(cors, getCorsConfig());
	app.register(helmet);
	app.register(rateLimit, {
		max: 100,
		timeWindow: 60000,
	});
	app.register(rawBody, {
		field: 'rawBody',
		global: false,
		encoding: false,
		runFirst: true,
	});
	registerWebSocket(app);

	registerRoutes(app);

	app.setNotFoundHandler((request, reply) => {
		reply.status(404).send({
			success: false,
			message: 'Route not found',
			path: request.url,
		});
	});

	app.setErrorHandler((error, request, reply) => {
		if (error instanceof AppError) {
			if (error.statusCode >= 500) {
				request.log.error({ err: error }, 'Unhandled application error');
			}
			reply.status(error.statusCode).send(errorResponse(error.message, error.code));
			return;
		}

		if (isDatabaseConnectionError(error)) {
			request.log.error({ err: error }, 'Database connection unavailable');
			reply
				.status(503)
				.send(errorResponse('Database unavailable. Check Supabase configuration.', 'DATABASE_UNAVAILABLE'));
			return;
		}

		const statusCode =
			typeof error === 'object' &&
			error !== null &&
			'statusCode' in error &&
			typeof error.statusCode === 'number'
				? error.statusCode
				: undefined;

		const message = error instanceof Error ? error.message : 'Request failed';

		if (statusCode && statusCode >= 400) {
			if (statusCode >= 500) {
				request.log.error({ err: error }, 'Unhandled server error');
			}
			reply.status(statusCode).send(errorResponse(message));
			return;
		}

		request.log.error({ err: error }, 'Unhandled error');
		reply.status(500).send(errorResponse('Internal server error', 'SERVER_ERROR'));
	});

	return app;
};
