import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * SSRF protection. A scan target must be a public HTTP(S) URL: no credentials,
 * no loopback / private / link-local / unique-local addresses, and every name it
 * resolves to must be public. Redirects are re-checked by {@link safeFetch}.
 */

const BLOCKED_HOSTNAMES = new Set(['localhost', 'ip6-localhost', 'ip6-loopback']);

export function isPrivateAddress(address: string): boolean {
  const v = isIP(address);
  if (v === 4) {
    const [a, b] = address.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (v === 6) {
    const lower = address.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fe80:') || lower.startsWith('fec0:')) return true; // link/site-local
    if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true; // unique-local fc00::/7
    if (lower.startsWith('ff')) return true; // multicast
    // IPv4-mapped (::ffff:a.b.c.d)
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  return false;
}

export interface SafeTarget {
  url: URL;
  addresses: string[];
}

export async function assertSafeTarget(raw: string): Promise<SafeTarget> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('That does not look like a valid URL');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP(S) URLs are supported');
  }
  if (url.username || url.password) {
    throw new Error('URLs containing credentials are not supported');
  }
  if (BLOCKED_HOSTNAMES.has(url.hostname.toLowerCase())) {
    throw new Error('Local and private network targets are blocked');
  }

  // A literal IP in the URL still has to be public.
  if (isIP(url.hostname) && isPrivateAddress(url.hostname)) {
    throw new Error('Local and private network targets are blocked');
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(url.hostname, { all: true });
  } catch {
    throw new Error(`Could not resolve ${url.hostname}`);
  }
  if (addresses.length === 0) {
    throw new Error(`Could not resolve ${url.hostname}`);
  }
  if (addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('Local and private network targets are blocked');
  }

  return { url, addresses: addresses.map((a) => a.address) };
}

export interface SafeFetchResult {
  response: Response;
  body: string;
  redirectChain: string[];
  timingMs: number;
}

/**
 * Fetch that re-validates every hop of a redirect chain against the SSRF policy
 * and caps the response body size.
 */
export async function safeFetch(
  raw: string,
  init: { maxBytes?: number; timeoutMs?: number; userAgent?: string } = {},
): Promise<SafeFetchResult> {
  const maxBytes = init.maxBytes ?? 5_000_000;
  const timeoutMs = init.timeoutMs ?? 20_000;
  const redirectChain: string[] = [];
  let current = raw;
  const startedAt = Date.now();

  for (let hop = 0; hop < 10; hop += 1) {
    const { url } = await assertSafeTarget(current);
    redirectChain.push(url.toString());

    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': init.userAgent ?? 'TechTesterBot/0.1 (+https://techtester.dev/bot)' },
    });

    if (response.status >= 300 && response.status < 400 && response.headers.has('location')) {
      current = new URL(response.headers.get('location')!, url).toString();
      continue;
    }

    const buffer = await readCapped(response, maxBytes);
    return {
      response,
      body: buffer.toString('utf8'),
      redirectChain,
      timingMs: Date.now() - startedAt,
    };
  }

  throw new Error('Too many redirects');
}

async function readCapped(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}
