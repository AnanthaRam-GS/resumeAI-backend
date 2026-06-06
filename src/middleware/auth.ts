import type { preHandlerHookHandler } from 'fastify';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../utils/errors.js';
import type { JWTUser } from '../types/user.types.js';

const jwtPayloadSchema = z.object({
	userId: z.string().min(1),
	email: z.string().min(1),
});

const extractBearerToken = (authorizationHeader: string | undefined) => {
	if (!authorizationHeader?.startsWith('Bearer ')) {
		throw new UnauthorizedError('Missing bearer token');
	}

	const token = authorizationHeader.slice('Bearer '.length).trim();

	if (!token) {
		throw new UnauthorizedError('Missing bearer token');
	}

	return token;
};

const parseJwtPayload = (payload: string | JwtPayload): JWTUser => {
	if (typeof payload === 'string') {
		throw new UnauthorizedError('Invalid or expired token');
	}

	const parsedPayload = jwtPayloadSchema.safeParse(payload);

	if (!parsedPayload.success) {
		throw new UnauthorizedError('Invalid or expired token');
	}

	return parsedPayload.data;
};

export const auth: preHandlerHookHandler = async (request) => {
	const token = extractBearerToken(request.headers.authorization);

	try {
		const payload = jwt.verify(token, env.JWT_SECRET);
		request.user = parseJwtPayload(payload);
	} catch {
		throw new UnauthorizedError('Invalid or expired token');
	}
};
