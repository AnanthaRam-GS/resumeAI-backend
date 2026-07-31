import type { FastifyPluginAsync } from 'fastify';
import { auth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  connectGithubHandler,
  callbackGithubHandler,
  syncGithubHandler,
  getGithubStatusHandler,
  listGithubRepositoriesHandler,
  disconnectGithubHandler,
} from './github.controller.js';
import {
  githubCallbackQuerySchema,
  githubSyncBodySchema,
  type GithubCallbackQuery,
  type GithubSyncBody,
} from './github.schema.js';

export const githubRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/connect', { preHandler: auth }, connectGithubHandler);
  fastify.get<{ Querystring: GithubCallbackQuery }>(
    '/callback',
    { preHandler: validate({ query: githubCallbackQuerySchema }) },
    callbackGithubHandler,
  );
  fastify.post<{ Body: GithubSyncBody }>(
    '/sync',
    { preHandler: [auth, validate({ body: githubSyncBodySchema })] },
    syncGithubHandler,
  );
  fastify.get('/status', { preHandler: auth }, getGithubStatusHandler);
  fastify.get('/repositories', { preHandler: auth }, listGithubRepositoriesHandler);
  fastify.delete('/disconnect', { preHandler: auth }, disconnectGithubHandler);
};
