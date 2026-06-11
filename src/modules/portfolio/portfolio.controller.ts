import type { FastifyReply, FastifyRequest } from 'fastify';
import { success } from '../../utils/response.js';
import type {
	CreatePortfolioItemInput,
	PortfolioItemParams,
	PortfolioItemQuery,
	UpdatePortfolioItemInput,
} from './portfolio.schema.js';
import {
	createPortfolioItem,
	getPortfolioItemById,
	listPortfolioItems,
	updatePortfolioItem,
} from './portfolio.service.js';

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

export const listItems = async (request: FastifyRequest, reply: FastifyReply) => {
	const items = await listPortfolioItems(
		request.user.userId,
		request.query as PortfolioItemQuery,
	);

	return reply.send(
		success(
			{
				items,
			},
			'Portfolio items retrieved',
		),
	);
};

export const getItemById = async (request: FastifyRequest, reply: FastifyReply) => {
	const item = await getPortfolioItemById(
		request.user.userId,
		(request.params as PortfolioItemParams).id,
	);

	return reply.send(
		success(
			{
				item,
			},
			'Portfolio item retrieved',
		),
	);
};

export const updateItem = async (request: FastifyRequest, reply: FastifyReply) => {
	const item = await updatePortfolioItem(
		request.user.userId,
		(request.params as PortfolioItemParams).id,
		request.body as UpdatePortfolioItemInput,
	);

	return reply.send(
		success(
			{
				item,
			},
			'Portfolio item updated',
		),
	);
};
