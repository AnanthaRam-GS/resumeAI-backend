import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../../db/client.js';
import { env } from '../../config/env.js';
import { AppError, ConflictError, NotFoundError, UnauthorizedError } from '../../utils/errors.js';
import type { RegisterInput } from './auth.schema.js';

const PASSWORD_SALT_ROUNDS = 12;

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

export type SafeUser = Omit<UserRow, 'password_hash'>;

const userSelectColumns = `
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

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const toSafeUser = (user: UserRow): SafeUser => {
	const { password_hash: _passwordHash, ...safeUser } = user;
	void _passwordHash;
	return safeUser;
};

export const findUserByEmail = async (email: string): Promise<UserRow | null> => {
	const normalizedEmail = normalizeEmail(email);
	const result = await pool.query<UserRow>(
		`SELECT ${userSelectColumns} FROM users WHERE email = $1 LIMIT 1`,
		[normalizedEmail],
	);

	return result.rows[0] ?? null;
};

export const findUserById = async (userId: string): Promise<UserRow> => {
	const result = await pool.query<UserRow>(
		`SELECT ${userSelectColumns} FROM users WHERE id = $1 LIMIT 1`,
		[userId],
	);

	const user = result.rows[0];

	if (!user) {
		throw new NotFoundError('User not found');
	}

	return user;
};

export const createUser = async (input: RegisterInput): Promise<SafeUser> => {
	const existingUser = await findUserByEmail(input.email);

	if (existingUser) {
		throw new ConflictError('Email already registered');
	}

	const passwordHash = await bcrypt.hash(input.password, PASSWORD_SALT_ROUNDS);
	const normalizedEmail = normalizeEmail(input.email);

	const result = await pool.query<UserRow>(
		`
			INSERT INTO users (full_name, email, password_hash)
			VALUES ($1, $2, $3)
			RETURNING ${userSelectColumns}
		`,
		[input.full_name.trim(), normalizedEmail, passwordHash],
	);

	const createdUser = result.rows[0];

	if (!createdUser) {
		throw new AppError('Failed to create user', 500);
	}

	return toSafeUser(createdUser);
};

export const verifyPassword = async (
	password: string,
	passwordHash: string,
): Promise<void> => {
	const matches = await bcrypt.compare(password, passwordHash);

	if (!matches) {
		throw new UnauthorizedError('Invalid email or password');
	}
};

export const generateAuthToken = (user: Pick<UserRow, 'id' | 'email'>): string => {
	return jwt.sign(
		{
			userId: user.id,
			email: user.email,
		},
		env.JWT_SECRET,
		{
			expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
		},
	);
};
