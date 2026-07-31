import { Worker } from 'bullmq';
import { env } from '../config/env.js';
import { QUEUE_NAMES, type WeeklyDigestJobData } from './queues.js';
import { sendWeeklyDigest } from '../services/weekly-digest.service.js';

const connection = { url: env.REDIS_URL };

export const weeklyDigestWorker = new Worker<WeeklyDigestJobData>(
  QUEUE_NAMES.WEEKLY_DIGEST,
  async (job) => {
    await sendWeeklyDigest(job.data.userId);
  },
  {
    connection,
    concurrency: 2,
    limiter: { max: 20, duration: 60_000 },
  },
);

weeklyDigestWorker.on('failed', (job, err) => {
  console.error(`[weekly-digest] Job ${job?.id} failed:`, err.message);
});
