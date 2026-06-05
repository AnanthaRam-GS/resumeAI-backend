import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';

const buildLoggerOptions = () => {
	if (process.env.NODE_ENV === 'production') {
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
};

export const buildApp = (): FastifyInstance => {
	const app = Fastify({ logger: buildLoggerOptions() });

	app.register(cors, { origin: true });
	app.register(helmet);
	app.register(rateLimit, {
		max: Number(process.env.RATE_LIMIT_MAX ?? 100),
		timeWindow: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000),
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
		const statusCode = error.statusCode ?? 500;

		reply.status(statusCode).send({
			success: false,
			message: statusCode === 500 ? 'Internal server error' : error.message,
		});
	});

	return app;
};
