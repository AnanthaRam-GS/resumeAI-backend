import type { PoolClient } from 'pg';
import { pool } from './client.js';
import { runMigrations } from './migrate.js';

const MIGRATIONS_TABLE = 'schema_migrations';

const ensureMigrationsTable = async () => {
	await pool.query(
		`
		CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
			id SERIAL PRIMARY KEY,
			filename TEXT UNIQUE NOT NULL,
			executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
		`,
	);
};

const dropApplicationTables = async (client: PoolClient) => {
	const result = await client.query<{ tablename: string }>(
		`
		SELECT tablename
		FROM pg_tables
		WHERE schemaname = 'public' AND tablename != $1
		`,
		[MIGRATIONS_TABLE],
	);

	if (result.rows.length === 0) {
		return;
	}

	const tables = result.rows.map((row) => `"${row.tablename}"`).join(', ');
	await client.query(`DROP TABLE IF EXISTS ${tables} CASCADE`);
};

export const resetDatabase = async () => {
	if (process.env.NODE_ENV === 'production') {
		throw new Error('Database reset is not allowed in production');
	}

	await ensureMigrationsTable();

	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		await dropApplicationTables(client);
		await client.query(`TRUNCATE ${MIGRATIONS_TABLE}`);
		await client.query('COMMIT');
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}

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
