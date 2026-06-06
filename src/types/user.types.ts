import type { FastifyRequest } from 'fastify';

export type JWTUser = {
	userId: string;
	email: string;
};

declare module 'fastify' {
	interface FastifyRequest {
		user: JWTUser;
	}
}

export type AuthenticatedFastifyRequest = FastifyRequest & {
	user: JWTUser;
};
