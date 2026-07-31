import multipart from '@fastify/multipart';
import type { FastifyPluginAsync } from 'fastify';
import { auth } from '../../middleware/auth.js';
import { parseUpload } from '../../middleware/upload.js';
import { extractProfileFromResume } from './profile-extraction.controller.js';

export const profileExtractionRoutes: FastifyPluginAsync = async (app) => {
  await app.register(multipart);

  app.post(
    '/extract',
    {
      preHandler: [auth, parseUpload],
    },
    extractProfileFromResume,
  );
};
