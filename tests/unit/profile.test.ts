import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env.js';
import { NotFoundError } from '../../src/utils/errors.js';

const getProfileMock = vi.fn();
const updatePersonalProfileMock = vi.fn();
const updateCareerGoalMock = vi.fn();
const updateOnboardingStepMock = vi.fn();
const getProfileCompletenessMock = vi.fn();

vi.mock('../../src/modules/profile/profile.service.js', () => {
	return {
		getProfile: getProfileMock,
		updatePersonalProfile: updatePersonalProfileMock,
		updateCareerGoal: updateCareerGoalMock,
		updateOnboardingStep: updateOnboardingStepMock,
		getProfileCompleteness: getProfileCompletenessMock,
	};
});

const loadApp = async () => {
	const { buildApp } = await import('../../src/app.js');
	return buildApp();
};

const profile = {
	id: 'user-123',
	full_name: 'Test User',
	email: 'test@example.com',
	university: 'Amrita',
	graduation_year: 2027,
	target_role_category: 'Software Engineering',
	career_goal: 'Become a backend engineer at a product company',
	onboarding_step: 3,
	onboarding_complete: false,
	profile_photo_s3_key: null,
	notif_gap_digest: true,
	notif_gen_complete: false,
	notif_sync_complete: true,
	created_at: new Date('2026-01-01T00:00:00.000Z'),
	updated_at: new Date('2026-01-01T00:00:00.000Z'),
};

const serializedProfile = {
	...profile,
	created_at: profile.created_at.toISOString(),
	updated_at: profile.updated_at.toISOString(),
};

const completeness = {
	score: 67,
	completed_fields: ['full_name', 'email', 'career_goal', 'target_role_category'],
	missing_fields: ['university', 'graduation_year'],
};

const createToken = (userId = 'user-123', email = 'test@example.com') => {
	return jwt.sign({ userId, email }, env.JWT_SECRET, { expiresIn: '1h' });
};

describe('profile endpoints', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET /profile/me', () => {
		it('returns the current profile for a valid token', async () => {
			getProfileMock.mockResolvedValueOnce(profile);
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'GET',
				url: '/profile/me',
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
			});

			expect(response.statusCode).toBe(200);
			expect(response.json()).toEqual({
				success: true,
				message: 'Profile retrieved',
				data: {
					profile: serializedProfile,
				},
			});
			expect(response.json().data.profile).not.toHaveProperty('password_hash');
			expect(getProfileMock).toHaveBeenCalledWith('user-123');

			await app.close();
		});

		it('returns 401 when the token is missing', async () => {
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'GET',
				url: '/profile/me',
			});

			expect(response.statusCode).toBe(401);
			expect(response.json()).toEqual({
				success: false,
				message: 'Missing bearer token',
			});

			await app.close();
		});

		it('returns 404 when the user does not exist', async () => {
			getProfileMock.mockRejectedValueOnce(new NotFoundError('User not found'));
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'GET',
				url: '/profile/me',
				headers: {
					authorization: `Bearer ${createToken()}`,
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

	describe('PATCH /profile/personal', () => {
		it('updates the personal profile successfully', async () => {
			updatePersonalProfileMock.mockResolvedValueOnce(profile);
			const app = await loadApp();
			await app.ready();

			const payload = {
				full_name: 'Updated User',
				university: 'Amrita Vishwa Vidyapeetham',
			};

			const response = await app.inject({
				method: 'PATCH',
				url: '/profile/personal',
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
				payload,
			});

			expect(response.statusCode).toBe(200);
			expect(response.json()).toEqual({
				success: true,
				message: 'Personal profile updated',
				data: {
					profile: serializedProfile,
				},
			});
			expect(response.json().data.profile).not.toHaveProperty('password_hash');
			expect(updatePersonalProfileMock).toHaveBeenCalledWith('user-123', payload);

			await app.close();
		});

		it('returns 422 for an invalid personal profile payload', async () => {
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'PATCH',
				url: '/profile/personal',
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

	describe('PATCH /profile/career-goal', () => {
		it('updates the career goal successfully', async () => {
			updateCareerGoalMock.mockResolvedValueOnce(profile);
			const app = await loadApp();
			await app.ready();

			const payload = {
				career_goal: 'Build distributed backend systems for a strong product team',
			};

			const response = await app.inject({
				method: 'PATCH',
				url: '/profile/career-goal',
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
					profile: serializedProfile,
				},
			});
			expect(response.json().data.profile).not.toHaveProperty('password_hash');
			expect(updateCareerGoalMock).toHaveBeenCalledWith('user-123', payload);

			await app.close();
		});

		it('returns 422 for an invalid career goal payload', async () => {
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'PATCH',
				url: '/profile/career-goal',
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

	describe('PATCH /profile/onboarding-step', () => {
		it('updates the onboarding step successfully', async () => {
			updateOnboardingStepMock.mockResolvedValueOnce(profile);
			const app = await loadApp();
			await app.ready();

			const payload = {
				onboarding_step: 4,
				onboarding_complete: false,
			};

			const response = await app.inject({
				method: 'PATCH',
				url: '/profile/onboarding-step',
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
				payload,
			});

			expect(response.statusCode).toBe(200);
			expect(response.json()).toEqual({
				success: true,
				message: 'Onboarding progress updated',
				data: {
					profile: serializedProfile,
				},
			});
			expect(response.json().data.profile).not.toHaveProperty('password_hash');
			expect(updateOnboardingStepMock).toHaveBeenCalledWith('user-123', payload);

			await app.close();
		});

		it('returns 422 for an invalid onboarding step', async () => {
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'PATCH',
				url: '/profile/onboarding-step',
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
				payload: {
					onboarding_step: 6,
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

	describe('GET /profile/completeness', () => {
		it('returns the completeness payload', async () => {
			getProfileCompletenessMock.mockResolvedValueOnce(completeness);
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'GET',
				url: '/profile/completeness',
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
			});

			expect(response.statusCode).toBe(200);
			expect(response.json()).toEqual({
				success: true,
				message: 'Profile completeness calculated',
				data: {
					completeness,
				},
			});
			expect(getProfileCompletenessMock).toHaveBeenCalledWith('user-123');

			await app.close();
		});
	});
});
