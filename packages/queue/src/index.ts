import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import type { ProgressEvent } from '@techtester/contracts';

export const SCAN_QUEUE = 'techtester:scans';

export interface ScanJob {
  scanId: string;
}

export function redisConnection(): IORedis {
  return new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
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
export async function publishProgress(publisher: IORedis, event: ProgressEvent): Promise<void> {
  await publisher.publish(progressChannel(event.scanId), JSON.stringify(event));
}
