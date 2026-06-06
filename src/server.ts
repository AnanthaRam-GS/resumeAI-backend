import { buildApp } from './app.js';

const startServer = async () => {
	const app = buildApp();
	const port = Number(process.env.PORT ?? 3000);
	const host = process.env.HOST ?? '0.0.0.0';

	try {
		await app.listen({ port, host });
	} catch (error) {
		app.log.fatal({ err: error }, 'Failed to start server');
		process.exit(1);
	}
};

void startServer();
