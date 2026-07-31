import type { FastifyPluginAsync } from 'fastify';
import { auth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  applicationBodySchema,
  applicationParamsSchema,
  applicationQuerySchema,
  applicationUpdateSchema,
  type ApplicationBody,
  type ApplicationParams,
  type ApplicationQuery,
  type ApplicationUpdate,
} from './applications.schema.js';
import {
  createApplicationHandler,
  deleteApplicationHandler,
  getApplicationHandler,
  listApplicationsHandler,
  updateApplicationHandler,
} from './applications.controller.js';

export const applicationRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: ApplicationQuery }>(
    '/',
    { preHandler: [auth, validate({ query: applicationQuerySchema })] },
    listApplicationsHandler,
  );
  app.post<{ Body: ApplicationBody }>(
    '/',
    { preHandler: [auth, validate({ body: applicationBodySchema })] },
    createApplicationHandler,
  );
  app.get<{ Params: ApplicationParams }>(
    '/:id',
    { preHandler: [auth, validate({ params: applicationParamsSchema })] },
    getApplicationHandler,
  );
  app.patch<{ Params: ApplicationParams; Body: ApplicationUpdate }>(
    '/:id',
    { preHandler: [auth, validate({ params: applicationParamsSchema, body: applicationUpdateSchema })] },
    updateApplicationHandler,
  );
  app.delete<{ Params: ApplicationParams }>(
    '/:id',
    { preHandler: [auth, validate({ params: applicationParamsSchema })] },
    deleteApplicationHandler,
  );
};

