import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { auth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  getAtsBenchmarkResult,
  getAtsResult,
  triggerGapAnalysis,
  fetchGapAnalysis,
  rankProjectsForJob,
} from './analytics.controller.js';

const atsParamsSchema = z.object({
  resumeVersionId: z.uuid('Resume version ID must be a valid UUID'),
});

const gapAnalysisBodySchema = z.object({
  jobDescription: z.string().trim()
    .min(50, 'Job description must be at least 50 characters')
    .max(20_000, 'Job description must be at most 20,000 characters')
    .optional(),
  jobTargetIds: z.array(z.string().uuid()).max(10, 'Maximum 10 job targets').optional(),
  projectCount: z.number().int().min(1).max(8).optional(),
  save: z.boolean().optional(),
}).optional();

const projectRankingBodySchema = z.object({
  jobTitle: z.string().trim().optional(),
  jobDescription: z.string().trim()
    .min(50, 'Job description must be at least 50 characters')
    .max(20_000, 'Job description must be at most 20,000 characters'),
  projectCount: z.number().int().min(1).max(8).optional(),
});

export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { resumeVersionId: string } }>(
    '/ats/:resumeVersionId',
    { preHandler: [auth, validate({ params: atsParamsSchema })] },
    getAtsResult,
  );

  app.get<{ Params: { resumeVersionId: string } }>(
    '/ats/:resumeVersionId/benchmark',
    { preHandler: [auth, validate({ params: atsParamsSchema })] },
    getAtsBenchmarkResult,
  );

  app.post(
    '/gap-analysis',
    { preHandler: [auth, validate({ body: gapAnalysisBodySchema })] },
    triggerGapAnalysis,
  );

  app.get(
    '/gap-analysis',
    { preHandler: auth },
    fetchGapAnalysis,
  );

  app.post(
    '/gap-analysis/project-ranking',
    { preHandler: [auth, validate({ body: projectRankingBodySchema })] },
    rankProjectsForJob,
  );
};
