import type { FastifyPluginAsync } from 'fastify';
import { auth } from '../../middleware/auth.js';
import { parseZipUpload } from '../../middleware/upload.js';
import { validate } from '../../middleware/validate.js';
import {
  applyLinkedInImportHandler,
  discardLinkedInImportHandler,
  getLinkedInImportHandler,
  uploadLinkedInImportHandler,
} from './linkedin-import.controller.js';
import {
  applyLinkedinImportSchema,
  linkedinBatchParamsSchema,
} from './linkedin-import.schema.js';

export const linkedInImportRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/upload',
    { preHandler: [auth, parseZipUpload] },
    uploadLinkedInImportHandler,
  );

  app.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [auth, validate({ params: linkedinBatchParamsSchema })] },
    getLinkedInImportHandler,
  );

  app.post<{ Params: { id: string }; Body: import('./linkedin-import.schema.js').ApplyLinkedInImportInput }>(
    '/:id/apply',
    { preHandler: [auth, validate({ params: linkedinBatchParamsSchema, body: applyLinkedinImportSchema })] },
    applyLinkedInImportHandler,
  );

  app.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [auth, validate({ params: linkedinBatchParamsSchema })] },
    discardLinkedInImportHandler,
  );
};
