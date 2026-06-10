import type { FastifyReply, FastifyRequest } from 'fastify';
import { success } from '../../utils/response.js';
import type { RegisterInput } from './auth.schema.js';
import { createUser, generateAuthToken } from './auth.service.js';

export const register = async (request: FastifyRequest, reply: FastifyReply) => {
	const user = await createUser(request.body as RegisterInput);
	const token = generateAuthToken(user);

	return reply.status(201).send(
		success(
			{
				user: {
					id: user.id,
					full_name: user.full_name,
					email: user.email,
				},
				token,
			},
			'Registration successful',
		),
	);
};
