import { Queue } from 'bullmq';
import { env } from '../config/env.js';
import type { GithubDiscoveryJobData, GithubEnrichmentJobData } from '../types/github.types.js';

export const QUEUE_NAMES = {
  GITHUB_DISCOVERY: 'github-discovery',
  GITHUB_ENRICHMENT: 'github-enrichment',
  DOCUMENT_PARSE: 'document-parse',
  LINKEDIN_IMPORT_PARSE: 'linkedin-import-parse',
  RESUME_GENERATION: 'resume-generation',
  COVER_LETTER_GENERATION: 'cover-letter-generation',
  EMBEDDING: 'embedding',
  GAP_ANALYSIS: 'gap-analysis',
  WEEKLY_DIGEST: 'weekly-digest',
} as const;

const connection = { url: env.REDIS_URL };

const createQueue = <T>(name: string): Queue<T> => {
  if (env.NODE_ENV === 'test' || !env.WORKERS_ENABLED) {
    const fakeQueue = {
      add: async (_name: string, _data: unknown, opts?: { jobId?: string }) => ({
        id: opts?.jobId ?? _name,
      }),
      close: async () => undefined,
    };
    return fakeQueue as unknown as Queue<T>;
  }

  return new Queue<T>(name, { connection });
};

export interface EmbeddingJobData {
  userId: string;
  entityType: 'portfolio_item' | 'job_target';
  entityId: string;
  contentHash?: string;
}

export interface ResumeGenerationJobData {
  userId: string;
  generationJobId: string;
  input: {
    jobTitle: string;
    companyName: string;
    jobDescription: string;
    templateId?: string;
    pageLength?: string;
    outputLanguage?: string;
    jobTargetId?: string;
  };
}

export interface CoverLetterGenerationJobData {
  userId: string;
  resumeVersionId: string;
  outputLanguage?: string;
}

export interface DocumentParseJobData {
  userId: string;
  docId: string;
}

export interface LinkedInImportParseJobData {
  userId: string;
  batchId: string;
}

export interface GapAnalysisJobData {
  userId: string;
  analysisId?: string;
}

export interface WeeklyDigestJobData {
  userId: string;
  weekStart: string;
}

export const discoveryQueue = createQueue<GithubDiscoveryJobData>(QUEUE_NAMES.GITHUB_DISCOVERY);

export const enrichmentQueue = createQueue<GithubEnrichmentJobData>(QUEUE_NAMES.GITHUB_ENRICHMENT);

export const documentParseQueue = createQueue<DocumentParseJobData>(QUEUE_NAMES.DOCUMENT_PARSE);

export const linkedInImportParseQueue = createQueue<LinkedInImportParseJobData>(QUEUE_NAMES.LINKEDIN_IMPORT_PARSE);

export const resumeGenerationQueue = createQueue<ResumeGenerationJobData>(QUEUE_NAMES.RESUME_GENERATION);

export const coverLetterGenerationQueue = createQueue<CoverLetterGenerationJobData>(QUEUE_NAMES.COVER_LETTER_GENERATION);

export const embeddingQueue = createQueue<EmbeddingJobData>(QUEUE_NAMES.EMBEDDING);

export const gapAnalysisQueue = createQueue<GapAnalysisJobData>(QUEUE_NAMES.GAP_ANALYSIS);

export const weeklyDigestQueue = createQueue<WeeklyDigestJobData>(QUEUE_NAMES.WEEKLY_DIGEST);

export const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: { age: 86400 },
  removeOnFail: { age: 604800 },
};

export const closeQueues = async (): Promise<void> => {
  await Promise.all([
    discoveryQueue.close(),
    enrichmentQueue.close(),
    documentParseQueue.close(),
    linkedInImportParseQueue.close(),
    resumeGenerationQueue.close(),
    coverLetterGenerationQueue.close(),
    embeddingQueue.close(),
    gapAnalysisQueue.close(),
    weeklyDigestQueue.close(),
  ]);
};
