import type { FastifyReply, FastifyRequest } from 'fastify';
import { success } from '../../utils/response.js';
import { ValidationError } from '../../utils/errors.js';
import {
  applyLinkedInImport,
  discardLinkedInImport,
  getLinkedInImportBatch,
  uploadLinkedInImport,
} from './linkedin-import.service.js';
import type {
  ApplyLinkedInImportInput,
  LinkedInBatchParams,
} from './linkedin-import.schema.js';

export const uploadLinkedInImportHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const file = request.uploadedFile;
  if (!file) throw new ValidationError('No file uploaded');
  const result = await uploadLinkedInImport(request.user.userId, file.buffer, file.filename);
  return reply.status(201).send(success(result, 'LinkedIn import preview ready'));
};

export const getLinkedInImportHandler = async (
  request: FastifyRequest<{ Params: LinkedInBatchParams }>,
  reply: FastifyReply,
) => {
  const result = await getLinkedInImportBatch(request.user.userId, request.params.id);
  return reply.send(success(result));
};

export const applyLinkedInImportHandler = async (
  request: FastifyRequest<{ Params: LinkedInBatchParams; Body: ApplyLinkedInImportInput }>,
  reply: FastifyReply,
) => {
  const result = await applyLinkedInImport(request.user.userId, request.params.id, request.body);
  return reply.send(success(result, 'LinkedIn import applied'));
};

export const discardLinkedInImportHandler = async (
  request: FastifyRequest<{ Params: LinkedInBatchParams }>,
  reply: FastifyReply,
) => {
  await discardLinkedInImport(request.user.userId, request.params.id);
  return reply.status(204).send();
};

