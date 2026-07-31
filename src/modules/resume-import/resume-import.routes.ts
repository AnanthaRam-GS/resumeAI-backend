import type { FastifyPluginAsync } from 'fastify';
import multipart from '@fastify/multipart';
import { auth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { parseUpload } from '../../middleware/upload.js';
import {
  uploadResume,
  getStatus,
  retryParseResume,
  applyResume,
  listResumes,
  deleteResume,
} from './resume-import.controller.js';
import {
  applyResumeSchema,
  resumeDocumentParamsSchema,
  type ApplyResumeInput,
  type ResumeDocumentParams,
} from './resume-import.schema.js';

export const resumeImportRoutes: FastifyPluginAsync = async (app) => {
  await app.register(multipart);

  // POST /resume-import/upload  →  202 Accepted + { docId, status: 'processing' }
  app.post('/upload', { preHandler: [auth, parseUpload] }, uploadResume);

  // GET /resume-import/:id/status  →  poll until status = 'completed' | 'failed'
  app.get<{ Params: ResumeDocumentParams }>(
    '/:id/status',
    { preHandler: [auth, validate({ params: resumeDocumentParamsSchema })] },
    getStatus,
  );

  // POST /resume-import/:id/retry  →  re-trigger parsing for a failed document
  app.post<{ Params: ResumeDocumentParams }>(
    '/:id/retry',
    { preHandler: [auth, validate({ params: resumeDocumentParamsSchema })] },
    retryParseResume,
  );

  // POST /resume-import/:id/apply  →  create portfolio items from approved selections
  app.post<{ Params: ResumeDocumentParams; Body: ApplyResumeInput }>(
    '/:id/apply',
    {
      preHandler: [auth, validate({ params: resumeDocumentParamsSchema, body: applyResumeSchema })],
    },
    applyResume,
  );

  // GET /resume-import  →  list all uploaded resumes for the authenticated user
  app.get('/', { preHandler: [auth] }, listResumes);

  // DELETE /resume-import/:id  →  delete an uploaded resume history entry
  app.delete<{ Params: ResumeDocumentParams }>(
    '/:id',
    { preHandler: [auth, validate({ params: resumeDocumentParamsSchema })] },
    deleteResume,
  );
};
