import type { FastifyPluginAsync } from 'fastify';
import { auth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
	createItem,
	getItemById,
	listItems,
	updateItem,
} from './portfolio.controller.js';
import {
	createPortfolioItemSchema,
	type PortfolioItemParams,
	type PortfolioItemQuery,
	type UpdatePortfolioItemInput,
	portfolioItemParamsSchema,
	portfolioItemQuerySchema,
	updatePortfolioItemSchema,
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

	app.patch<{ Params: PortfolioItemParams; Body: UpdatePortfolioItemInput }>(
		'/items/:id',
		{
			preHandler: [
				auth,
				validate({
					params: portfolioItemParamsSchema,
					body: updatePortfolioItemSchema,
				}),
			],
		},
		updateItem,
	);
};
