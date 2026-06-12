import type { FastifyReply, FastifyRequest } from 'fastify';
import { success } from '../../utils/response.js';
import type {
	UpdateNotificationSettingsInput,
	UpdateSettingsProfileInput,
} from './settings.schema.js';
import { getSettings } from './settings.service.js';
import {
	updateNotificationSettings,
	updateSettingsProfile,
} from './settings.service.js';

export const getCurrentSettings = async (
	request: FastifyRequest,
	reply: FastifyReply,
) => {
	const settings = await getSettings(request.user.userId);

	return reply.send(
		success(
			{
				settings,
			},
			'Settings retrieved',
		),
	);
};

export const updateSettingsNotifications = async (
	request: FastifyRequest,
	reply: FastifyReply,
) => {
	const settings = await updateNotificationSettings(
		request.user.userId,
		request.body as UpdateNotificationSettingsInput,
	);

	return reply.send(
		success(
			{
				settings,
			},
			'Notification settings updated',
		),
	);
};

export const updateProfileSettings = async (
	request: FastifyRequest,
	reply: FastifyReply,
) => {
	const settings = await updateSettingsProfile(
		request.user.userId,
		request.body as UpdateSettingsProfileInput,
	);

	return reply.send(
		success(
			{
				settings,
			},
			'Profile settings updated',
		),
	);
};
