import { config } from 'dotenv';
import { Pool } from 'pg';

config({ quiet: true });

let poolInstance: Pool | null = null;

const createPool = () => {
	const databaseUrl = process.env.DATABASE_URL;

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is required to initialize the database pool');
	}

	const pool = new Pool({
		connectionString: databaseUrl,
		ssl:
			process.env.DATABASE_SSL === 'true'
				? { rejectUnauthorized: false }
				: undefined,
	});

	pool.on('error', (error) => {
		console.error('Unexpected database pool error', error);
	});

	return pool;
};

export const getPool = (): Pool => {
	if (!poolInstance) {
		poolInstance = createPool();
	}

	return poolInstance;
};

export const pool = getPool();
