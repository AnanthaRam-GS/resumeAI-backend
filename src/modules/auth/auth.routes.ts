import type { FastifyPluginAsync } from 'fastify';
import { validate } from '../../middleware/validate.js';
import { registerSchema, type RegisterInput } from './auth.schema.js';
import { register } from './auth.controller.js';

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
};
