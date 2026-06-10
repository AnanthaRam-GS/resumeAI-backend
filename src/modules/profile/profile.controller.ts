import type { FastifyReply, FastifyRequest } from 'fastify';
import { success } from '../../utils/response.js';
import { getProfile } from './profile.service.js';

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
