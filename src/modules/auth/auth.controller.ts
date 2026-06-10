import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../../utils/errors.js';
import { success } from '../../utils/response.js';
import type { LoginInput, RegisterInput } from './auth.schema.js';
import {
	createUser,
	findUserByEmail,
	findUserById,
	generateAuthToken,
	verifyPassword,
} from './auth.service.js';

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

export const login = async (request: FastifyRequest, reply: FastifyReply) => {
	const { email, password } = request.body as LoginInput;
	const user = await findUserByEmail(email);

	if (!user) {
		throw new UnauthorizedError('Invalid email or password');
	}

	await verifyPassword(password, user.password_hash);
	const token = generateAuthToken(user);

	return reply.send(
		success(
			{
				user: {
					id: user.id,
					full_name: user.full_name,
					email: user.email,
				},
				token,
			},
			'Login successful',
		),
	);
};

export const getCurrentUser = async (request: FastifyRequest, reply: FastifyReply) => {
	const user = await findUserById(request.user.userId);

	return reply.send(
		success(
			{
				user: {
					id: user.id,
					full_name: user.full_name,
					email: user.email,
					university: user.university,
					graduation_year: user.graduation_year,
					target_role_category: user.target_role_category,
					career_goal: user.career_goal,
					onboarding_step: user.onboarding_step,
					onboarding_complete: user.onboarding_complete,
				},
			},
			'Authenticated user retrieved',
		),
	);
};
