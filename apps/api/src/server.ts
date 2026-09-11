import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { nanoid } from 'nanoid';
import { assertSafeTarget } from '@techtester/browser';
import { createScanSchema, scanOptionsSchema } from '@techtester/contracts';
import { closeDb, migrate, scans } from '@techtester/database';
import { redisConnection, scanQueue, progressChannel } from '@techtester/queue';
import { getArtifactStore, screenshotKey } from '@techtester/storage';
import { toReport, toSummary } from './summary.js';

const SESSION_COOKIE = 'tt_session';
const app = Fastify({ logger: true, bodyLimit: 16_000 });

await app.register(cors, {
  origin: process.env.CORS_ORIGIN?.split(',') ?? true,
  credentials: true,
});
await app.register(cookie);
await app.register(rateLimit, {
  max: Number(process.env.RATE_LIMIT_MAX ?? 60),
  timeWindow: '1 minute',
});

await migrate();

function sessionId(request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply): string {
  const existing = request.cookies[SESSION_COOKIE];
  if (existing) return existing;
  const id = nanoid(21);
  reply.setCookie(SESSION_COOKIE, id, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30,
  });
  return id;
}

app.get('/health', async () => ({ status: 'ok', service: 'techtester-api', time: new Date().toISOString() }));

// --- Create a scan ---------------------------------------------------------
app.post('/v1/scans', {
  config: { rateLimit: { max: Number(process.env.SCAN_RATE_LIMIT_MAX ?? 10), timeWindow: '1 minute' } },
}, async (request, reply) => {
  const parsed = createScanSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() });
  }

  try {
    await assertSafeTarget(parsed.data.url);
  } catch (error) {
    return reply.code(400).send({ error: 'UNSAFE_TARGET', message: (error as Error).message });
  }

  const session = sessionId(request, reply);
  const options = scanOptionsSchema.parse(parsed.data.options);
  const scan = await scans.create({
    id: nanoid(16),
    url: parsed.data.url,
    normalizedUrl: new URL(parsed.data.url).toString(),
    sessionId: session,
    options,
  });

  await scanQueue().add('scan', { scanId: scan.id }, { removeOnComplete: 100, removeOnFail: 50 });
  return reply.code(202).send({ data: toSummary(scan) });
});

// --- Scan status ---------------------------------------------------------
app.get('/v1/scans/:id', async (request, reply) => {
  const scan = await scans.get((request.params as { id: string }).id);
  if (!scan) return reply.code(404).send({ error: 'SCAN_NOT_FOUND' });
  return { data: toSummary(scan) };
});

// --- Full report -------------------------------------------------------
app.get('/v1/scans/:id/report', async (request, reply) => {
  const scan = await scans.get((request.params as { id: string }).id);
  if (!scan) return reply.code(404).send({ error: 'SCAN_NOT_FOUND' });
  return { data: toReport(scan) };
});

// --- Session history --------------------------------------------------
app.get('/v1/scans', async (request, reply) => {
  const session = sessionId(request, reply);
  const rows = await scans.listBySession(session);
  return { data: rows.map(toSummary) };
});

// --- Screenshot proxy ------------------------------------------------
app.get('/v1/scans/:id/screenshots/:label', async (request, reply) => {
  const { id, label } = request.params as { id: string; label: string };
  const key = screenshotKey(id, label);
  const store = getArtifactStore();
  if (!store.exists(key)) return reply.code(404).send({ error: 'SCREENSHOT_NOT_FOUND' });
  reply.header('content-type', 'image/png');
  reply.header('cache-control', 'public, max-age=86400');
  return reply.send(store.getStream(key));
});

// --- SSE progress stream -------------------------------------------
app.get('/v1/scans/:id/events', async (request, reply) => {
  const { id } = request.params as { id: string };
  const scan = await scans.get(id);
  if (!scan) return reply.code(404).send({ error: 'SCAN_NOT_FOUND' });

  reply.raw.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });

  const send = (data: unknown) => reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  send({ scanId: id, stage: scan.stage, status: scan.status, progress: scan.progress, message: 'connected', at: new Date().toISOString() });

  if (scan.status === 'completed' || scan.status === 'failed') {
    send({ scanId: id, stage: scan.stage, status: scan.status, progress: 100, message: 'done', at: new Date().toISOString() });
    reply.raw.end();
    return;
  }

  const subscriber = redisConnection();
  await subscriber.subscribe(progressChannel(id));
  subscriber.on('message', (_channel, payload) => {
    reply.raw.write(`data: ${payload}\n\n`);
    try {
      const event = JSON.parse(payload) as { status: string };
      if (event.status === 'completed' || event.status === 'failed') {
        subscriber.disconnect();
        reply.raw.end();
      }
    } catch {
      /* ignore */
    }
  });

  const heartbeat = setInterval(() => reply.raw.write(': ping\n\n'), 15_000);
  request.raw.on('close', () => {
    clearInterval(heartbeat);
    subscriber.disconnect();
  });
});

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  reply.code(500).send({ error: 'INTERNAL_ERROR' });
});

const port = Number(process.env.API_PORT ?? 4100);
await app.listen({ port, host: '0.0.0.0' });

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, async () => {
    await app.close();
    await closeDb();
    process.exit(0);
  });
}
