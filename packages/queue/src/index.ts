import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { ProgressEvent } from '@techtester/contracts';

export const SCAN_QUEUE = 'techtester-scans';

export interface ScanJob {
  scanId: string;
}

/** Options for enqueuing a scan job — kept next to the queue name so the producer (API) and consumer (worker) can't drift apart. */
export const SCAN_JOB_OPTIONS = { removeOnComplete: 100, removeOnFail: 50 } as const;

/**
 * Worker-side job options. `lockDuration` is renewed automatically while the
 * worker process is alive, so this is a ceiling, not a real per-scan budget —
 * but it should stay comfortably above the browser package's own worst-case
 * timeout budget (see `packages/browser`'s render timeouts) rather than being
 * tuned independently of it.
 */
export const SCAN_WORKER_OPTIONS = { lockDuration: 180_000 } as const;

export function redisConnection(): Redis {
  return new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
}

let queue: Queue<ScanJob> | null = null;

export function scanQueue(): Queue<ScanJob> {
  if (!queue) {
    queue = new Queue<ScanJob>(SCAN_QUEUE, { connection: redisConnection() });
  }
  return queue;
}

export const progressChannel = (scanId: string): string => `techtester:progress:${scanId}`;

/** Publish a progress event to the scan's pub/sub channel (consumed by the API for SSE). */
export async function publishProgress(publisher: Redis, event: ProgressEvent): Promise<void> {
  await publisher.publish(progressChannel(event.scanId), JSON.stringify(event));
}
