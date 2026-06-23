import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import { authRoutes } from './modules/auth/index.js';
import { portfolioRoutes } from './modules/portfolio/index.js';
import { profileRoutes } from './modules/profile/index.js';
import { settingsRoutes } from './modules/settings/index.js';
import { resumeRoutes } from './modules/resume/resume.routes.js';
import { coverLetterRoutes } from './modules/cover-letter/cover-letter.routes.js';
import { analyticsRoutes } from './modules/analytics/analytics.routes.js';
import { documentsRoutes } from './modules/documents/documents.routes.js';
import { AppError } from './utils/errors.js';
import { error as errorResponse } from './utils/response.js';

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

const registerRoutes = (app: FastifyInstance) => {
	app.get('/health', async () => {
		return {
			success: true,
			message: 'ResumeAI Backend is running',
		};
	});

	app.register(authRoutes, { prefix: '/auth' });
	app.register(profileRoutes, { prefix: '/profile' });
	app.register(portfolioRoutes, { prefix: '/portfolio' });
	app.register(settingsRoutes, { prefix: '/settings' });
	app.register(resumeRoutes, { prefix: '/resume' });
	app.register(coverLetterRoutes, { prefix: '/resume' });
	app.register(analyticsRoutes, { prefix: '/analytics' });
	app.register(documentsRoutes, { prefix: '/portfolio' });
};

export const buildApp = (): FastifyInstance => {
	const app = Fastify({ logger: buildLoggerOptions() });

	app.register(cors, {
		origin: true,
		methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
		allowedHeaders: ['Authorization', 'Content-Type'],
	});
	app.register(helmet);
	app.register(rateLimit, {
		max: 100,
		timeWindow: 60000,
	});

	registerRoutes(app);

	app.setNotFoundHandler((request, reply) => {
		reply.status(404).send({
			success: false,
			message: 'Route not found',
			path: request.url,
		});
	});

	app.setErrorHandler((error, request, reply) => {
		request.log.error({ err: error }, 'Unhandled error');
		if (error instanceof AppError) {
			reply.status(error.statusCode).send(errorResponse(error.message));
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
			reply.status(statusCode).send(errorResponse(message));
			return;
		}

		reply.status(500).send(errorResponse('Internal server error'));
	});

	return app;
};
