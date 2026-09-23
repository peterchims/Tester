# TechTester

Paste a public website URL and get a real, evidence-backed report:

- **Responsiveness** — rendered across a 10-point device matrix (320px phone through
  4K desktop), with a full-page screenshot at every size, a responsiveness %, and the
  share of page content that overflows the viewport on small screens.
- **Architecture** — what the site is built on: framework (Next.js, React, Vue,
  Angular, ...), rendering mode (SSR/SSG/CSR/static HTML), CSS framework, hosting/CDN,
  CMS, and third-party libraries, each with the evidence behind the call.
- **Security** — headers, TLS/HTTPS, cookies, mixed content, Subresource Integrity,
  CORS, known-vulnerable libraries, and light public-path probing (`/.git/HEAD`,
  `/.env`, ...) — every finding ships with a severity and a concrete fix.
- **SEO** — indexability (noindex / robots.txt), title & meta description length,
  canonical correctness, heading structure, structured data (JSON-LD) validity,
  Open Graph / Twitter Card completeness, sitemap coverage, and a keyword-structure
  table measured from the page's own rendered text (real occurrence counts and
  density, not a guess) — every signal ships with the evidence behind it. This is
  an on-page structural audit, not a live search-ranking check: TechTester doesn't
  hold credentials to any search engine's ranking API, so it never reports a
  fabricated rank number.

Performance and accessibility auditing are planned next; deeper mobile testing
(WebKit/iOS quirks, network throttling) and a broken-link crawler follow after that.

## Quick start

```bash
cp .env.example .env
npm install
npx playwright install chromium --with-deps   # once, for local (non-Docker) scanning
docker compose up -d postgres redis
npm run migrate
npm run dev   # runs api + worker + web together
```

Web: `http://localhost:3010` · API: `http://localhost:4100`.

Or run the complete stack — Postgres, Redis, the api/worker/web services, and an
nginx reverse proxy in front of them — with:

```bash
docker compose up --build
```

Everything is served through nginx at **`http://localhost`** (port 80). Postgres,
Redis, the API, and the web app itself are not published to the host — only nginx
is internet-facing, and it routes `/v1/*` to the API and everything else to the web
app on a single origin (no CORS involved).

## How a scan works

1. A client submits a URL from the web app. The API validates it, rejects private /
   loopback / credentialed targets, and enqueues a job on Redis (BullMQ).
2. The worker picks up the job, re-validates the target, fetches the raw HTML, then
   loads the page in headless Chromium (Playwright) with full instrumentation
   (network log, console errors, JS globals).
3. The worker renders the page at every viewport in the device matrix, screenshots
   each one, and probes the DOM for horizontal overflow, tiny tap targets, clipped
   text, and small fonts.
4. Architecture is fingerprinted from response headers, the raw and hydrated HTML, and
   sniffed JS globals. Security is audited from headers, TLS behaviour, cookies, and a
   small set of polite, rate-limited path probes. SEO is audited from the rendered
   DOM (title, meta tags, headings, JSON-LD, Open Graph/Twitter Card, links, and a
   keyword-frequency pass over the page's own visible text) plus a fetch of
   `robots.txt` and the sitemap.
5. Findings are scored into per-category and overall percentages and persisted; the
   web app streams progress over SSE and renders the finished report.

## Architecture

```
apps/web       Next.js app — URL intake, live scan progress, the report UI
apps/api       Fastify — REST + SSE, session cookies, rate limiting, enqueues scans
apps/worker    BullMQ consumer — runs the scan pipeline end to end
packages/
  contracts    zod schemas + types shared by every app
  browser      Playwright session manager, device matrix, in-page probes, SSRF guard
  analyzers    responsive / stack / security / seo analyzers + scoring
  database     Postgres schema + Kysely repository
  queue        BullMQ queue + Redis pub/sub progress channel
  storage      screenshot artifact store (local disk; S3-compatible driver later)
```

Scans are keyed to a browser session cookie — there are no accounts yet. Every scan
target is re-validated against the SSRF policy on every redirect hop, and only
non-exploitative, rate-limited checks are ever run against a target.

## Tests

```bash
npm test         # unit tests across every workspace
npm run typecheck
```
