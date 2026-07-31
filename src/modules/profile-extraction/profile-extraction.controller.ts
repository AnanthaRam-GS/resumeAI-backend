import type { FastifyReply, FastifyRequest } from 'fastify';
import { ValidationError } from '../../utils/errors.js';
import { success } from '../../utils/response.js';
import { extractProfile } from './profile-extraction.service.js';

export const extractProfileFromResume = async (request: FastifyRequest, reply: FastifyReply) => {
  const file = request.uploadedFile;
  if (!file) {
    throw new ValidationError('No file found on request. Use the resume upload field.');
  }

  const profile = await extractProfile(file.buffer, file.mimetype, file.filename);

  return reply.send(success(profile));
};
