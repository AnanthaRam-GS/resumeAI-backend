import type { FastifyRequest, FastifyReply } from 'fastify';
import { success, error } from '../../utils/response.js';
import { env } from '../../config/env.js';
import {
  initiateOAuthFlow,
  handleOAuthCallback,
  enqueueSyncJob,
  getSyncStatus,
  listGithubRepositories,
  disconnectGithub,
} from './github.service.js';
import type { GithubCallbackQuery, GithubSyncBody } from './github.schema.js';

const FRONTEND_URL = () => env.FRONTEND_URL ?? 'http://localhost:5173';

const withGithubResult = (returnTo: string, result: 'connected' | 'denied') => {
  const separator = returnTo.includes('?') ? '&' : '?';
  return `${FRONTEND_URL()}${returnTo}${separator}github=${result}`;
};

export const connectGithubHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const { returnTo } = (request.query ?? {}) as { returnTo?: string };
  const { redirectUrl } = await initiateOAuthFlow(request.user.userId, returnTo);

  if (request.headers.accept?.includes('application/json')) {
    reply.send(success({ redirectUrl }));
    return;
  }

  reply.redirect(redirectUrl);
};

export const callbackGithubHandler = async (
  request: FastifyRequest<{ Querystring: GithubCallbackQuery }>,
  reply: FastifyReply,
): Promise<void> => {
  const { code, state, error: oauthError } = request.query;

  if (oauthError) {
    reply.redirect(withGithubResult('/github-sync', 'denied'));
    return;
  }

  if (!code || !state) {
    reply.code(400).send(error('Missing code or state parameter'));
    return;
  }

  const result = await handleOAuthCallback(code, state);
  reply.redirect(withGithubResult(result.returnTo, 'connected'));
};

export const syncGithubHandler = async (
  request: FastifyRequest<{ Body: GithubSyncBody }>,
  reply: FastifyReply,
): Promise<void> => {
  const jobId = await enqueueSyncJob(request.user.userId, 'manual', {
    githubRepositoryId: request.body.repositoryId,
  });
  reply.code(202).send(success({ message: 'Sync started', jobId }));
};

export const getGithubStatusHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const status = await getSyncStatus(request.user.userId);
  reply.send(success(status));
};

export const listGithubRepositoriesHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const repositories = await listGithubRepositories(request.user.userId);
  reply.send(success({ repositories }));
};

export const disconnectGithubHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  await disconnectGithub(request.user.userId);
  reply.send(success({ message: 'GitHub account disconnected' }));
};
