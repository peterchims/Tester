import { nanoid } from 'nanoid';
import { safeFetch } from '@techtester/browser';
import type { Finding, SecurityHeaderCheck, SecuritySummary, Severity, TlsSummary } from '@techtester/contracts';
import type { AnalyzerContext } from './context.js';

export interface SecurityAnalysis {
  summary: SecuritySummary;
  findings: Finding[];
}

const DOC = 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers';

export async function analyzeSecurity(ctx: AnalyzerContext): Promise<SecurityAnalysis> {
  const res = ctx.raw.response;
  const h = (name: string) => res.headers.get(name);
  const findings: Finding[] = [];
  const isHttps = ctx.target.protocol === 'https:';

  // --- Header checks ---------------------------------------------------
  const headers: SecurityHeaderCheck[] = [];

  // CSP
  const csp = h('content-security-policy');
  if (!csp) {
    headers.push({ name: 'Content-Security-Policy', status: 'missing', value: null, note: 'No CSP — the page has no defence-in-depth against XSS and content injection.' });
    findings.push(sec('high', 'Missing Content-Security-Policy', 'The response has no Content-Security-Policy header, so the browser will execute any injected script or load any resource.', 'Define a CSP that allowlists the origins your app actually needs, then tighten it. Start in report-only mode.', "Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'", { header: 'absent' }));
  } else {
    const weak = /unsafe-inline|unsafe-eval|\*(?!\.)/.test(csp);
    headers.push({ name: 'Content-Security-Policy', status: weak ? 'misconfigured' : 'present', value: truncate(csp), note: weak ? "Policy contains 'unsafe-inline', 'unsafe-eval', or a wildcard source, which defeats much of its protection." : 'Present.' });
    if (weak) findings.push(sec('medium', "Content-Security-Policy weakened by 'unsafe-inline' / wildcard", `The CSP is present but includes permissive sources: ${truncate(csp)}`, "Remove 'unsafe-inline'/'unsafe-eval'; use nonces or hashes for the scripts and styles you control.", "script-src 'self' 'nonce-<per-request-nonce>'", { policy: truncate(csp) }));
  }

  // HSTS
  const hsts = h('strict-transport-security');
  if (isHttps && !hsts) {
    headers.push({ name: 'Strict-Transport-Security', status: 'missing', value: null, note: 'No HSTS — the first request can be downgraded to HTTP by an attacker.' });
    findings.push(sec('medium', 'Missing HTTP Strict-Transport-Security', 'HTTPS is served but there is no HSTS header, so browsers will still attempt plain HTTP for this host.', 'Send HSTS with a long max-age once you are confident every subdomain is HTTPS-only. Consider preload.', 'Strict-Transport-Security: max-age=31536000; includeSubDomains; preload', { header: 'absent' }));
  } else if (hsts) {
    const maxAge = Number(hsts.match(/max-age=(\d+)/i)?.[1] ?? 0);
    const weak = maxAge < 15_552_000;
    headers.push({ name: 'Strict-Transport-Security', status: weak ? 'misconfigured' : 'present', value: hsts, note: weak ? 'max-age is below the recommended 6 months.' : 'Present.' });
    if (weak) findings.push(sec('low', 'HSTS max-age is short', `max-age=${maxAge} is below the recommended 15552000 (6 months).`, 'Raise max-age to at least 6 months, ideally one year.', 'Strict-Transport-Security: max-age=31536000; includeSubDomains'));
  }

  // X-Content-Type-Options
  checkExact(headers, findings, h('x-content-type-options'), 'X-Content-Type-Options', 'nosniff', 'low', 'MIME-sniffing protection is off.', 'X-Content-Type-Options: nosniff');

  // X-Frame-Options / frame-ancestors
  const xfo = h('x-frame-options');
  const frameAncestors = csp ? /frame-ancestors/i.test(csp) : false;
  if (!xfo && !frameAncestors) {
    headers.push({ name: 'X-Frame-Options', status: 'missing', value: null, note: 'No clickjacking protection (no X-Frame-Options and no CSP frame-ancestors).' });
    findings.push(sec('medium', 'No clickjacking protection', 'Neither X-Frame-Options nor a CSP frame-ancestors directive is set, so the site can be framed by any origin.', 'Set X-Frame-Options: DENY (or SAMEORIGIN) and a matching CSP frame-ancestors.', "X-Frame-Options: DENY\nContent-Security-Policy: frame-ancestors 'none'", { header: 'absent' }));
  } else {
    headers.push({ name: 'X-Frame-Options', status: 'present', value: xfo ?? 'via CSP frame-ancestors', note: 'Clickjacking protection present.' });
  }

  // Referrer-Policy
  if (!h('referrer-policy')) {
    headers.push({ name: 'Referrer-Policy', status: 'missing', value: null, note: 'Full URLs may leak to third parties via the Referer header.' });
    findings.push(sec('low', 'No Referrer-Policy', 'Without a Referrer-Policy the browser may send the full URL (including path and query) to other origins.', 'Set a conservative Referrer-Policy.', 'Referrer-Policy: strict-origin-when-cross-origin'));
  } else {
    headers.push({ name: 'Referrer-Policy', status: 'present', value: h('referrer-policy'), note: 'Present.' });
  }

  // Permissions-Policy
  headers.push(
    h('permissions-policy')
      ? { name: 'Permissions-Policy', status: 'present', value: truncate(h('permissions-policy')!), note: 'Present.' }
      : { name: 'Permissions-Policy', status: 'missing', value: null, note: 'Browser features (camera, geolocation, etc.) are not restricted.' },
  );

  // --- Version disclosure -------------------------------------------
  const server = h('server');
  const poweredBy = h('x-powered-by');
  if (server && /\d/.test(server)) {
    findings.push(sec('low', 'Server version disclosed in headers', `Server: ${server}`, 'Strip version numbers from the Server header to make targeted attacks harder.', 'server_tokens off;  # nginx\nServerTokens Prod   # apache', { server }));
  }
  if (poweredBy) {
    findings.push(sec('low', 'X-Powered-By header discloses the backend', `X-Powered-By: ${poweredBy}`, 'Remove the X-Powered-By header.', "app.disable('x-poweredby')  // express\nheader_remove('X-Powered-By'); // php", { poweredBy }));
  }

  // --- TLS / transport --------------------------------------------
  const redirectsHttpToHttps = await checkHttpRedirect(ctx.target);
  const mixed = isHttps
    ? ctx.capture.network.filter((n) => n.url.startsWith('http://') && !n.url.startsWith('http://localhost')).map((n) => n.url)
    : [];
  const tls: TlsSummary = {
    https: isHttps,
    redirectsHttpToHttps,
    hsts: Boolean(hsts),
    mixedContentCount: mixed.length,
  };

  if (!isHttps) {
    findings.push(sec('high', 'Site is served over plain HTTP', 'The scanned URL is http://, so all traffic is unencrypted and tamperable.', 'Obtain a TLS certificate (Let\'s Encrypt is free) and redirect all HTTP traffic to HTTPS.', 'server { listen 80; return 301 https://$host$request_uri; }', { protocol: 'http' }));
  } else if (!redirectsHttpToHttps) {
    findings.push(sec('medium', 'HTTP is not redirected to HTTPS', 'The HTTPS site does not force a redirect from its HTTP endpoint, leaving a downgrade window.', 'Return a 301 to the https:// URL for every HTTP request.', 'server { listen 80; return 301 https://$host$request_uri; }'));
  }
  if (mixed.length > 0) {
    findings.push(sec('medium', 'Mixed content loaded over HTTP', `${mixed.length} sub-resource(s) were requested over http:// from an https:// page.`, 'Serve every sub-resource over HTTPS and add upgrade-insecure-requests to your CSP.', 'Content-Security-Policy: upgrade-insecure-requests', { resources: mixed.slice(0, 10) }));
  }

  // --- Cookies ----------------------------------------------------
  for (const cookie of ctx.capture.cookies) {
    const flaws: string[] = [];
    if (isHttps && !cookie.secure) flaws.push('Secure');
    if (!cookie.httpOnly) flaws.push('HttpOnly');
    if (!cookie.sameSite || cookie.sameSite === 'None') flaws.push('SameSite');
    if (flaws.length > 0) {
      findings.push(sec(flaws.includes('Secure') ? 'medium' : 'low', `Cookie "${cookie.name}" is missing ${flaws.join(', ')}`, `The cookie is set without the ${flaws.join('/')} attribute(s).`, 'Set Secure, HttpOnly, and an explicit SameSite on session cookies.', `Set-Cookie: ${cookie.name}=...; Secure; HttpOnly; SameSite=Lax; Path=/`, { cookie: cookie.name }));
    }
  }

  // --- Subresource Integrity ------------------------------------
  const sriGaps = findCrossOriginScriptsWithoutSri(ctx.capture.renderedHtml, ctx.target);
  if (sriGaps.length > 0) {
    findings.push(sec('low', 'Third-party scripts loaded without Subresource Integrity', `${sriGaps.length} cross-origin <script>/<link> tag(s) have no integrity attribute.`, 'Add integrity + crossorigin attributes so a compromised CDN cannot swap the file.', '<script src="https://cdn.example.com/lib.js" integrity="sha384-..." crossorigin="anonymous"></script>', { scripts: sriGaps.slice(0, 8) }));
  }

  // --- CORS -----------------------------------------------------
  const acao = h('access-control-allow-origin');
  if (acao === '*' && h('access-control-allow-credentials') === 'true') {
    findings.push(sec('high', 'CORS allows any origin with credentials', 'Access-Control-Allow-Origin: * combined with Allow-Credentials: true lets any site read authenticated responses.', 'Echo a validated allowlisted origin instead of * when credentials are involved.', 'Access-Control-Allow-Origin: https://app.example.com\nVary: Origin', { acao }));
  }

  // --- Vulnerable libraries (minimal built-in table) ----------
  findings.push(...checkVulnerableLibraries(ctx));

  // --- Light public-path probing ------------------------------
  const exposedPaths: string[] = [];
  if (ctx.options.probePaths) {
    const probed = await probePaths(ctx.target);
    for (const p of probed.exposed) {
      exposedPaths.push(p.path);
      findings.push(sec(p.severity, `Sensitive path is publicly accessible: ${p.path}`, p.detail, p.fix, p.fixSnippet, { path: p.path, status: p.status }));
    }
  }

  const summary: SecuritySummary = { grade: gradeFor(findings), headers, tls, exposedPaths };
  return { summary, findings };
}

