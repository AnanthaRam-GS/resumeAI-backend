import { buildApp } from './app.js';
import { env } from './config/env.js';

const startServer = async () => {
	const app = buildApp();
	const port = env.PORT;
	const host = '0.0.0.0';

	try {
		await app.listen({ port, host });
	} catch (error) {
		app.log.fatal({ err: error }, 'Failed to start server');
		process.exit(1);
	}
};

void startServer();
