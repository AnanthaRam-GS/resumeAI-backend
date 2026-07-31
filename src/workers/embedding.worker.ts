import { Worker } from 'bullmq';
import { env } from '../config/env.js';
import { QUEUE_NAMES, type EmbeddingJobData } from './queues.js';
import { embedJobTarget, embedPortfolioItem } from '../services/embedding.service.js';
import { emitProgress } from '../services/progress.service.js';

const connection = { url: env.REDIS_URL };

export const embeddingWorker = new Worker<EmbeddingJobData>(
  QUEUE_NAMES.EMBEDDING,
  async (job) => {
    const { userId, entityType, entityId } = job.data;
    const operationId = `embedding-${entityType}-${entityId}`;
    emitProgress(userId, {
      operationId,
      pipelineType: 'embedding',
      stage: 'embedding',
      status: 'running',
      progress: 20,
      message: 'Generating semantic embedding',
    });

    const status = entityType === 'portfolio_item'
      ? await embedPortfolioItem(userId, entityId)
      : await embedJobTarget(userId, entityId);

    emitProgress(userId, {
      operationId,
      pipelineType: 'embedding',
      stage: 'embedding',
      status: status === 'failed' ? 'failed' : 'completed',
      progress: 100,
      message: status === 'failed' ? 'Embedding failed' : 'Embedding updated',
      payload: { entityType, entityId, status },
    });
  },
  {
    connection,
    concurrency: 4,
    limiter: { max: 30, duration: 60_000 },
  },
);

embeddingWorker.on('failed', (job, err) => {
  console.error(`[embedding] Job ${job?.id} failed:`, err.message);
});
