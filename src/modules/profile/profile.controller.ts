import type { FastifyReply, FastifyRequest } from 'fastify';
import { success } from '../../utils/response.js';
import type {
	UpdateCareerGoalInput,
	UpdatePersonalProfileInput,
} from './profile.schema.js';
import {
	getProfile,
	updateCareerGoal,
	updatePersonalProfile,
} from './profile.service.js';

export const getCurrentProfile = async (
	request: FastifyRequest,
	reply: FastifyReply,
) => {
	const profile = await getProfile(request.user.userId);

	return reply.send(
		success(
			{
				profile,
			},
			'Profile retrieved',
		),
	);
};

export const updatePersonalProfileDetails = async (
	request: FastifyRequest,
	reply: FastifyReply,
) => {
	const profile = await updatePersonalProfile(
		request.user.userId,
		request.body as UpdatePersonalProfileInput,
	);

	return reply.send(
		success(
			{
				profile,
			},
			'Personal profile updated',
		),
	);
};

export const updateCareerGoalDetails = async (
	request: FastifyRequest,
	reply: FastifyReply,
) => {
	const profile = await updateCareerGoal(
		request.user.userId,
		request.body as UpdateCareerGoalInput,
	);

	return reply.send(
		success(
			{
				profile,
			},
			'Career goal updated',
		),
	);
};
