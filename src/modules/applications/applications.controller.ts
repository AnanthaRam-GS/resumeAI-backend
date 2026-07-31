import type { FastifyReply, FastifyRequest } from 'fastify';
import { success } from '../../utils/response.js';
import {
  createApplication,
  deleteApplication,
  getApplication,
  listApplications,
  updateApplication,
} from './applications.service.js';
import type {
  ApplicationBody,
  ApplicationParams,
  ApplicationQuery,
  ApplicationUpdate,
} from './applications.schema.js';

export const createApplicationHandler = async (
  request: FastifyRequest<{ Body: ApplicationBody }>,
  reply: FastifyReply,
) => reply.status(201).send(success(await createApplication(request.user.userId, request.body), 'Application created'));

export const listApplicationsHandler = async (
  request: FastifyRequest<{ Querystring: ApplicationQuery }>,
  reply: FastifyReply,
) => reply.send(success(await listApplications(request.user.userId, request.query)));

export const getApplicationHandler = async (
  request: FastifyRequest<{ Params: ApplicationParams }>,
  reply: FastifyReply,
) => reply.send(success(await getApplication(request.user.userId, request.params.id)));

export const updateApplicationHandler = async (
  request: FastifyRequest<{ Params: ApplicationParams; Body: ApplicationUpdate }>,
  reply: FastifyReply,
) => reply.send(success(await updateApplication(request.user.userId, request.params.id, request.body), 'Application updated'));

export const deleteApplicationHandler = async (
  request: FastifyRequest<{ Params: ApplicationParams }>,
  reply: FastifyReply,
) => {
  await deleteApplication(request.user.userId, request.params.id);
  return reply.status(204).send();
};

