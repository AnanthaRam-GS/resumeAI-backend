import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { auth } from '../../src/middleware/auth.js';
import { validate } from '../../src/middleware/validate.js';
import { AppError, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../../src/utils/errors.js';

const buildAuthApp = () => {
	const app = buildApp();

	app.get('/protected', { preHandler: auth }, async (request) => {
		return {
			user: request.user,
		};
	});

	return app;
};

const buildValidationApp = () => {
	const app = buildApp();

	app.post(
		'/validate',
		{
			preHandler: validate({
				body: z.object({ name: z.string().min(1) }),
			}),
		},
		async (request) => {
			return {
				body: request.body,
			};
		},
	);

	return app;
};

describe('auth middleware', () => {
	it('accepts a valid token and attaches the user', async () => {
		const app = buildAuthApp();
		await app.ready();

		const token = jwt.sign(
			{ userId: 'user-123', email: 'user@example.com' },
			env.JWT_SECRET,
			{ expiresIn: '1h' },
		);

		const response = await app.inject({
			method: 'GET',
			url: '/protected',
			headers: {
				authorization: `Bearer ${token}`,
			},
		});

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual({
			user: { userId: 'user-123', email: 'user@example.com' },
		});

		await app.close();
	});

	it('rejects a missing token', async () => {
		const app = buildAuthApp();
		await app.ready();

		const response = await app.inject({
			method: 'GET',
			url: '/protected',
		});

		expect(response.statusCode).toBe(401);
		expect(response.json()).toMatchObject({
			success: false,
			message: 'Missing bearer token',
		});

		await app.close();
	});

	it('rejects an invalid token', async () => {
		const app = buildAuthApp();
		await app.ready();

		const response = await app.inject({
			method: 'GET',
			url: '/protected',
			headers: {
				authorization: 'Bearer invalid.token.value',
			},
		});

		expect(response.statusCode).toBe(401);
		expect(response.json()).toMatchObject({
			success: false,
			message: 'Invalid or expired token',
		});

		await app.close();
	});

	it('rejects an expired token', async () => {
		const app = buildAuthApp();
		await app.ready();

		const token = jwt.sign(
			{ userId: 'user-123', email: 'user@example.com' },
			env.JWT_SECRET,
			{ expiresIn: '-1s' },
		);

		const response = await app.inject({
			method: 'GET',
			url: '/protected',
			headers: {
				authorization: `Bearer ${token}`,
			},
		});

		expect(response.statusCode).toBe(401);
		expect(response.json()).toMatchObject({
			success: false,
			message: 'Invalid or expired token',
		});

		await app.close();
	});
});

describe('validate middleware', () => {
	it('accepts a valid schema payload', async () => {
		const app = buildValidationApp();
		await app.ready();

		const response = await app.inject({
			method: 'POST',
			url: '/validate',
			payload: { name: 'ResumeAI' },
		});

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual({ body: { name: 'ResumeAI' } });

		await app.close();
	});

	it('rejects an invalid schema payload', async () => {
		const app = buildValidationApp();
		await app.ready();

		const response = await app.inject({
			method: 'POST',
			url: '/validate',
			payload: { name: '' },
		});

		expect(response.statusCode).toBe(422);
		expect(response.json()).toMatchObject({
			success: false,
			message: expect.stringContaining('Invalid body payload'),
		});

		await app.close();
	});
});

describe('error classes', () => {
	it('exposes the expected status codes', () => {
		const cases = [
			new AppError('app', 500),
			new ValidationError('validation'),
			new UnauthorizedError('unauthorized'),
			new ForbiddenError('forbidden'),
			new NotFoundError('not found'),
			new ConflictError('conflict'),
		];

		expect(cases.map((error) => error.statusCode)).toEqual([500, 422, 401, 403, 404, 409]);
	});
});
