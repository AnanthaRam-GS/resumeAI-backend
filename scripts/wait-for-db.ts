import { pool } from '../src/db/client.js';

const maxAttempts = Number.parseInt(process.env.DB_WAIT_ATTEMPTS ?? '30', 10);
const delayMs = Number.parseInt(process.env.DB_WAIT_DELAY_MS ?? '1000', 10);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForDatabase = async () => {
	let lastError: unknown;

	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		try {
			await pool.query('SELECT 1');
			console.log('Database is ready');
			return;
		} catch (error) {
			lastError = error;
			console.log(`Waiting for database (${attempt}/${maxAttempts})`);
			await wait(delayMs);
		}
	}

	throw lastError instanceof Error ? lastError : new Error('Database did not become ready');
};

void waitForDatabase()
	.catch((error: unknown) => {
		console.error('Database readiness check failed', error);
		process.exit(1);
	})
	.finally(async () => {
		await pool.end();
	});
