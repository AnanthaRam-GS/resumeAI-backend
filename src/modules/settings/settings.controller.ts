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
	uploadProfilePhoto,
	updateNotificationSettings,
	updateSettingsCareerGoal,
	updateSettingsProfile,
} from './settings.service.js';
import { ValidationError } from '../../utils/errors.js';

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

export const uploadSettingsProfilePhoto = async (
	request: FastifyRequest,
	reply: FastifyReply,
) => {
	const file = request.uploadedFile;
	if (!file) {
		throw new ValidationError('No file found on request. Use parseImageUpload middleware.');
	}

	const settings = await uploadProfilePhoto(
		request.user.userId,
		file.buffer,
		file.mimetype,
		file.filename,
	);

	return reply.status(201).send(
		success(
			{
				settings,
			},
			'Profile photo updated',
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
