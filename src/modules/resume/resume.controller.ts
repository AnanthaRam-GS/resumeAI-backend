import type { FastifyRequest, FastifyReply } from 'fastify';
import { success } from '../../utils/response.js';
import { getSignedUrl } from '../../services/storage.service.js';
import { runOrchestration } from './orchestrator.service.js';
import {
  createJobTarget,
  createGenerationJob,
  getGenerationJob,
  listResumeVersions,
  getResumeVersion,
  updateResumeVersionStatus,
  deleteResumeVersion,
} from './resume.service.js';
import type {
  GenerateResumeInput,
  UpdateVersionStatusInput,
} from './resume.schema.js';

export const generateResume = async (
  request: FastifyRequest<{ Body: GenerateResumeInput }>,
  reply: FastifyReply,
): Promise<void> => {
  const userId = request.user.userId;
  const { jobTitle, companyName, jobDescription, templateId, pageLength } = request.body;

  const jobTarget = await createJobTarget(userId, { jobTitle, companyName, jobDescription });
  const generationJob = await createGenerationJob(userId, jobTarget.id);

  // Fire-and-forget: orchestration runs in the background while client polls
  void runOrchestration({
    userId,
    jobId: generationJob.id,
    jobTargetId: jobTarget.id,
    jobTitle,
    companyName,
    jobDescription,
    templateId,
    pageLength,
  });

  reply.status(202).send(
    success(
      { jobId: generationJob.id },
      'Resume generation started. Poll /resume/generate/status/:jobId for progress.',
    ),
  );
};

export const getGenerationStatus = async (
  request: FastifyRequest<{ Params: { jobId: string } }>,
  reply: FastifyReply,
): Promise<void> => {
  const { userId } = request.user;
  const { jobId } = request.params;

  const job = await getGenerationJob(userId, jobId);

  reply.send(
    success({
      jobId: job.id,
      status: job.status,
      currentStage: job.current_stage,
      progressPercent: job.progress_percent,
      errorMessage: job.error_message,
      startedAt: job.started_at,
      completedAt: job.completed_at,
    }),
  );
};

export const listVersions = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const versions = await listResumeVersions(request.user.userId);
  reply.send(success(versions));
};

export const getVersion = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> => {
  const { userId } = request.user;
  const version = await getResumeVersion(userId, request.params.id);

  const pdfSignedUrl = version.pdf_s3_key
    ? await getSignedUrl(version.pdf_s3_key)
    : null;

  reply.send(success({ ...version, pdfSignedUrl }));
};

export const updateVersionStatus = async (
  request: FastifyRequest<{ Params: { id: string }; Body: UpdateVersionStatusInput }>,
  reply: FastifyReply,
): Promise<void> => {
  const { userId } = request.user;
  const version = await updateResumeVersionStatus(userId, request.params.id, request.body.status);
  reply.send(success(version));
};

export const removeVersion = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> => {
  const { userId } = request.user;
  await deleteResumeVersion(userId, request.params.id);
  reply.send(success({ deleted: true }));
};
