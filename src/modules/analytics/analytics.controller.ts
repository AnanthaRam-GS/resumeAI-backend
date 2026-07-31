import type { FastifyReply, FastifyRequest } from 'fastify';
import { success } from '../../utils/response.js';
import { getAtsResultForVersion } from './ats.service.js';
import { runGapAnalysis, getLatestGapAnalysis } from './gap-advisor.service.js';
import { getAtsBenchmark } from './benchmark.service.js';
import { analyzeJobDescription } from '../ai/jd-analyzer.service.js';
import { listPortfolioItems } from '../portfolio/portfolio.service.js';
import { rankProjects, toRankableProjectFromPortfolioItem } from './project-ranking.service.js';

type AtsParams = { resumeVersionId: string };

type GapAnalysisBody = {
  jobDescription?: string;
  jobTargetIds?: string[];
  projectCount?: number;
  save?: boolean;
} | null;

type ProjectRankingBody = {
  jobTitle?: string;
  jobDescription: string;
  projectCount?: number;
};

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
  const body = request.body as GapAnalysisBody;

  const options = {
    jobDescription: body?.jobDescription,
    jobTargetIds: body?.jobTargetIds,
    projectCount: body?.projectCount,
    persist: body?.save !== undefined
      ? body.save
      : !body?.jobDescription,
  };

  const result = await runGapAnalysis(request.user.userId, options);
  return reply.status(201).send(success(result, 'Gap analysis complete'));
};

export const fetchGapAnalysis = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const result = await getLatestGapAnalysis(request.user.userId);

  const ageInDays = (Date.now() - new Date(result.generated_at).getTime()) / (1000 * 60 * 60 * 24);
  if (ageInDays > 7) {
    return reply.send(success({
      ...result,
      _stale: true,
      _staleAfterDays: Math.floor(ageInDays),
    }));
  }

  return reply.send(success(result));
};

export const rankProjectsForJob = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const body = request.body as ProjectRankingBody;
  const entities = await analyzeJobDescription(body.jobDescription);
  const portfolioItems = await listPortfolioItems(request.user.userId, { type: 'project', limit: 200 });
  const ranking = await rankProjects(
    request.user.userId,
    portfolioItems.map((item) => toRankableProjectFromPortfolioItem(item)),
    entities,
    body.jobDescription,
    body.projectCount,
  );

  return reply.send(success(ranking));
};

export const getAtsBenchmarkResult = async (
  request: FastifyRequest<{ Params: AtsParams }>,
  reply: FastifyReply,
) => {
  const result = await getAtsBenchmark(request.user.userId, request.params.resumeVersionId);
  return reply.send(success(result));
};
