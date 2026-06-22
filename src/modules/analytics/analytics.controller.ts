import type { FastifyReply, FastifyRequest } from 'fastify';
import { success } from '../../utils/response.js';
import { getAtsResultForVersion } from './ats.service.js';
import { runGapAnalysis, getLatestGapAnalysis } from './gap-advisor.service.js';

type AtsParams = { resumeVersionId: string };

export const getAtsResult = async (
  request: FastifyRequest<{ Params: AtsParams }>,
  reply: FastifyReply,
) => {
  const result = await getAtsResultForVersion(request.user.userId, request.params.resumeVersionId);
  return reply.send(success(result));
};

export const triggerGapAnalysis = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const body = request.body as { jobDescription?: string; save?: boolean } | null;
  const result = await runGapAnalysis(request.user.userId, {
    jobDescription: body?.jobDescription,
    persist: body?.save ?? !body?.jobDescription,
  });
  return reply.status(201).send(success(result, 'Gap analysis complete'));
};

export const fetchGapAnalysis = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const result = await getLatestGapAnalysis(request.user.userId);
  return reply.send(success(result));
};
