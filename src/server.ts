import { buildApp } from './app.js';
import { env } from './config/env.js';

type WorkerRuntime = typeof import('./workers/index.js');

let workerRuntime: WorkerRuntime | null = null;

const startWorkers = async () => {
	if (!env.WORKERS_ENABLED) {
		return;
	}

	workerRuntime = await import('./workers/index.js');
	workerRuntime.startPeriodicSyncScheduler();
};

const stopWorkers = async () => {
	if (!workerRuntime) {
		return;
	}

	await workerRuntime.shutdownWorkers();
};

const startServer = async () => {
	const app = buildApp();
	const port = env.PORT;
	const host = '0.0.0.0';

	try {
		await app.listen({ port, host });
		await startWorkers();
	} catch (error) {
		app.log.fatal({ err: error }, 'Failed to start server');
		process.exit(1);
	}

	const shutdown = async () => {
		await stopWorkers();
		await app.close();
		process.exit(0);
	};

	process.on('SIGTERM', shutdown);
	process.on('SIGINT', shutdown);
};

void startServer();
