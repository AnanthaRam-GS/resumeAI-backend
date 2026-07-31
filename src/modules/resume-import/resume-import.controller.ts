import type { FastifyReply, FastifyRequest } from 'fastify';
import { ValidationError } from '../../utils/errors.js';
import { success } from '../../utils/response.js';
import {
  uploadResumeInitial,
  parseAndUpdateDocument,
  getDocumentStatus,
  retryParsing,
  applyParsedResume,
  listResumeDocuments,
  getResumeDocument,
  deleteResumeDocument,
} from './resume-import.service.js';
import type { ApplyResumeInput, ResumeDocumentParams } from './resume-import.schema.js';

export const uploadResume = async (request: FastifyRequest, reply: FastifyReply) => {
  const file = request.uploadedFile;
  if (!file) throw new ValidationError('No file found on request');

  const source =
    (request.query as { source?: string } | undefined)?.source === 'onboarding'
      ? ('onboarding' as const)
      : ('portfolio' as const);

  const uploadResult = await uploadResumeInitial(
    request.user.userId,
    file.buffer,
    file.mimetype,
    file.filename,
    source,
  );

  if (uploadResult.status === 'processing') {
    // Fire background parsing — do not await; response is already composed.
    parseAndUpdateDocument(uploadResult.docId, file.buffer, file.mimetype, file.filename).catch(
      (err: unknown) => {
        request.log.error({ err, docId: uploadResult.docId }, 'Background resume parse failed');
      },
    );
  }

  const payload = {
    docId: uploadResult.docId,
    filename: uploadResult.filename,
    status: uploadResult.status,
    parserVersion: uploadResult.parserVersion,
    ...(uploadResult.cached !== undefined ? { cached: uploadResult.cached } : {}),
    ...(uploadResult.parsedData ? { parsedData: uploadResult.parsedData } : {}),
    ...(uploadResult.warnings ? { warnings: uploadResult.warnings } : {}),
    ...(uploadResult.confidence ? { confidence: uploadResult.confidence } : {}),
    ...(uploadResult.nearDuplicateWarning ? { nearDuplicateWarning: uploadResult.nearDuplicateWarning } : {}),
  };

  return reply
    .status(uploadResult.status === 'completed' ? 200 : 202)
    .send(success(payload, uploadResult.status === 'completed' ? 'Resume parse reused.' : 'Resume uploaded. Parsing in progress.'));
};

export const getStatus = async (
  request: FastifyRequest<{ Params: ResumeDocumentParams }>,
  reply: FastifyReply,
) => {
  const status = await getDocumentStatus(request.user.userId, request.params.id);
  return reply.send(success(status));
};

export const retryParseResume = async (
  request: FastifyRequest<{ Params: ResumeDocumentParams }>,
  reply: FastifyReply,
) => {
  const { docId } = await retryParsing(request.user.userId, request.params.id);

  await getResumeDocument(request.user.userId, docId);
  parseAndUpdateDocument(docId).catch((err: unknown) => {
    request.log.error({ err, docId }, 'Retry background resume parse failed');
  });

  return reply.send(success({ docId, status: 'processing' as const }, 'Re-parsing started.'));
};

export const applyResume = async (
  request: FastifyRequest<{ Params: ResumeDocumentParams; Body: ApplyResumeInput }>,
  reply: FastifyReply,
) => {
  const result = await applyParsedResume(request.user.userId, request.params.id, request.body);
  const appliedTotal =
    result.applied.profileFields +
    result.applied.education +
    result.applied.experience +
    result.applied.projects +
    result.applied.researchPapers +
    result.applied.skills +
    result.applied.certifications;
  const message =
    result.skipped.duplicates > 0
      ? `Imported ${appliedTotal} item${appliedTotal === 1 ? '' : 's'}. Skipped ${result.skipped.duplicates} duplicate${result.skipped.duplicates === 1 ? '' : 's'}.`
      : `Imported ${appliedTotal} item${appliedTotal === 1 ? '' : 's'}.`;
  return reply.send(success(result, message));
};

export const listResumes = async (request: FastifyRequest, reply: FastifyReply) => {
  const docs = await listResumeDocuments(request.user.userId);
  return reply.send(success(docs));
};

export const deleteResume = async (
  request: FastifyRequest<{ Params: ResumeDocumentParams }>,
  reply: FastifyReply,
) => {
  const result = await deleteResumeDocument(request.user.userId, request.params.id);
  return reply.send(success(result, 'Resume upload deleted.'));
};
