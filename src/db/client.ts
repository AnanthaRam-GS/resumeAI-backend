import { readFileSync } from 'node:fs';
import type { ConnectionOptions } from 'node:tls';
import { Pool } from 'pg';
import type { PoolConfig } from 'pg';
import { env } from '../config/env.js';

let poolInstance: Pool | null = null;

const SSL_CONNECTION_STRING_PARAMS = ['sslcert', 'sslkey', 'sslrootcert', 'sslmode'];

const getSslModeFromConnectionString = (connectionString: string): typeof env.PGSSLMODE => {
	try {
		const databaseUrl = new URL(connectionString);
		const sslMode = databaseUrl.searchParams.get('sslmode');

		if (
			sslMode === 'disable' ||
			sslMode === 'allow' ||
			sslMode === 'prefer' ||
			sslMode === 'require' ||
			sslMode === 'verify-ca' ||
			sslMode === 'verify-full'
		) {
			return sslMode;
		}
	} catch {
		return undefined;
	}

	return undefined;
};

const getConnectionStringWithoutSslParams = (connectionString: string) => {
	try {
		const databaseUrl = new URL(connectionString);

		for (const param of SSL_CONNECTION_STRING_PARAMS) {
			databaseUrl.searchParams.delete(param);
		}

		return databaseUrl.toString();
	} catch {
		return connectionString;
	}
};

const getSslConfig = (connectionString: string): PoolConfig['ssl'] => {
	const sslMode = env.PGSSLMODE ?? getSslModeFromConnectionString(connectionString);

	if (!sslMode || sslMode === 'disable') {
		return undefined;
	}

	const sslConfig: ConnectionOptions = {};

	if (env.PGSSLROOTCERT) {
		sslConfig.ca = readFileSync(env.PGSSLROOTCERT, 'utf8');
	}

	if (env.DATABASE_SSL_REJECT_UNAUTHORIZED !== undefined) {
		sslConfig.rejectUnauthorized = env.DATABASE_SSL_REJECT_UNAUTHORIZED;
	} else {
		sslConfig.rejectUnauthorized = sslMode === 'verify-ca' || sslMode === 'verify-full';
	}

	return sslConfig;
};

export const createDatabasePool = (connectionString = env.DATABASE_URL) => {
	const pool = new Pool({
		connectionString: getConnectionStringWithoutSslParams(connectionString),
		ssl: getSslConfig(connectionString),
	});

	pool.on('error', (error) => {
		console.error('Unexpected database pool error', error);
	});

	return pool;
};

export const getPool = (): Pool => {
	if (!poolInstance) {
		poolInstance = createDatabasePool();
	}

	return poolInstance;
};

export const pool = getPool();
