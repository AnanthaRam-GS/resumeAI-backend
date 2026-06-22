import bcrypt from 'bcrypt';
import { pool } from '../../db/client.js';
import { deleteFile, getSignedUrl, uploadFile } from '../../services/storage.service.js';
import { ForbiddenError, NotFoundError } from '../../utils/errors.js';
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
	phone_number: string | null;
	linkedin_url: string | null;
	github_url: string | null;
	portfolio_url: string | null;
	location: string | null;
	profile_photo_s3_key: string | null;
	writing_style: string | null;
	notif_gap_digest: boolean;
	notif_gen_complete: boolean;
	notif_sync_complete: boolean;
	created_at: Date;
	updated_at: Date;
};

export type Settings = Omit<UserRow, 'password_hash'> & {
	profile_photo_url?: string;
};

const settingsSelectColumns = `
	id,
	email,
	full_name,
	password_hash,
	university,
	graduation_year,
	target_role_category,
	career_goal,
	phone_number,
	linkedin_url,
	github_url,
	portfolio_url,
	location,
	profile_photo_s3_key,
	writing_style,
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

const withProfilePhotoUrl = async (settings: Settings): Promise<Settings> => {
	if (!settings.profile_photo_s3_key) {
		return settings;
	}

	try {
		return {
			...settings,
			profile_photo_url: await getSignedUrl(settings.profile_photo_s3_key),
		};
	} catch {
		return settings;
	}
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

	return withProfilePhotoUrl(toSettings(user));
};

export const getSettings = async (userId: string): Promise<Settings> => {
	const user = await getUserRowById(userId);
	return withProfilePhotoUrl(toSettings(user));
};

export const updateSettingsProfile = async (
	userId: string,
	input: UpdateSettingsProfileInput,
): Promise<Settings> => {
	const updates: Record<string, string | number | null> = {};

	if (input.full_name !== undefined) updates.full_name = input.full_name;
	if (input.university !== undefined) updates.university = input.university;
	if (input.graduation_year !== undefined) updates.graduation_year = input.graduation_year;
	if (input.target_role_category !== undefined) updates.target_role_category = input.target_role_category;
	if (input.profile_photo_s3_key !== undefined) updates.profile_photo_s3_key = input.profile_photo_s3_key;
	if (input.phone_number !== undefined) updates.phone_number = input.phone_number;
	if (input.linkedin_url !== undefined) updates.linkedin_url = input.linkedin_url;
	if (input.github_url !== undefined) updates.github_url = input.github_url;
	if (input.portfolio_url !== undefined) updates.portfolio_url = input.portfolio_url;
	if (input.location !== undefined) updates.location = input.location;
	if (input.writing_style !== undefined) updates.writing_style = input.writing_style;

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

export const uploadProfilePhoto = async (
	userId: string,
	buffer: Buffer,
	mimetype: string,
	filename: string,
): Promise<Settings> => {
	const current = await getUserRowById(userId);
	const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
	const key = `users/${userId}/profile/${Date.now()}_${safeFilename}`;

	await uploadFile(key, buffer, mimetype);

	const settings = await updateUser(userId, {
		profile_photo_s3_key: key,
	});

	if (current.profile_photo_s3_key && current.profile_photo_s3_key !== key) {
		await deleteFile(current.profile_photo_s3_key).catch(() => {
			// Replacing the profile photo should not fail because old storage cleanup failed.
		});
	}

	return settings;
};

export const deleteAccount = async (
	userId: string,
	password: string,
): Promise<true> => {
	const user = await getUserRowById(userId);
	const passwordMatches = await bcrypt.compare(password, user.password_hash);

	if (!passwordMatches) {
		throw new ForbiddenError('Invalid password');
	}

	await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);

	return true;
};
