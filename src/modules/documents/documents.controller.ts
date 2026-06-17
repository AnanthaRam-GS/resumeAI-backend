import type { FastifyReply, FastifyRequest } from 'fastify';
import { ValidationError } from '../../utils/errors.js';
import { success } from '../../utils/response.js';
import { processDocumentUpload } from './documents.service.js';

export const uploadDocument = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const file = request.uploadedFile;
  if (!file) {
    throw new ValidationError('No file found on request. Use parseUpload middleware.');
  }

  const result = await processDocumentUpload(
    request.user.userId,
    file.buffer,
    file.mimetype,
    file.filename,
  );

  return reply.status(201).send(
    success(result, `Document processed. ${result.extractedItemCount} portfolio items extracted.`),
  );
};
