import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../../utils/errors.js';
import { success } from '../../utils/response.js';
import type { ForgotPasswordInput, LoginInput, RegisterInput, ResetPasswordInput } from './auth.schema.js';
import {
	createPasswordResetToken,
	createUser,
	findUserByEmail,
	findUserById,
	generateAuthToken,
	resetPassword,
	verifyPassword,
} from './auth.service.js';

type AuthUserShape = {
	id: string;
	full_name: string;
	email: string;
	university: string | null;
	graduation_year: number | null;
	target_role_category: string | null;
	career_goal: string | null;
	phone_number: string | null;
	linkedin_url: string | null;
	github_url: string | null;
	portfolio_url: string | null;
	location: string | null;
	onboarding_step: number;
	onboarding_complete: boolean;
	profile_photo_s3_key: string | null;
	writing_style: string | null;
};

const toAuthUser = (user: AuthUserShape) => ({
	id: user.id,
	full_name: user.full_name,
	email: user.email,
	university: user.university,
	graduation_year: user.graduation_year,
	target_role_category: user.target_role_category,
	career_goal: user.career_goal,
	phone_number: user.phone_number,
	linkedin_url: user.linkedin_url,
	github_url: user.github_url,
	portfolio_url: user.portfolio_url,
	location: user.location,
	onboarding_step: user.onboarding_step,
	onboarding_complete: user.onboarding_complete,
	profile_photo_s3_key: user.profile_photo_s3_key,
	writing_style: user.writing_style,
});

export const register = async (request: FastifyRequest, reply: FastifyReply) => {
	const user = await createUser(request.body as RegisterInput);
	const token = generateAuthToken(user);

	return reply.status(201).send(
		success(
			{
				user: toAuthUser(user),
				token,
			},
			'Registration successful',
		),
	);
};

export const login = async (request: FastifyRequest, reply: FastifyReply) => {
	const { email, password } = request.body as LoginInput;
	const user = await findUserByEmail(email);

	if (!user) {
		throw new UnauthorizedError('User not found. Please create an account.', 'USER_NOT_FOUND');
	}

	await verifyPassword(password, user.password_hash);
	const token = generateAuthToken(user);

	return reply.send(
		success(
			{
				user: toAuthUser(user),
				token,
			},
			'Login successful',
		),
	);
};

export const getCurrentUser = async (request: FastifyRequest, reply: FastifyReply) => {
	const user = await findUserById(request.user.userId);

	return reply.send(
		success(
			{
				user: toAuthUser(user),
			},
			'Authenticated user retrieved',
		),
	);
};

export const forgotPassword = async (request: FastifyRequest, reply: FastifyReply) => {
	const { email } = request.body as ForgotPasswordInput;
	const result = await createPasswordResetToken(email);
	// Always return 200 to avoid leaking whether email exists.
	// In production, you would email the token instead of returning it.
	return reply.send(
		success(
			{
				message: 'If this email is registered, a reset token has been generated.',
				// Only expose token in development so the flow can be tested without email
				...(process.env.NODE_ENV !== 'production' && result.exists ? { resetToken: result.token } : {}),
			},
			'Password reset requested',
		),
	);
};

export const resetPasswordHandler = async (request: FastifyRequest, reply: FastifyReply) => {
	const { token, password } = request.body as ResetPasswordInput;
	await resetPassword(token, password);
	return reply.send(success({}, 'Password reset successful. Please sign in with your new password.'));
};
