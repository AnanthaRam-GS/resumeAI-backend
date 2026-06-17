import type { FastifyReply, FastifyRequest } from 'fastify';
import { success } from '../../utils/response.js';
import { generateCoverLetter, getCoverLetter } from './cover-letter.service.js';
import type { GenerateCoverLetterInput, CoverLetterResumeParams } from './cover-letter.schema.js';

export const createCoverLetter = async (
  request: FastifyRequest<{ Params: CoverLetterResumeParams; Body: GenerateCoverLetterInput }>,
  reply: FastifyReply,
) => {
  const coverLetter = await generateCoverLetter(
    request.user.userId,
    request.params.resumeId,
    request.body,
  );
  return reply.status(201).send(success(coverLetter, 'Cover letter generated'));
};

export const fetchCoverLetter = async (
  request: FastifyRequest<{ Params: CoverLetterResumeParams }>,
  reply: FastifyReply,
) => {
  const coverLetter = await getCoverLetter(request.user.userId, request.params.resumeId);
  return reply.send(success(coverLetter));
};
