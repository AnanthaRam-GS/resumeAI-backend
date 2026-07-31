import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env.js';
import { ConflictError, NotFoundError, UnauthorizedError } from '../../src/utils/errors.js';

const createUserMock = vi.fn();
const findUserByEmailMock = vi.fn();
const findUserByIdMock = vi.fn();
const verifyPasswordMock = vi.fn();
const generateAuthTokenMock = vi.fn();

vi.mock('../../src/modules/auth/auth.service.js', () => {
	return {
		createUser: createUserMock,
		findUserByEmail: findUserByEmailMock,
		findUserById: findUserByIdMock,
		verifyPassword: verifyPasswordMock,
		generateAuthToken: generateAuthTokenMock,
	};
});

const loadApp = async () => {
	const { buildApp } = await import('../../src/app.js');
	return buildApp();
};

const mockUserRow = {
	id: 'user-123',
	full_name: 'Test User',
	email: 'test@example.com',
	password_hash: 'hashed-password',
	university: null,
	graduation_year: null,
	target_role_category: null,
	career_goal: null,
	phone_number: null,
	linkedin_url: null,
	github_url: null,
	portfolio_url: null,
	location: null,
	onboarding_step: 1,
	onboarding_complete: false,
	profile_photo_s3_key: null,
	writing_style: 'professional',
	notif_gap_digest: true,
	notif_gen_complete: false,
	notif_sync_complete: true,
	created_at: new Date('2026-01-01T00:00:00.000Z'),
	updated_at: new Date('2026-01-01T00:00:00.000Z'),
};

const expectedAuthUser = {
	id: 'user-123',
	full_name: 'Test User',
	email: 'test@example.com',
	university: null,
	graduation_year: null,
	target_role_category: null,
	career_goal: null,
	phone_number: null,
	linkedin_url: null,
	github_url: null,
	portfolio_url: null,
	location: null,
	onboarding_step: 1,
	onboarding_complete: false,
	profile_photo_s3_key: null,
	writing_style: 'professional',
};

