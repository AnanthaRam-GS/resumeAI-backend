import type { FastifyPluginAsync } from 'fastify';
import { auth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { createCoverLetter, fetchCoverLetter } from './cover-letter.controller.js';
import {
  generateCoverLetterSchema,
  coverLetterResumeParamsSchema,
  type GenerateCoverLetterInput,
  type CoverLetterResumeParams,
} from './cover-letter.schema.js';

export const coverLetterRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Params: CoverLetterResumeParams; Body: GenerateCoverLetterInput }>(
    '/:resumeId/cover-letter',
    {
      preHandler: [
        auth,
        validate({
          params: coverLetterResumeParamsSchema,
          body: generateCoverLetterSchema,
        }),
      ],
    },
    createCoverLetter,
  );

  app.get<{ Params: CoverLetterResumeParams }>(
    '/:resumeId/cover-letter',
    {
      preHandler: [auth, validate({ params: coverLetterResumeParamsSchema })],
    },
    fetchCoverLetter,
  );
};
