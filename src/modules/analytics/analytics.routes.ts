import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { auth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { getAtsResult, triggerGapAnalysis, fetchGapAnalysis } from './analytics.controller.js';

const atsParamsSchema = z.object({
  resumeVersionId: z.uuid('Resume version ID must be a valid UUID'),
});

const gapAnalysisSchema = z.object({
  jobDescription: z.string().trim().min(50, 'Job description must be at least 50 characters').optional(),
  save: z.boolean().optional(),
}).optional();

export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { resumeVersionId: string } }>(
    '/ats/:resumeVersionId',
    {
      preHandler: [auth, validate({ params: atsParamsSchema })],
    },
    getAtsResult,
  );

  app.post(
    '/gap-analysis',
    { preHandler: [auth, validate({ body: gapAnalysisSchema })] },
    triggerGapAnalysis,
  );

  app.get(
    '/gap-analysis',
    { preHandler: auth },
    fetchGapAnalysis,
  );
};
