import { pool } from '../../db/client.js';
import { NotFoundError } from '../../utils/errors.js';
import type {
	UpdateCareerGoalInput,
	UpdateOnboardingStepInput,
	UpdatePersonalProfileInput,
} from './profile.schema.js';

type UserRow = {
	id: string;
	full_name: string;
	email: string;
	password_hash: string;
	university: string | null;
	graduation_year: number | null;
	target_role_category: string | null;
	career_goal: string | null;
	onboarding_step: number;
	onboarding_complete: boolean;
	profile_photo_s3_key: string | null;
	notif_gap_digest: boolean;
	notif_gen_complete: boolean;
	notif_sync_complete: boolean;
	created_at: Date;
	updated_at: Date;
};

export type Profile = Omit<UserRow, 'password_hash'>;

export type ProfileCompleteness = {
	score: number;
	completed_fields: string[];
	missing_fields: string[];
};

const profileSelectColumns = `
	id,
	full_name,
	email,
	password_hash,
	university,
	graduation_year,
	target_role_category,
	career_goal,
	onboarding_step,
	onboarding_complete,
	profile_photo_s3_key,
	notif_gap_digest,
	notif_gen_complete,
	notif_sync_complete,
	created_at,
	updated_at
`;

const toProfile = (user: UserRow): Profile => {
	const { password_hash: _passwordHash, ...profile } = user;
	void _passwordHash;
	return profile;
};

const getUserRowById = async (userId: string): Promise<UserRow> => {
	const result = await pool.query<UserRow>(
		`SELECT ${profileSelectColumns} FROM users WHERE id = $1 LIMIT 1`,
		[userId],
	);

	const user = result.rows[0];

	if (!user) {
		throw new NotFoundError('User not found');
	}

	return user;
};

const updateUser = async (
	userId: string,
	updates: Record<string, string | number | boolean | null>,
): Promise<Profile> => {
	const entries = Object.entries(updates);
	const setClause = entries
		.map(([column], index) => `${column} = $${index + 2}`)
		.join(', ');
	const values = [userId, ...entries.map(([, value]) => value)];

	const result = await pool.query<UserRow>(
		`
			UPDATE users
			SET ${setClause}
			WHERE id = $1
			RETURNING ${profileSelectColumns}
		`,
		values,
	);

	const user = result.rows[0];

	if (!user) {
		throw new NotFoundError('User not found');
	}

	return toProfile(user);
};

export const getProfile = async (userId: string): Promise<Profile> => {
	const user = await getUserRowById(userId);
	return toProfile(user);
};

export const updatePersonalProfile = async (
	userId: string,
	input: UpdatePersonalProfileInput,
): Promise<Profile> => {
	const updates: Record<string, string | number | null> = {};

	if (input.full_name !== undefined) {
		updates.full_name = input.full_name;
	}

	if (input.university !== undefined) {
		updates.university = input.university;
	}

	if (input.graduation_year !== undefined) {
		updates.graduation_year = input.graduation_year;
	}

	if (input.target_role_category !== undefined) {
		updates.target_role_category = input.target_role_category;
	}

	if (input.profile_photo_s3_key !== undefined) {
		updates.profile_photo_s3_key = input.profile_photo_s3_key;
	}

	return updateUser(userId, updates);
};

export const updateCareerGoal = async (
	userId: string,
	input: UpdateCareerGoalInput,
): Promise<Profile> => {
	return updateUser(userId, {
		career_goal: input.career_goal,
	});
};

export const updateOnboardingStep = async (
	userId: string,
	input: UpdateOnboardingStepInput,
): Promise<Profile> => {
	const updates: Record<string, number | boolean> = {
		onboarding_step: input.onboarding_step,
	};

	if (input.onboarding_complete !== undefined) {
		updates.onboarding_complete = input.onboarding_complete;
	}

	return updateUser(userId, updates);
};

export const getProfileCompleteness = async (
	userId: string,
): Promise<ProfileCompleteness> => {
	const profile = await getProfile(userId);
	const fieldChecks = [
		{ key: 'full_name', value: profile.full_name },
		{ key: 'email', value: profile.email },
		{ key: 'university', value: profile.university },
		{ key: 'graduation_year', value: profile.graduation_year },
		{ key: 'target_role_category', value: profile.target_role_category },
		{ key: 'career_goal', value: profile.career_goal },
	];

	const completed_fields = fieldChecks
		.filter(({ value }) => value !== null && value !== '')
		.map(({ key }) => key);
	const missing_fields = fieldChecks
		.filter(({ value }) => value === null || value === '')
		.map(({ key }) => key);
	const score = Math.round((completed_fields.length / fieldChecks.length) * 100);

	return {
		score,
		completed_fields,
		missing_fields,
	};
};
