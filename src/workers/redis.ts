import { Redis } from 'ioredis';
import { env } from '../config/env.js';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

redis.on('error', (err: Error) => {
  process.stderr.write(`[Redis] Connection error: ${err.message}\n`);
});

redis.on('connect', () => {
  process.stdout.write('[Redis] Connected\n');
});
