import type { FastifyPluginAsync } from 'fastify';
import multipart from '@fastify/multipart';
import { auth } from '../../middleware/auth.js';
import { parseImageUpload } from '../../middleware/upload.js';
import { validate } from '../../middleware/validate.js';
import {
	deleteSettingsAccount,
	getCurrentSettings,
	uploadSettingsProfilePhoto,
	updateCareerGoalSettings,
	updateProfileSettings,
	updateSettingsNotifications,
} from './settings.controller.js';
import {
	type DeleteAccountInput,
	type UpdateNotificationSettingsInput,
	type UpdateSettingsCareerGoalInput,
	type UpdateSettingsProfileInput,
	deleteAccountSchema,
	updateSettingsCareerGoalSchema,
	updateNotificationSettingsSchema,
	updateSettingsProfileSchema,
} from './settings.schema.js';

export const settingsRoutes: FastifyPluginAsync = async (app) => {
	await app.register(multipart);

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

	app.post(
		'/profile-photo',
		{
			preHandler: [auth, parseImageUpload],
		},
		uploadSettingsProfilePhoto,
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

	app.delete<{ Body: DeleteAccountInput }>(
		'/account',
		{
			preHandler: [
				auth,
				validate({
					body: deleteAccountSchema,
				}),
			],
		},
		deleteSettingsAccount,
	);
};
