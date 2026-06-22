import type { FastifyReply, FastifyRequest } from 'fastify';
import { success } from '../../utils/response.js';
import { generateResumeForJob } from './orchestrator.service.js';
import {
  getGenerationJobStatus,
  listResumeVersions,
  getResumeVersionById,
  duplicateResumeVersion,
  updateResumeVersionStatus,
  deleteResumeVersion,
  updateResumeContent,
  exportResumeVersionPdf,
  saveEditorHtml,
  renderAndStorePdf,
  getEditorHtml,
} from './resume.service.js';
import type {
  GenerateResumeInput,
  GenerationStatusParams,
  ResumeVersionParams,
  UpdateResumeStatusInput,
  UpdateResumeContentInput,
  ResumeVersionQuery,
  SaveEditorHtmlInput,
  RenderEditorPdfInput,
} from './resume.schema.js';

export const generateResume = async (
  request: FastifyRequest<{ Body: GenerateResumeInput }>,
  reply: FastifyReply,
) => {
  const result = await generateResumeForJob(request.user.userId, request.body);
  return reply.status(201).send(success(result, 'Resume generation complete'));
};

export const getGenerationStatus = async (
  request: FastifyRequest<{ Params: GenerationStatusParams }>,
  reply: FastifyReply,
) => {
  const job = await getGenerationJobStatus(request.user.userId, request.params.jobId);
  return reply.send(success(job));
};

export const listVersions = async (
  request: FastifyRequest<{ Querystring: ResumeVersionQuery }>,
  reply: FastifyReply,
) => {
  const versions = await listResumeVersions(request.user.userId, request.query);
  return reply.send(success(versions));
};

export const getVersionById = async (
  request: FastifyRequest<{ Params: ResumeVersionParams }>,
  reply: FastifyReply,
) => {
  const version = await getResumeVersionById(request.user.userId, request.params.id);
  return reply.send(success(version));
};

export const duplicateVersion = async (
  request: FastifyRequest<{ Params: ResumeVersionParams }>,
  reply: FastifyReply,
) => {
  const version = await duplicateResumeVersion(request.user.userId, request.params.id);
  return reply.status(201).send(success(version, 'Resume version duplicated'));
};

export const updateVersionStatus = async (
  request: FastifyRequest<{ Params: ResumeVersionParams; Body: UpdateResumeStatusInput }>,
  reply: FastifyReply,
) => {
  const version = await updateResumeVersionStatus(
    request.user.userId,
    request.params.id,
    request.body.status,
  );
  return reply.send(success(version, 'Status updated'));
};

export const deleteVersion = async (
  request: FastifyRequest<{ Params: ResumeVersionParams }>,
  reply: FastifyReply,
) => {
  await deleteResumeVersion(request.user.userId, request.params.id);
  return reply.status(204).send();
};

export const updateContent = async (
  request: FastifyRequest<{ Params: ResumeVersionParams; Body: UpdateResumeContentInput }>,
  reply: FastifyReply,
) => {
  const version = await updateResumeContent(request.user.userId, request.params.id, request.body.generated_content);
  return reply.send(success(version, 'Resume content updated'));
};

export const exportVersionPdf = async (
  request: FastifyRequest<{ Params: ResumeVersionParams }>,
  reply: FastifyReply,
) => {
  const result = await exportResumeVersionPdf(request.user.userId, request.params.id);
  return reply.send(success(result, 'Resume export ready'));
};

export const saveEditorHtmlHandler = async (
  request: FastifyRequest<{ Params: ResumeVersionParams; Body: SaveEditorHtmlInput }>,
  reply: FastifyReply,
) => {
  const result = await saveEditorHtml(request.user.userId, request.params.id, request.body.html);
  return reply.send(success(result, 'Editor content saved'));
};

export const renderPdfHandler = async (
  request: FastifyRequest<{ Params: ResumeVersionParams; Body: RenderEditorPdfInput }>,
  reply: FastifyReply,
) => {
  const result = await renderAndStorePdf(request.user.userId, request.params.id, request.body.html);
  return reply.send(success(result, 'PDF rendered successfully'));
};

export const getEditorHtmlHandler = async (
  request: FastifyRequest<{ Params: ResumeVersionParams }>,
  reply: FastifyReply,
) => {
  const result = await getEditorHtml(request.user.userId, request.params.id);
  return reply.send(success(result));
};
