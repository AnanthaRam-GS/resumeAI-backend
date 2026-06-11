import type { FastifyReply, FastifyRequest } from 'fastify';
import { success } from '../../utils/response.js';
import type { UpdatePersonalProfileInput } from './profile.schema.js';
import { getProfile, updatePersonalProfile } from './profile.service.js';

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
