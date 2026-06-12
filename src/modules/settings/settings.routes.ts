import type { FastifyPluginAsync } from 'fastify';
import { auth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
	getCurrentSettings,
	updateCareerGoalSettings,
	updateProfileSettings,
	updateSettingsNotifications,
} from './settings.controller.js';
import {
	type UpdateNotificationSettingsInput,
	type UpdateSettingsCareerGoalInput,
	type UpdateSettingsProfileInput,
	updateSettingsCareerGoalSchema,
	updateNotificationSettingsSchema,
	updateSettingsProfileSchema,
} from './settings.schema.js';

export const settingsRoutes: FastifyPluginAsync = async (app) => {
	app.get(
		'/',
		{
			preHandler: auth,
		},
		getCurrentSettings,
	);

	app.patch<{ Body: UpdateNotificationSettingsInput }>(
		'/notifications',
		{
			preHandler: [
				auth,
				validate({
					body: updateNotificationSettingsSchema,
				}),
			],
		},
		updateSettingsNotifications,
	);

	app.patch<{ Body: UpdateSettingsProfileInput }>(
		'/profile',
		{
			preHandler: [
				auth,
				validate({
					body: updateSettingsProfileSchema,
				}),
			],
		},
		updateProfileSettings,
	);

	app.patch<{ Body: UpdateSettingsCareerGoalInput }>(
		'/career-goal',
		{
			preHandler: [
				auth,
				validate({
					body: updateSettingsCareerGoalSchema,
				}),
			],
		},
		updateCareerGoalSettings,
	);
};
