import type { FastifyPluginAsync } from 'fastify';
import { auth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  generateResume,
  getGenerationStatus,
  listVersions,
  getVersionById,
  duplicateVersion,
  updateVersionStatus,
  deleteVersion,
  updateContent,
  exportVersionPdf,
  saveEditorHtmlHandler,
  renderPdfHandler,
  getEditorHtmlHandler,
} from './resume.controller.js';
import {
  generateResumeSchema,
  generationStatusParamsSchema,
  resumeVersionParamsSchema,
  updateResumeStatusSchema,
  updateResumeContentSchema,
  resumeVersionQuerySchema,
  saveEditorHtmlSchema,
  renderEditorPdfSchema,
  type GenerateResumeInput,
  type GenerationStatusParams,
  type ResumeVersionParams,
  type UpdateResumeStatusInput,
  type UpdateResumeContentInput,
  type ResumeVersionQuery,
  type SaveEditorHtmlInput,
  type RenderEditorPdfInput,
} from './resume.schema.js';

export const resumeRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: GenerateResumeInput }>(
    '/generate',
    {
      preHandler: [auth, validate({ body: generateResumeSchema })],
    },
    generateResume,
  );

  app.get<{ Params: GenerationStatusParams }>(
    '/generate/status/:jobId',
    {
      preHandler: [auth, validate({ params: generationStatusParamsSchema })],
    },
    getGenerationStatus,
  );

  app.get<{ Querystring: ResumeVersionQuery }>(
    '/versions',
    {
      preHandler: [auth, validate({ query: resumeVersionQuerySchema })],
    },
    listVersions,
  );

  app.get<{ Params: ResumeVersionParams }>(
    '/versions/:id',
    {
      preHandler: [auth, validate({ params: resumeVersionParamsSchema })],
    },
    getVersionById,
  );

  app.post<{ Params: ResumeVersionParams }>(
    '/versions/:id/duplicate',
    {
      preHandler: [auth, validate({ params: resumeVersionParamsSchema })],
    },
    duplicateVersion,
  );

  app.patch<{ Params: ResumeVersionParams; Body: UpdateResumeStatusInput }>(
    '/versions/:id/status',
    {
      preHandler: [
        auth,
        validate({ params: resumeVersionParamsSchema, body: updateResumeStatusSchema }),
      ],
    },
    updateVersionStatus,
  );

  app.delete<{ Params: ResumeVersionParams }>(
    '/versions/:id',
    {
      preHandler: [auth, validate({ params: resumeVersionParamsSchema })],
    },
    deleteVersion,
  );

  app.patch<{ Params: ResumeVersionParams; Body: UpdateResumeContentInput }>(
    '/versions/:id/content',
    {
      preHandler: [
        auth,
        validate({ params: resumeVersionParamsSchema, body: updateResumeContentSchema }),
      ],
    },
    updateContent,
  );

  app.get<{ Params: ResumeVersionParams }>(
    '/versions/:id/export',
    {
      preHandler: [auth, validate({ params: resumeVersionParamsSchema })],
    },
    exportVersionPdf,
  );

  app.patch<{ Params: ResumeVersionParams; Body: SaveEditorHtmlInput }>(
    '/versions/:id/editor',
    {
      preHandler: [
        auth,
        validate({ params: resumeVersionParamsSchema, body: saveEditorHtmlSchema }),
      ],
    },
    saveEditorHtmlHandler,
  );

  app.get<{ Params: ResumeVersionParams }>(
    '/versions/:id/editor',
    {
      preHandler: [auth, validate({ params: resumeVersionParamsSchema })],
    },
    getEditorHtmlHandler,
  );

  app.post<{ Params: ResumeVersionParams; Body: RenderEditorPdfInput }>(
    '/versions/:id/render-pdf',
    {
      preHandler: [
        auth,
        validate({ params: resumeVersionParamsSchema, body: renderEditorPdfSchema }),
      ],
    },
    renderPdfHandler,
  );
};
