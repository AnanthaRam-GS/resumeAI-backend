import type { FastifyRequest, FastifyReply } from 'fastify';
import { success } from '../../utils/response.js';
import { getAtsDetails } from './ats.service.js';
import { runGapAnalysis, getLatestGapAnalysis } from './gap-advisor.service.js';

export const getAts = async (
  request: FastifyRequest<{ Params: { resumeVersionId: string } }>,
  reply: FastifyReply,
): Promise<void> => {
  const { userId } = request.user;
  const result = await getAtsDetails(userId, request.params.resumeVersionId);
  reply.send(success(result));
};

export const triggerGapAnalysis = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const { userId } = request.user;
  const result = await runGapAnalysis(userId);
  reply.status(201).send(success(result));
};

export const fetchGapAnalysis = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const { userId } = request.user;
  const result = await getLatestGapAnalysis(userId);
  reply.send(success(result));
};
