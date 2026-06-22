import type { FastifyPluginAsync } from 'fastify';
import { auth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
	loginSchema, registerSchema, forgotPasswordSchema, resetPasswordSchema,
	type LoginInput, type RegisterInput, type ForgotPasswordInput, type ResetPasswordInput,
} from './auth.schema.js';
import { getCurrentUser, login, register, forgotPassword, resetPasswordHandler } from './auth.controller.js';

export const authRoutes: FastifyPluginAsync = async (app) => {
	app.post<{ Body: RegisterInput }>(
		'/register',
		{ preHandler: validate({ body: registerSchema }) },
		register,
	);

	app.post<{ Body: LoginInput }>(
		'/login',
		{ preHandler: validate({ body: loginSchema }) },
		login,
	);

	app.get(
		'/me',
		{ preHandler: auth },
		getCurrentUser,
	);

	app.post<{ Body: ForgotPasswordInput }>(
		'/forgot-password',
		{ preHandler: validate({ body: forgotPasswordSchema }) },
		forgotPassword,
	);

	app.post<{ Body: ResetPasswordInput }>(
		'/reset-password',
		{ preHandler: validate({ body: resetPasswordSchema }) },
		resetPasswordHandler,
	);
};
