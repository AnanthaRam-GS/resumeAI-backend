import type { FastifyReply, FastifyRequest } from 'fastify';
import { success } from '../../utils/response.js';
import {
  getJobTarget,
  importJobTarget,
  listJobTargets,
} from './job-targets.service.js';
import type {
  ImportJobTargetInput,
  JobTargetListQuery,
  JobTargetParams,
} from './job-targets.schema.js';

export const importJobTargetHandler = async (
  request: FastifyRequest<{ Body: ImportJobTargetInput }>,
  reply: FastifyReply,
) => {
  const result = await importJobTarget(request.user.userId, request.body);
  return reply.status(result.duplicate ? 200 : 201).send(success(result, result.duplicate ? 'Job target already exists' : 'Job target imported'));
};

export const getJobTargetHandler = async (
  request: FastifyRequest<{ Params: JobTargetParams }>,
  reply: FastifyReply,
) => {
  const target = await getJobTarget(request.user.userId, request.params.id);
  return reply.send(success(target));
};

export const listJobTargetsHandler = async (
  request: FastifyRequest<{ Querystring: JobTargetListQuery }>,
  reply: FastifyReply,
) => {
  const targets = await listJobTargets(request.user.userId, request.query);
  return reply.send(success(targets));
};

