import type { FastifyPluginAsync } from 'fastify';
import multipart from '@fastify/multipart';
import { auth } from '../../middleware/auth.js';
import { parseUpload } from '../../middleware/upload.js';
import { uploadDocument } from './documents.controller.js';

export const documentsRoutes: FastifyPluginAsync = async (app) => {
  // Register multipart support scoped to this plugin
  await app.register(multipart);

  app.post(
    '/upload',
    {
      preHandler: [auth, parseUpload],
    },
    uploadDocument,
  );
};
