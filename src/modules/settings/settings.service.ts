import bcrypt from 'bcrypt';
import { pool } from '../../db/client.js';
import { NotFoundError, UnauthorizedError } from '../../utils/errors.js';
import type {
	UpdateNotificationSettingsInput,
	UpdateSettingsCareerGoalInput,
	UpdateSettingsProfileInput,
} from './settings.schema.js';

type UserRow = {
	id: string;
	email: string;
	full_name: string;
	password_hash: string;
	university: string | null;
	graduation_year: number | null;
	target_role_category: string | null;
	career_goal: string | null;
	profile_photo_s3_key: string | null;
	notif_gap_digest: boolean;
	notif_gen_complete: boolean;
	notif_sync_complete: boolean;
	created_at: Date;
	updated_at: Date;
};

export type Settings = Omit<UserRow, 'password_hash'>;

const settingsSelectColumns = `
	id,
	email,
	full_name,
	password_hash,
	university,
	graduation_year,
	target_role_category,
	career_goal,
	profile_photo_s3_key,
	notif_gap_digest,
	notif_gen_complete,
	notif_sync_complete,
	created_at,
	updated_at
`;

const toSettings = (user: UserRow): Settings => {
	const { password_hash: _passwordHash, ...settings } = user;
	void _passwordHash;
	return settings;
};

const getUserRowById = async (userId: string): Promise<UserRow> => {
	const result = await pool.query<UserRow>(
		`SELECT ${settingsSelectColumns} FROM users WHERE id = $1 LIMIT 1`,
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
): Promise<Settings> => {
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
			RETURNING ${settingsSelectColumns}
		`,
		values,
	);

	const user = result.rows[0];

	if (!user) {
		throw new NotFoundError('User not found');
	}

	return toSettings(user);
};

export const getSettings = async (userId: string): Promise<Settings> => {
	const user = await getUserRowById(userId);
	return toSettings(user);
};

export const updateSettingsProfile = async (
	userId: string,
	input: UpdateSettingsProfileInput,
): Promise<Settings> => {
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

export const updateSettingsCareerGoal = async (
	userId: string,
	input: UpdateSettingsCareerGoalInput,
): Promise<Settings> => {
	return updateUser(userId, {
		career_goal: input.career_goal,
	});
};

export const updateNotificationSettings = async (
	userId: string,
	input: UpdateNotificationSettingsInput,
): Promise<Settings> => {
	const updates: Record<string, boolean> = {};

	if (input.notif_gap_digest !== undefined) {
		updates.notif_gap_digest = input.notif_gap_digest;
	}

	if (input.notif_gen_complete !== undefined) {
		updates.notif_gen_complete = input.notif_gen_complete;
	}

	if (input.notif_sync_complete !== undefined) {
		updates.notif_sync_complete = input.notif_sync_complete;
	}

	return updateUser(userId, updates);
};

export const deleteAccount = async (
	userId: string,
	password: string,
): Promise<true> => {
	const user = await getUserRowById(userId);
	const passwordMatches = await bcrypt.compare(password, user.password_hash);

	if (!passwordMatches) {
		throw new UnauthorizedError('Invalid password');
	}

	await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);

	return true;
};
