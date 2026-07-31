import { describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();

vi.mock('../../src/db/client.js', () => ({
	pool: {
		query: queryMock,
	},
}));

const loadApp = async () => {
	const { buildApp } = await import('../../src/app.js');
	return buildApp();
};

describe('health endpoints', () => {
	it('returns a basic liveness response without querying the database', async () => {
		const app = await loadApp();
		await app.ready();

		const response = await app.inject({
			method: 'GET',
			url: '/health',
		});

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual({
			success: true,
			message: 'ResumeAI Backend is running',
		});
		expect(queryMock).not.toHaveBeenCalled();

		await app.close();
	});

	it('returns ready when the database query succeeds', async () => {
		queryMock.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
		const app = await loadApp();
		await app.ready();

		const response = await app.inject({
			method: 'GET',
			url: '/health/ready',
		});

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual({ success: true, status: 'ready' });
		expect(queryMock).toHaveBeenCalledWith('SELECT 1');

		await app.close();
	});

	it('returns unavailable without leaking database error details', async () => {
		queryMock.mockRejectedValueOnce(
			new Error('postgresql://postgres:secret@example.supabase.co/postgres'),
		);
		const app = await loadApp();
		await app.ready();

		const response = await app.inject({
			method: 'GET',
			url: '/health/db',
		});

		expect(response.statusCode).toBe(503);
		expect(response.json()).toEqual({ success: false, status: 'unavailable' });
		expect(response.body).not.toContain('secret');
		expect(response.body).not.toContain('supabase.co');

		await app.close();
	});
});
