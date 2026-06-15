import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { auth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { getAts, triggerGapAnalysis, fetchGapAnalysis } from './analytics.controller.js';

const resumeVersionIdParamSchema = z.object({
  resumeVersionId: z.string().uuid('Invalid resume version ID'),
});

export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { resumeVersionId: string } }>(
    '/ats/:resumeVersionId',
    { preHandler: [auth, validate({ params: resumeVersionIdParamSchema })] },
    getAts,
  );

  app.post('/gap-analysis', { preHandler: auth }, triggerGapAnalysis);

  app.get('/gap-analysis', { preHandler: auth }, fetchGapAnalysis);
};
