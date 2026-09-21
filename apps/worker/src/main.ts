import { Worker } from 'bullmq';
import { migrate, scans, closeDb } from '@techtester/database';
import { SCAN_QUEUE, SCAN_WORKER_OPTIONS, publishProgress, redisConnection, type ScanJob } from '@techtester/queue';
import { runScan } from './pipeline.js';

const CONCURRENCY = Number(process.env.SCAN_CONCURRENCY ?? 2);

async function main(): Promise<void> {
  await migrate();
  console.log('[worker] schema ready');

  const connection = redisConnection();
  const publisher = redisConnection();

  const worker = new Worker<ScanJob>(
    SCAN_QUEUE,
    async (job) => {
      const scan = await scans.get(job.data.scanId);
      if (!scan) throw new Error(`scan ${job.data.scanId} not found`);
      console.log(`[worker] running scan ${scan.id} for ${scan.normalized_url}`);
      try {
        await runScan(scan, publisher);
      } catch (error) {
        const message = (error as Error).message ?? 'Scan failed';
        await scans.fail(scan.id, message);
        await publishProgress(publisher, {
          scanId: scan.id,
          stage: 'error',
          status: 'failed',
          message,
          progress: 100,
          at: new Date().toISOString(),
        }).catch(() => undefined);
        throw error;
      }
    },
    { connection, concurrency: CONCURRENCY, ...SCAN_WORKER_OPTIONS },
  );

  worker.on('completed', (job) => console.log(`[worker] completed ${job.id}`));
  worker.on('failed', (job, error) => console.error(`[worker] failed ${job?.id}:`, error.message));

  console.log(`[worker] listening on "${SCAN_QUEUE}" (concurrency ${CONCURRENCY})`);

  const shutdown = async () => {
    console.log('[worker] shutting down');
    await worker.close();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error) => {
  console.error('[worker] fatal', error);
  process.exit(1);
});
