import type { FastifyPluginAsync } from 'fastify';
import { auth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { loginSchema, registerSchema, type LoginInput, type RegisterInput } from './auth.schema.js';
import { getCurrentUser, login, register } from './auth.controller.js';

export const authRoutes: FastifyPluginAsync = async (app) => {
	app.post<{ Body: RegisterInput }>(
		'/register',
		{
			preHandler: validate({
				body: registerSchema,
			}),
		},
		register,
	);

	app.post<{ Body: LoginInput }>(
		'/login',
		{
			preHandler: validate({
				body: loginSchema,
			}),
		},
		login,
	);

	app.get(
		'/me',
		{
			preHandler: auth,
		},
		getCurrentUser,
	);
};
