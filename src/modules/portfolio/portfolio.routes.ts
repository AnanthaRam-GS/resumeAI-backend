import type { FastifyPluginAsync } from 'fastify';
import { auth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { createItem } from './portfolio.controller.js';
import {
	createPortfolioItemSchema,
	type CreatePortfolioItemInput,
} from './portfolio.schema.js';

export const portfolioRoutes: FastifyPluginAsync = async (app) => {
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
