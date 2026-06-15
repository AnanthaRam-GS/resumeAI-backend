import type { FastifyPluginAsync } from 'fastify';
import { auth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  generateResumeSchema,
  updateVersionStatusSchema,
  jobIdParamSchema,
  versionIdParamSchema,
  type GenerateResumeInput,
  type UpdateVersionStatusInput,
} from './resume.schema.js';
import {
  generateResume,
  getGenerationStatus,
  listVersions,
  getVersion,
  updateVersionStatus,
  removeVersion,
} from './resume.controller.js';

export const resumeRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: GenerateResumeInput }>(
    '/generate',
    { preHandler: [auth, validate({ body: generateResumeSchema })] },
    generateResume,
  );

  app.get<{ Params: { jobId: string } }>(
    '/generate/status/:jobId',
    { preHandler: [auth, validate({ params: jobIdParamSchema })] },
    getGenerationStatus,
  );

  app.get('/versions', { preHandler: auth }, listVersions);

  app.get<{ Params: { id: string } }>(
    '/versions/:id',
    { preHandler: [auth, validate({ params: versionIdParamSchema })] },
    getVersion,
  );

  app.patch<{ Params: { id: string }; Body: UpdateVersionStatusInput }>(
    '/versions/:id/status',
    {
      preHandler: [
        auth,
        validate({ params: versionIdParamSchema, body: updateVersionStatusSchema }),
      ],
    },
    updateVersionStatus,
  );

  app.delete<{ Params: { id: string } }>(
    '/versions/:id',
    { preHandler: [auth, validate({ params: versionIdParamSchema })] },
    removeVersion,
  );
};
