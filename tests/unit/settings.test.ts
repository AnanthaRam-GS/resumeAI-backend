import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env.js';
import { NotFoundError, UnauthorizedError } from '../../src/utils/errors.js';

const getSettingsMock = vi.fn();
const updateSettingsProfileMock = vi.fn();
const updateSettingsCareerGoalMock = vi.fn();
const updateNotificationSettingsMock = vi.fn();
const deleteAccountMock = vi.fn();

vi.mock('../../src/modules/settings/settings.service.js', () => {
	return {
		getSettings: getSettingsMock,
		updateSettingsProfile: updateSettingsProfileMock,
		updateSettingsCareerGoal: updateSettingsCareerGoalMock,
		updateNotificationSettings: updateNotificationSettingsMock,
		deleteAccount: deleteAccountMock,
	};
});

const loadApp = async () => {
	const { buildApp } = await import('../../src/app.js');
	return buildApp();
};

const settings = {
	id: 'user-123',
	email: 'test@example.com',
	full_name: 'Test User',
	university: 'Amrita',
	graduation_year: 2027,
	target_role_category: 'Backend Engineering',
	career_goal: 'Build reliable backend systems for AI-powered products',
	profile_photo_s3_key: null,
	notif_gap_digest: true,
	notif_gen_complete: false,
	notif_sync_complete: true,
	created_at: new Date('2026-01-01T00:00:00.000Z'),
	updated_at: new Date('2026-01-01T00:00:00.000Z'),
};

const serializedSettings = {
	...settings,
	created_at: settings.created_at.toISOString(),
	updated_at: settings.updated_at.toISOString(),
};

const createToken = (userId = 'user-123', email = 'test@example.com') => {
	return jwt.sign({ userId, email }, env.JWT_SECRET, { expiresIn: '1h' });
};

describe('settings endpoints', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET /settings', () => {
		it('returns settings successfully', async () => {
			getSettingsMock.mockResolvedValueOnce(settings);
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'GET',
				url: '/settings',
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
			});

			expect(response.statusCode).toBe(200);
			expect(response.json()).toEqual({
				success: true,
				message: 'Settings retrieved',
				data: {
					settings: serializedSettings,
				},
			});
			expect(getSettingsMock).toHaveBeenCalledWith('user-123');

			await app.close();
		});

		it('returns 401 when the token is missing', async () => {
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'GET',
				url: '/settings',
			});

			expect(response.statusCode).toBe(401);
			expect(response.json()).toEqual({
				success: false,
				message: 'Missing bearer token',
			});

			await app.close();
		});
	});

	describe('PATCH /settings/notifications', () => {
		it('updates notification settings successfully', async () => {
			updateNotificationSettingsMock.mockResolvedValueOnce(settings);
			const app = await loadApp();
			await app.ready();

			const payload = {
				notif_gap_digest: false,
				notif_gen_complete: true,
			};

			const response = await app.inject({
				method: 'PATCH',
				url: '/settings/notifications',
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
				payload,
			});

			expect(response.statusCode).toBe(200);
			expect(response.json()).toEqual({
				success: true,
				message: 'Notification settings updated',
				data: {
					settings: serializedSettings,
				},
			});
			expect(updateNotificationSettingsMock).toHaveBeenCalledWith('user-123', payload);

			await app.close();
		});

		it('returns 422 for invalid notification settings payload', async () => {
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'PATCH',
				url: '/settings/notifications',
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
				payload: {},
			});

			expect(response.statusCode).toBe(422);
			expect(response.json()).toMatchObject({
				success: false,
				message: expect.stringContaining('Invalid body payload'),
			});

			await app.close();
		});

		it('returns 404 when the user is not found', async () => {
			updateNotificationSettingsMock.mockRejectedValueOnce(
				new NotFoundError('User not found'),
			);
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'PATCH',
				url: '/settings/notifications',
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
				payload: {
					notif_sync_complete: false,
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

	describe('PATCH /settings/profile', () => {
		it('updates profile settings successfully', async () => {
			updateSettingsProfileMock.mockResolvedValueOnce(settings);
			const app = await loadApp();
			await app.ready();

			const payload = {
				full_name: 'Updated User',
				university: 'Amrita Vishwa Vidyapeetham',
			};

			const response = await app.inject({
				method: 'PATCH',
				url: '/settings/profile',
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
				payload,
			});

			expect(response.statusCode).toBe(200);
			expect(response.json()).toEqual({
				success: true,
				message: 'Profile settings updated',
				data: {
					settings: serializedSettings,
				},
			});
			expect(updateSettingsProfileMock).toHaveBeenCalledWith('user-123', payload);

			await app.close();
		});

		it('returns 422 for invalid profile settings payload', async () => {
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'PATCH',
				url: '/settings/profile',
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
				payload: {},
			});

			expect(response.statusCode).toBe(422);
			expect(response.json()).toMatchObject({
				success: false,
				message: expect.stringContaining('Invalid body payload'),
			});

			await app.close();
		});
	});

	describe('PATCH /settings/career-goal', () => {
		it('updates career goal successfully', async () => {
			updateSettingsCareerGoalMock.mockResolvedValueOnce(settings);
			const app = await loadApp();
			await app.ready();

			const payload = {
				career_goal: 'Build robust backend systems for high-growth AI products',
			};

			const response = await app.inject({
				method: 'PATCH',
				url: '/settings/career-goal',
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
				payload,
			});

			expect(response.statusCode).toBe(200);
			expect(response.json()).toEqual({
				success: true,
				message: 'Career goal updated',
				data: {
					settings: serializedSettings,
				},
			});
			expect(updateSettingsCareerGoalMock).toHaveBeenCalledWith('user-123', payload);

			await app.close();
		});

		it('returns 422 for invalid career goal payload', async () => {
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'PATCH',
				url: '/settings/career-goal',
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
				payload: {
					career_goal: 'too short',
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

	describe('DELETE /settings/account', () => {
		it('deletes the account successfully', async () => {
			deleteAccountMock.mockResolvedValueOnce(true);
			const app = await loadApp();
			await app.ready();

			const payload = {
				password: 'password123',
				confirmText: 'DELETE MY ACCOUNT',
			};

			const response = await app.inject({
				method: 'DELETE',
				url: '/settings/account',
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
				payload,
			});

			expect(response.statusCode).toBe(200);
			expect(response.json()).toEqual({
				success: true,
				message: 'Account deleted',
			});
			expect(deleteAccountMock).toHaveBeenCalledWith('user-123', 'password123');

			await app.close();
		});

		it('returns 401 for a wrong password', async () => {
			deleteAccountMock.mockRejectedValueOnce(new UnauthorizedError('Invalid password'));
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'DELETE',
				url: '/settings/account',
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
				payload: {
					password: 'wrongpassword',
					confirmText: 'DELETE MY ACCOUNT',
				},
			});

			expect(response.statusCode).toBe(401);
			expect(response.json()).toEqual({
				success: false,
				message: 'Invalid password',
			});

			await app.close();
		});

		it('returns 422 for invalid delete account payload', async () => {
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'DELETE',
				url: '/settings/account',
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
				payload: {
					password: 'short',
					confirmText: 'WRONG TEXT',
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
});
