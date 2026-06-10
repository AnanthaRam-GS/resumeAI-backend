import type { FastifyPluginAsync } from 'fastify';
import { auth } from '../../middleware/auth.js';
import { getCurrentProfile } from './profile.controller.js';

export const profileRoutes: FastifyPluginAsync = async (app) => {
	app.get(
		'/me',
		{
			preHandler: auth,
		},
		getCurrentProfile,
	);
};