describe('auth endpoints', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('POST /auth/register', () => {
		it('returns a successful registration response', async () => {
			createUserMock.mockResolvedValueOnce({
				...mockUserRow,
				password_hash: undefined,
			});
			generateAuthTokenMock.mockReturnValueOnce('register-token');
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'POST',
				url: '/auth/register',
				payload: {
					full_name: 'Test User',
					email: 'test@example.com',
					password: 'password123',
					confirmPassword: 'password123',
				},
			});

			expect(response.statusCode).toBe(201);
			expect(response.json()).toEqual({
				success: true,
				message: 'Registration successful',
				data: {
					user: expectedAuthUser,
					token: 'register-token',
				},
			});
			expect(response.json().data.user).not.toHaveProperty('password_hash');
			expect(createUserMock).toHaveBeenCalledWith({
				full_name: 'Test User',
				email: 'test@example.com',
				password: 'password123',
				confirmPassword: 'password123',
			});
			expect(generateAuthTokenMock).toHaveBeenCalledTimes(1);

			await app.close();
		});

		it('returns 409 for duplicate email', async () => {
			createUserMock.mockRejectedValueOnce(new ConflictError('Email already registered'));
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'POST',
				url: '/auth/register',
				payload: {
					full_name: 'Test User',
					email: 'test@example.com',
					password: 'password123',
					confirmPassword: 'password123',
				},
			});

			expect(response.statusCode).toBe(409);
			expect(response.json()).toEqual({
				success: false,
				message: 'Email already registered',
			});

			await app.close();
		});

		it('returns 422 for an invalid request body', async () => {
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'POST',
				url: '/auth/register',
				payload: {
					full_name: 'T',
					email: 'bad-email',
					password: 'short',
					confirmPassword: 'mismatch',
				},
			});

			expect(response.statusCode).toBe(422);
			expect(response.json()).toMatchObject({
				success: false,
				message: expect.stringContaining('Invalid body payload'),
			});

			await app.close();
		});
	});

	describe('POST /auth/login', () => {
		it('returns a successful login response', async () => {
			findUserByEmailMock.mockResolvedValueOnce(mockUserRow);
			verifyPasswordMock.mockResolvedValueOnce(undefined);
			generateAuthTokenMock.mockReturnValueOnce('login-token');
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'POST',
				url: '/auth/login',
				payload: {
					email: 'test@example.com',
					password: 'password123',
				},
			});

			expect(response.statusCode).toBe(200);
			expect(response.json()).toEqual({
				success: true,
				message: 'Login successful',
				data: {
					user: expectedAuthUser,
					token: 'login-token',
				},
			});
			expect(response.json().data.user).not.toHaveProperty('password_hash');
			expect(findUserByEmailMock).toHaveBeenCalledWith('test@example.com');
			expect(verifyPasswordMock).toHaveBeenCalledWith('password123', 'hashed-password');

			await app.close();
		});

		it('returns 401 for an unknown email', async () => {
			findUserByEmailMock.mockResolvedValueOnce(null);
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'POST',
				url: '/auth/login',
				payload: {
					email: 'unknown@example.com',
					password: 'password123',
				},
			});

			expect(response.statusCode).toBe(401);
			expect(response.json()).toEqual({
				success: false,
				message: 'User not found. Please create an account.',
				code: 'USER_NOT_FOUND',
			});

			await app.close();
		});

		it('returns 401 for a wrong password', async () => {
			findUserByEmailMock.mockResolvedValueOnce(mockUserRow);
			verifyPasswordMock.mockRejectedValueOnce(
				new UnauthorizedError('Incorrect password. Please try again.', 'INVALID_PASSWORD'),
			);
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'POST',
				url: '/auth/login',
				payload: {
					email: 'test@example.com',
					password: 'wrong-password',
				},
			});

			expect(response.statusCode).toBe(401);
			expect(response.json()).toEqual({
				success: false,
				message: 'Incorrect password. Please try again.',
				code: 'INVALID_PASSWORD',
			});

			await app.close();
		});

		it('returns 422 for an invalid login body', async () => {
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'POST',
				url: '/auth/login',
				payload: {
					email: 'bad-email',
					password: '',
				},
			});

			expect(response.statusCode).toBe(422);
			expect(response.json()).toMatchObject({
				success: false,
				message: expect.stringContaining('Invalid body payload'),
			});

			await app.close();
		});
	});

	describe('GET /auth/me', () => {
		it('returns the authenticated current user for a valid token', async () => {
			findUserByIdMock.mockResolvedValueOnce(mockUserRow);
			const app = await loadApp();
			await app.ready();

			const token = jwt.sign(
				{ userId: 'user-123', email: 'test@example.com' },
				env.JWT_SECRET,
				{ expiresIn: '1h' },
			);

			const response = await app.inject({
				method: 'GET',
				url: '/auth/me',
				headers: {
					authorization: `Bearer ${token}`,
				},
			});

			expect(response.statusCode).toBe(200);
			expect(response.json()).toEqual({
				success: true,
				message: 'Authenticated user retrieved',
				data: {
					user: expectedAuthUser,
				},
			});
			expect(response.json().data.user).not.toHaveProperty('password_hash');
			expect(findUserByIdMock).toHaveBeenCalledWith('user-123');

			await app.close();
		});

		it('returns 401 when the bearer token is missing', async () => {
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'GET',
				url: '/auth/me',
			});

			expect(response.statusCode).toBe(401);
			expect(response.json()).toEqual({
				success: false,
				message: 'Missing bearer token',
			});

			await app.close();
		});

		it('returns 401 for an invalid bearer token', async () => {
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'GET',
				url: '/auth/me',
				headers: {
					authorization: 'Bearer invalid.token',
				},
			});

			expect(response.statusCode).toBe(401);
			expect(response.json()).toEqual({
				success: false,
				message: 'Invalid or expired token',
			});

			await app.close();
		});

		it('returns 404 when the authenticated user no longer exists', async () => {
			findUserByIdMock.mockRejectedValueOnce(new NotFoundError('User not found'));
			const app = await loadApp();
			await app.ready();

			const token = jwt.sign(
				{ userId: 'missing-user', email: 'missing@example.com' },
				env.JWT_SECRET,
				{ expiresIn: '1h' },
			);

			const response = await app.inject({
				method: 'GET',
				url: '/auth/me',
				headers: {
					authorization: `Bearer ${token}`,
				},
			});

			expect(response.statusCode).toBe(404);
			expect(response.json()).toEqual({
				success: false,
				message: 'User not found',
			});

			await app.close();
		});
	});
});
