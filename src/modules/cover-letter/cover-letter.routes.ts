import type { FastifyPluginAsync } from 'fastify';
import { auth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  generateCoverLetterSchema,
  resumeIdParamSchema,
  type GenerateCoverLetterInput,
} from './cover-letter.schema.js';
import { createCoverLetter, fetchCoverLetter } from './cover-letter.controller.js';

export const coverLetterRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Params: { resumeId: string }; Body: GenerateCoverLetterInput }>(
    '/:resumeId/cover-letter',
    {
      preHandler: [
        auth,
        validate({ params: resumeIdParamSchema, body: generateCoverLetterSchema }),
      ],
    },
    createCoverLetter,
  );

  app.get<{ Params: { resumeId: string } }>(
    '/:resumeId/cover-letter',
    { preHandler: [auth, validate({ params: resumeIdParamSchema })] },
    fetchCoverLetter,
  );
};
