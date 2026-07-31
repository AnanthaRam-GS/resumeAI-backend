import type { FastifyPluginAsync } from 'fastify';
import { auth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  getJobTargetHandler,
  importJobTargetHandler,
  listJobTargetsHandler,
} from './job-targets.controller.js';
import {
  importJobTargetSchema,
  jobTargetListQuerySchema,
  jobTargetParamsSchema,
} from './job-targets.schema.js';

export const jobTargetRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: import('./job-targets.schema.js').ImportJobTargetInput }>(
    '/import',
    { preHandler: [auth, validate({ body: importJobTargetSchema })] },
    importJobTargetHandler,
  );

  app.get<{ Querystring: import('./job-targets.schema.js').JobTargetListQuery }>(
    '/',
    { preHandler: [auth, validate({ query: jobTargetListQuerySchema })] },
    listJobTargetsHandler,
  );

  app.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [auth, validate({ params: jobTargetParamsSchema })] },
    getJobTargetHandler,
  );
};
