import cron from 'node-cron';
import { pool } from '../db/client.js';
import { env } from '../config/env.js';
import { closeQueues, defaultJobOptions, discoveryQueue } from './queues.js';
import { githubDiscoveryWorker } from './github-discovery.worker.js';
import { githubEnrichmentWorker } from './github-enrichment.worker.js';
import { embeddingWorker } from './embedding.worker.js';
import { weeklyDigestWorker } from './weekly-digest.worker.js';

export { githubDiscoveryWorker, githubEnrichmentWorker, embeddingWorker, weeklyDigestWorker };

// ─── Periodic Sync Scheduler ───────────────────────────────────────────────────
// Runs daily at 03:00 UTC — finds users due for a sync and enqueues their jobs staggered

export const startPeriodicSyncScheduler = (): void => {
  if (!env.WORKERS_ENABLED) {
    process.stdout.write('[periodic-sync] Workers disabled; scheduler not registered\n');
    return;
  }

  cron.schedule('0 3 * * *', async () => {
    process.stdout.write('[periodic-sync] Starting daily sync scheduler run\n');

    try {
      const result = await pool.query<{ user_id: string }>(
        `SELECT gp.user_id
         FROM github_profiles gp
         JOIN users u ON u.id = gp.user_id
         WHERE gp.next_scheduled_sync <= NOW()
           AND u.github_sync_status != 'syncing'
         ORDER BY gp.next_scheduled_sync ASC
         LIMIT 50`,
      );

      const users = result.rows;
      process.stdout.write(`[periodic-sync] Enqueueing sync for ${users.length} users\n`);

      for (let i = 0; i < users.length; i++) {
        const row = users[i];
        if (!row) continue;
        const { user_id } = row;

        await discoveryQueue.add(
          `periodic-${user_id}`,
          { userId: user_id, triggeredBy: 'periodic' },
          {
            delay: i * 30_000,
            ...defaultJobOptions,
            jobId: `discovery-${user_id}`,
          },
        );
      }
    } catch (error) {
      process.stderr.write(`[periodic-sync] Scheduler error: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }, { timezone: 'UTC' });

  process.stdout.write('[periodic-sync] Scheduler registered for 03:00 UTC daily\n');
};

// ─── Graceful Shutdown ─────────────────────────────────────────────────────────

export const shutdownWorkers = async (): Promise<void> => {
  await Promise.all([
    githubDiscoveryWorker.close(),
    githubEnrichmentWorker.close(),
    embeddingWorker.close(),
    weeklyDigestWorker.close(),
  ]);
  await closeQueues();
  process.stdout.write('[workers] All workers shut down gracefully\n');
};
