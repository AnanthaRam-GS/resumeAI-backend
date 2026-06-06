import { Pool } from 'pg';
import { env } from '../config/env.js';

let poolInstance: Pool | null = null;

const createPool = () => {
	const pool = new Pool({
		connectionString: env.DATABASE_URL,
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
