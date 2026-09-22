import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { nanoid } from 'nanoid';
import { assertSafeTarget } from '@techtester/browser';
import { createScanSchema, scanOptionsSchema } from '@techtester/contracts';
import { closeDb, migrate, scans } from '@techtester/database';
import { redisConnection, scanQueue, progressChannel, SCAN_JOB_OPTIONS } from '@techtester/queue';
import { getArtifactStore, screenshotKey } from '@techtester/storage';
import { toReport, toSummary } from './summary.js';

const SESSION_COOKIE = 'tt_session';
const ALLOWED_ORIGINS = process.env.CORS_ORIGIN?.split(',');
const app = Fastify({ logger: true, bodyLimit: 16_000 });

/** Single source of truth for "is this origin allowed", shared by the cors plugin and the hand-streamed SSE route below. */
function isOriginAllowed(origin: string | undefined): boolean {
  if (!ALLOWED_ORIGINS) return true;
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin);
}

await app.register(cors, {
  origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
  credentials: true,
});

/**
 * The SSE route below writes straight to the raw response (so it can stream),
 * which skips Fastify's onSend hook — the one @fastify/cors uses to attach its
 * headers. Mirror that plugin's decision manually before writeHead, using the
 * same isOriginAllowed() the plugin itself is configured with.
 */
function corsHeadersFor(request: import('fastify').FastifyRequest): Record<string, string> {
  const origin = request.headers.origin;
  if (!origin || !isOriginAllowed(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    vary: 'Origin',
  };
}
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
    const details = parsed.error.flatten();
    const message = details.fieldErrors.url?.[0] ?? details.formErrors[0] ?? 'The request was invalid.';
    return reply.code(400).send({ error: 'VALIDATION_ERROR', message, details });
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

  await scanQueue().add('scan', { scanId: scan.id }, SCAN_JOB_OPTIONS);
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

  // Writing straight to reply.raw bypasses Fastify's normal reply lifecycle —
  // hijack() tells Fastify not to also try to send its own reply once this
  // handler's promise resolves (which, without it, races the stream: Fastify
  // finalizes the "empty" reply while the raw response is still open).
  reply.hijack();
  reply.raw.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    ...corsHeadersFor(request),
  });

  let ended = false;
  const subscriber = redisConnection();
  const send = (data: unknown) => {
    if (!ended) reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  const finish = () => {
    if (ended) return;
    ended = true;
    clearInterval(heartbeat);
    subscriber.disconnect();
    reply.raw.end();
  };

  send({ scanId: id, stage: scan.stage, status: scan.status, progress: scan.progress, message: 'connected', at: new Date().toISOString() });

  await subscriber.subscribe(progressChannel(id));
  subscriber.on('message', (_channel, payload) => {
    if (ended) return;
    reply.raw.write(`data: ${payload}\n\n`);
    try {
      const event = JSON.parse(payload) as { status: string };
      if (event.status === 'completed' || event.status === 'failed') finish();
    } catch {
      /* ignore malformed frame */
    }
  });

  const heartbeat = setInterval(() => {
    if (!ended) reply.raw.write(': ping\n\n');
  }, 15_000);

  // Re-check the scan's status now that the subscription is live. This closes
  // the gap between the initial `scans.get()` above and `subscribe()` below —
  // if the scan finished in that window, the publish could otherwise be
  // missed entirely (pub/sub doesn't replay past messages).
  const latest = await scans.get(id);
  if (latest && (latest.status === 'completed' || latest.status === 'failed')) {
    send({ scanId: id, stage: latest.stage, status: latest.status, progress: 100, message: 'done', at: new Date().toISOString() });
    finish();
    return;
  }

  request.raw.on('close', finish);
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
