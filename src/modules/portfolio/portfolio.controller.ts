import type { FastifyReply, FastifyRequest } from 'fastify';
import { success } from '../../utils/response.js';
import type { CreatePortfolioItemInput } from './portfolio.schema.js';
import { createPortfolioItem } from './portfolio.service.js';

export const createItem = async (request: FastifyRequest, reply: FastifyReply) => {
	const item = await createPortfolioItem(
		request.user.userId,
		request.body as CreatePortfolioItemInput,
	);

	return reply.status(201).send(
		success(
			{
				item,
			},
			'Portfolio item created',
		),
	);
};