// ---------------------------------------------------------------------------

function checkExact(
  headers: SecurityHeaderCheck[],
  findings: Finding[],
  value: string | null,
  name: string,
  expected: string,
  severity: Severity,
  missingNote: string,
  fixSnippet: string,
): void {
  if (value?.toLowerCase().includes(expected)) {
    headers.push({ name, status: 'present', value, note: 'Present.' });
    return;
  }
  headers.push({ name, status: value ? 'misconfigured' : 'missing', value, note: missingNote });
  findings.push(sec(severity, `${name} not set to ${expected}`, missingNote, `Send "${name}: ${expected}".`, fixSnippet, { header: value ?? 'absent' }));
}

async function checkHttpRedirect(target: URL): Promise<boolean> {
  if (target.protocol !== 'https:') return false;
  try {
    const httpUrl = `http://${target.host}${target.pathname}`;
    const result = await safeFetch(httpUrl, { timeoutMs: 8000, maxBytes: 2000 });
    return result.redirectChain.some((u) => u.startsWith('https://')) || result.response.url.startsWith('https://');
  } catch {
    return false;
  }
}

function findCrossOriginScriptsWithoutSri(html: string, target: URL): string[] {
  const gaps: string[] = [];
  const tagRe = /<(script|link)\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(html))) {
    const tag = match[0];
    const src = tag.match(/(?:src|href)=["']([^"']+)["']/i)?.[1];
    if (!src) continue;
    if (match[1].toLowerCase() === 'link' && !/rel=["'][^"']*stylesheet/i.test(tag)) continue;
    let url: URL;
    try {
      url = new URL(src, target);
    } catch {
      continue;
    }
    if (url.origin === target.origin) continue;
    if (!/integrity=/i.test(tag)) gaps.push(url.toString());
  }
  return gaps;
}

interface VulnRule {
  name: string;
  isVulnerable: (version: string) => boolean;
  detail: string;
}

const VULN_TABLE: VulnRule[] = [
  {
    name: 'jQuery',
    isVulnerable: (v) => compareVersion(v, '3.5.0') < 0,
    detail: 'jQuery before 3.5.0 is affected by XSS via jQuery.htmlPrefilter (CVE-2020-11022 / CVE-2020-11023).',
  },
  {
    name: 'Bootstrap',
    isVulnerable: (v) => compareVersion(v, '4.3.1') < 0,
    detail: 'Bootstrap before 4.3.1 has XSS issues in the tooltip/popover data-template handling (CVE-2019-8331).',
  },
];

function checkVulnerableLibraries(ctx: AnalyzerContext): Finding[] {
  const out: Finding[] = [];
  const html = ctx.capture.renderedHtml + ctx.capture.network.map((n) => n.url).join('\n');
  for (const rule of VULN_TABLE) {
    const version = html.match(new RegExp(`${rule.name.toLowerCase()}[@/-]v?(\\d+\\.\\d+\\.\\d+)`, 'i'))?.[1];
    if (version && rule.isVulnerable(version)) {
      out.push(sec('high', `Outdated ${rule.name} (${version}) with known vulnerabilities`, rule.detail, `Upgrade ${rule.name} to a currently supported release.`, undefined, { library: rule.name, version }));
    }
  }
  return out;
}

interface ProbeTarget {
  path: string;
  severity: Severity;
  looksExposed: (body: string, status: number, contentType: string) => boolean;
  detail: string;
  fix: string;
  fixSnippet?: string;
}

const PROBE_TARGETS: ProbeTarget[] = [
  {
    path: '/.git/HEAD',
    severity: 'critical',
    looksExposed: (body, status) => status === 200 && /^ref:\s+refs\//m.test(body),
    detail: 'The .git directory is served publicly. An attacker can reconstruct your full source code and history, including secrets committed in the past.',
    fix: 'Block access to dotfiles/directories at the web server and never deploy the .git folder.',
    fixSnippet: 'location ~ /\\.(?!well-known) { deny all; }  # nginx',
  },
  {
    path: '/.env',
    severity: 'critical',
    looksExposed: (body, status) => status === 200 && /^[A-Z0-9_]+=/m.test(body),
    detail: 'A .env file is served publicly, exposing environment configuration and very likely credentials/API keys.',
    fix: 'Remove .env from the web root, rotate every secret it contained, and deny dotfiles at the server.',
    fixSnippet: 'location ~ /\\.env { deny all; }',
  },
  {
    path: '/.well-known/security.txt',
    severity: 'info',
    looksExposed: (_body, status) => status === 200,
    detail: 'security.txt is published (good practice — informational only).',
    fix: 'No action needed.',
  },
];

async function probePaths(target: URL): Promise<{ exposed: { path: string; severity: Severity; detail: string; fix: string; fixSnippet?: string; status: number }[] }> {
  const exposed: { path: string; severity: Severity; detail: string; fix: string; fixSnippet?: string; status: number }[] = [];
  for (const probe of PROBE_TARGETS) {
    try {
      const url = new URL(probe.path, target.origin).toString();
      const result = await safeFetch(url, { timeoutMs: 6000, maxBytes: 20_000 });
      const contentType = result.response.headers.get('content-type') ?? '';
      if (probe.looksExposed(result.body, result.response.status, contentType)) {
        exposed.push({ path: probe.path, severity: probe.severity, detail: probe.detail, fix: probe.fix, fixSnippet: probe.fixSnippet, status: result.response.status });
      }
    } catch {
      // Unreachable path — not exposed.
    }
    await sleep(300); // be polite
  }
  return { exposed };
}

// ---------------------------------------------------------------------------

function sec(
  severity: Severity,
  title: string,
  description: string,
  recommendation: string,
  fixSnippet?: string,
  evidence?: Record<string, unknown>,
): Finding {
  return {
    id: nanoid(10),
    analyzer: 'security',
    category: 'security',
    severity,
    title,
    description,
    recommendation,
    fixSnippet,
    evidence,
    references: [DOC],
    affectedViewports: [],
  };
}

function gradeFor(findings: Finding[]): SecuritySummary['grade'] {
  const score =
    100 -
    findings.reduce((sum, f) => sum + { critical: 45, high: 22, medium: 10, low: 3, info: 0 }[f.severity], 0);
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 55) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

function compareVersion(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

const truncate = (value: string, max = 180): string => (value.length > max ? `${value.slice(0, max)}…` : value);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
