import type { FastifyRequest, FastifyReply } from 'fastify';
import { success } from '../../utils/response.js';
import { getSignedUrl } from '../../services/storage.service.js';
import { generateCoverLetter, getCoverLetter } from './cover-letter.service.js';
import type { GenerateCoverLetterInput } from './cover-letter.schema.js';

export const createCoverLetter = async (
  request: FastifyRequest<{ Params: { resumeId: string }; Body: GenerateCoverLetterInput }>,
  reply: FastifyReply,
): Promise<void> => {
  const { userId } = request.user;
  const { resumeId } = request.params;

  const coverLetter = await generateCoverLetter(userId, resumeId, request.body);

  const pdfSignedUrl = coverLetter.pdf_s3_key
    ? await getSignedUrl(coverLetter.pdf_s3_key)
    : null;

  reply.status(201).send(success({ ...coverLetter, pdfSignedUrl }));
};

export const fetchCoverLetter = async (
  request: FastifyRequest<{ Params: { resumeId: string } }>,
  reply: FastifyReply,
): Promise<void> => {
  const { userId } = request.user;
  const { resumeId } = request.params;

  const coverLetter = await getCoverLetter(userId, resumeId);

  const pdfSignedUrl = coverLetter.pdf_s3_key
    ? await getSignedUrl(coverLetter.pdf_s3_key)
    : null;

  reply.send(success({ ...coverLetter, pdfSignedUrl }));
};
