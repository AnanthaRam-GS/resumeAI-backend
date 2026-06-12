import type { FastifyPluginAsync } from 'fastify';
import { auth } from '../../middleware/auth.js';
import { getCurrentSettings } from './settings.controller.js';

export const settingsRoutes: FastifyPluginAsync = async (app) => {
	app.get(
		'/',
		{
			preHandler: auth,
		},
		getCurrentSettings,
	);
};
