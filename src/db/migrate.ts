import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './client.js';

const MIGRATIONS_TABLE = 'schema_migrations';

const getMigrationsDir = () => {
	const currentDir = path.dirname(fileURLToPath(import.meta.url));
	return path.join(currentDir, 'migrations');
};

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

const listMigrationFiles = async () => {
	const entries = await readdir(getMigrationsDir());
	return entries.filter((file) => file.endsWith('.sql')).sort();
};

const getAppliedMigrations = async () => {
	const result = await pool.query<{ filename: string }>(
		`SELECT filename FROM ${MIGRATIONS_TABLE}`,
	);
	return new Set(result.rows.map((row) => row.filename));
};

const runMigrationFile = async (filename: string) => {
	const filePath = path.join(getMigrationsDir(), filename);
	const sql = await readFile(filePath, 'utf8');

	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		await client.query(sql);
		await client.query(`INSERT INTO ${MIGRATIONS_TABLE} (filename) VALUES ($1)`, [
			filename,
		]);
		await client.query('COMMIT');
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
};

export const runMigrations = async () => {
	await ensureMigrationsTable();
	const migrations = await listMigrationFiles();
	const applied = await getAppliedMigrations();

	for (const filename of migrations) {
		if (applied.has(filename)) {
			continue;
		}

		await runMigrationFile(filename);
	}
};

const runCli = async () => {
	try {
		await runMigrations();
	} catch (error) {
		console.error('Migration run failed', error);
		process.exit(1);
	} finally {
		await pool.end();
	}
};

if (import.meta.url === `file://${process.argv[1]}`) {
	void runCli();
}
