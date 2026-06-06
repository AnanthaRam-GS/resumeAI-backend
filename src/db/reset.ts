import { pool } from './client.js';
import { runMigrations } from './migrate.js';

export const resetDatabase = async () => {
	if (process.env.NODE_ENV === 'production') {
		throw new Error('Database reset is not allowed in production');
	}

	await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
	await pool.query('CREATE SCHEMA public AUTHORIZATION CURRENT_USER');

	await runMigrations();
};

const runCli = async () => {
	try {
		await resetDatabase();
	} catch (error) {
		console.error('Database reset failed', error);
		process.exit(1);
	} finally {
		await pool.end();
	}
};

if (import.meta.url === `file://${process.argv[1]}`) {
	void runCli();
}
