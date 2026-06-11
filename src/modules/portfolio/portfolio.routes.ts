import type { FastifyPluginAsync } from 'fastify';
import { auth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { createItem, getItemById, listItems } from './portfolio.controller.js';
import {
	createPortfolioItemSchema,
	type PortfolioItemParams,
	type PortfolioItemQuery,
	portfolioItemParamsSchema,
	portfolioItemQuerySchema,
	type CreatePortfolioItemInput,
} from './portfolio.schema.js';

export const portfolioRoutes: FastifyPluginAsync = async (app) => {
	app.get<{ Querystring: PortfolioItemQuery }>(
		'/items',
		{
			preHandler: [
				auth,
				validate({
					query: portfolioItemQuerySchema,
				}),
			],
		},
		listItems,
	);

	app.get<{ Params: PortfolioItemParams }>(
		'/items/:id',
		{
			preHandler: [
				auth,
				validate({
					params: portfolioItemParamsSchema,
				}),
			],
		},
		getItemById,
	);

	app.post<{ Body: CreatePortfolioItemInput }>(
		'/items',
		{
			preHandler: [
				auth,
				validate({
					body: createPortfolioItemSchema,
				}),
			],
		},
		createItem,
	);
};
