import type { FastifyReply, FastifyRequest } from 'fastify';
import { success } from '../../utils/response.js';
import type {
	DeleteAccountInput,
	UpdateNotificationSettingsInput,
	UpdateSettingsCareerGoalInput,
	UpdateSettingsProfileInput,
} from './settings.schema.js';
import { getSettings } from './settings.service.js';
import {
	deleteAccount,
	updateNotificationSettings,
	updateSettingsCareerGoal,
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

export const updateCareerGoalSettings = async (
	request: FastifyRequest,
	reply: FastifyReply,
) => {
	const settings = await updateSettingsCareerGoal(
		request.user.userId,
		request.body as UpdateSettingsCareerGoalInput,
	);

	return reply.send(
		success(
			{
				settings,
			},
			'Career goal updated',
		),
	);
};

export const deleteSettingsAccount = async (
	request: FastifyRequest,
	reply: FastifyReply,
) => {
	const { password } = request.body as DeleteAccountInput;

	await deleteAccount(request.user.userId, password);

	return reply.send({
		success: true,
		message: 'Account deleted',
	});
};
