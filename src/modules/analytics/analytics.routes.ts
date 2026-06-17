import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { auth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { getAtsResult, triggerGapAnalysis, fetchGapAnalysis } from './analytics.controller.js';

const atsParamsSchema = z.object({
  resumeVersionId: z.uuid('Resume version ID must be a valid UUID'),
});

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
    { preHandler: auth },
    triggerGapAnalysis,
  );

  app.get(
    '/gap-analysis',
    { preHandler: auth },
    fetchGapAnalysis,
  );
};
