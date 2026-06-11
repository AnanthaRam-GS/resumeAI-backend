import type { FastifyPluginAsync } from 'fastify';
import { auth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { getCurrentProfile, updatePersonalProfileDetails } from './profile.controller.js';
import {
	type UpdatePersonalProfileInput,
	updatePersonalProfileSchema,
} from './profile.schema.js';

export const profileRoutes: FastifyPluginAsync = async (app) => {
	app.get(
		'/me',
		{
			preHandler: auth,
		},
		getCurrentProfile,
	);

	app.patch<{ Body: UpdatePersonalProfileInput }>(
		'/personal',
		{
			preHandler: [
				auth,
				validate({
					body: updatePersonalProfileSchema,
				}),
			],
		},
		updatePersonalProfileDetails,
	);
};
