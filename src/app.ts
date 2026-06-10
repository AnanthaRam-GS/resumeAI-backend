import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import { authRoutes } from './modules/auth/index.js';
import { profileRoutes } from './modules/profile/index.js';
import { AppError } from './utils/errors.js';
import { error as errorResponse } from './utils/response.js';

const buildLoggerOptions = () => {
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
};

export const buildApp = (): FastifyInstance => {
	const app = Fastify({ logger: buildLoggerOptions() });

	app.register(cors, { origin: true });
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

		reply.status(500).send(errorResponse('Internal server error'));
	});

	return app;
};
