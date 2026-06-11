import { pool } from '../src/db/client.js';

const checkConnection = async () => {
	try {
		const result = await pool.query<{ now: string }>('SELECT NOW()::text AS now');
		const timestamp = result.rows[0]?.now ?? 'unknown';
		console.log(`Database connection successful at ${timestamp}`);
	} finally {
		await pool.end();
	}
};

void checkConnection().catch((error: unknown) => {
	console.error('Database connection check failed', error);
	process.exit(1);
});
