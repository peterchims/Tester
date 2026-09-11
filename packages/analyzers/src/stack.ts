import type { RenderingMode, StackDetection, StackKind, StackReport } from '@techtester/contracts';
import type { AnalyzerContext } from './context.js';

interface Signals {
  headers: Headers;
  rawHtml: string;
  renderedHtml: string;
  network: string[];
  globals: Record<string, boolean>;
  generator: string | null;
  cookieNames: string[];
}

interface Rule {
  kind: StackKind;
  name: string;
  /** Return [matched, confidence 0-1, evidence] */
  test: (s: Signals) => false | { confidence: number; evidence: string; version?: string | null };
}

const header = (s: Signals, name: string): string => s.headers.get(name)?.toLowerCase() ?? '';

const RULES: Rule[] = [
  // --- Frameworks / meta-frameworks -------------------------------------
  {
    kind: 'meta-framework',
    name: 'Next.js',
    test: (s) => {
      const ev: string[] = [];
      if (s.globals.next) ev.push('window.__NEXT_DATA__');
      if (/\/_next\/static\//.test(s.rawHtml) || s.network.some((u) => /\/_next\/static\//.test(u))) ev.push('/_next/static/ assets');
      if (header(s, 'x-powered-by').includes('next.js')) ev.push('x-powered-by: Next.js');
      if (s.headers.has('x-nextjs-cache') || s.headers.has('x-nextjs-prerender')) ev.push('x-nextjs-* headers');
      if (!ev.length) return false;
      const version = s.rawHtml.match(/"next"\s*:\s*"([\d.]+)"/)?.[1] ?? null;
      return { confidence: 0.98, evidence: ev.join(', '), version };
    },
  },
  {
    kind: 'meta-framework',
    name: 'Nuxt',
    test: (s) => (s.globals.nuxt || /\/_nuxt\//.test(s.rawHtml) ? { confidence: 0.95, evidence: 'window.__NUXT__ / /_nuxt/ assets' } : false),
  },
  {
    kind: 'meta-framework',
    name: 'SvelteKit',
    test: (s) =>
      /data-sveltekit/.test(s.rawHtml) || s.network.some((u) => /\/_app\/immutable\//.test(u))
        ? { confidence: 0.9, evidence: 'data-sveltekit attributes / _app/immutable assets' }
        : false,
  },
  {
    kind: 'meta-framework',
    name: 'Remix',
    test: (s) => (s.globals.remix ? { confidence: 0.9, evidence: 'window.__remixContext' } : false),
  },
  {
    kind: 'meta-framework',
    name: 'Gatsby',
    test: (s) => (s.globals.gatsby ? { confidence: 0.95, evidence: '#___gatsby / window.___gatsby' } : false),
  },
  {
    kind: 'meta-framework',
    name: 'Astro',
    test: (s) =>
      s.globals.astro || /<astro-island/.test(s.renderedHtml) || s.generator?.toLowerCase().includes('astro')
        ? { confidence: 0.92, evidence: 'astro-island / generator meta', version: s.generator?.match(/astro v?([\d.]+)/i)?.[1] ?? null }
        : false,
  },
  {
    kind: 'framework',
    name: 'React',
    test: (s) => {
      if (!s.globals.react && !/data-reactroot|__reactContainer|react\.production/.test(s.renderedHtml) && !s.network.some((u) => /react(-dom)?[.@-][\d.]+.*\.js|react-dom\.production/.test(u))) return false;
      return { confidence: 0.85, evidence: 'React devtools hook / data-react* / react-dom bundle' };
    },
  },
  {
    kind: 'framework',
    name: 'Vue.js',
    test: (s) => (s.globals.vue ? { confidence: 0.85, evidence: 'window.__VUE__ / [data-v-app]' } : false),
  },
  {
    kind: 'framework',
    name: 'Angular',
    test: (s) => {
      const v = s.renderedHtml.match(/ng-version="([\d.]+)"/)?.[1];
      return s.globals.angular || v ? { confidence: 0.95, evidence: v ? `ng-version="${v}"` : 'window.ng', version: v ?? null } : false;
    },
  },
  {
    kind: 'framework',
    name: 'Svelte',
    test: (s) => (s.globals.svelte ? { confidence: 0.7, evidence: 'svelte-scoped class names' } : false),
  },
  {
    kind: 'library',
    name: 'jQuery',
    test: (s) => {
      const m = s.renderedHtml.match(/jquery[/-]?([\d.]+)?(?:\.min)?\.js/i) || s.network.map((u) => u.match(/jquery[/-]([\d.]+)/i)).find(Boolean);
      return s.globals.jquery || m ? { confidence: 0.8, evidence: 'window.jQuery / jquery script', version: Array.isArray(m) ? m[1] ?? null : null } : false;
    },
  },
  {
    kind: 'library',
    name: 'GSAP',
    test: (s) => (s.globals.gsap ? { confidence: 0.8, evidence: 'window.gsap' } : false),
  },

  // --- CSS frameworks --------------------------------------------------
  {
    kind: 'css',
    name: 'Tailwind CSS',
    test: (s) => {
      const utilityHits = (s.renderedHtml.match(/class="[^"]*\b(?:flex|grid|hidden|(?:items|justify)-(?:center|between)|(?:p|m|px|py|mx|my|gap|text|bg)-\[?[\w./-]+)\b[^"]*"/g) ?? []).length;
      return utilityHits >= 8 ? { confidence: 0.75, evidence: `${utilityHits} Tailwind-style utility class attributes` } : false;
    },
  },
  {
    kind: 'css',
    name: 'Bootstrap',
    test: (s) => {
      const m = s.renderedHtml.match(/bootstrap(?:\.min)?(?:@|\/)?([\d.]+)?/i);
      const hits = /class="[^"]*\b(?:container(?:-fluid)?|row|col(?:-(?:sm|md|lg|xl)-\d+)?|navbar-expand)\b/.test(s.renderedHtml);
      return m || hits ? { confidence: 0.7, evidence: 'bootstrap stylesheet / grid class names', version: m?.[1] ?? null } : false;
    },
  },

  // --- CMS / site builders / ecommerce -------------------------------
  {
    kind: 'cms',
    name: 'WordPress',
    test: (s) => {
      if (!s.globals.wordpress && !/wp-content|wp-includes/.test(s.renderedHtml) && !s.generator?.toLowerCase().includes('wordpress')) return false;
      return { confidence: 0.95, evidence: 'wp-content / wp-includes / generator meta', version: s.generator?.match(/wordpress\s+([\d.]+)/i)?.[1] ?? null };
    },
  },
  {
    kind: 'cms',
    name: 'Wix',
    test: (s) => (s.globals.wix ? { confidence: 0.95, evidence: 'window.wixBiSession / generator meta' } : false),
  },
  {
    kind: 'cms',
    name: 'Webflow',
    test: (s) => (s.globals.webflow || /data-wf-page/.test(s.renderedHtml) ? { confidence: 0.95, evidence: 'html[data-wf-page]' } : false),
  },
  {
    kind: 'cms',
    name: 'Squarespace',
    test: (s) => (/static1\.squarespace\.com|Squarespace\.afterBodyLoad/.test(s.renderedHtml) ? { confidence: 0.95, evidence: 'squarespace assets' } : false),
  },
  {
    kind: 'ecommerce',
    name: 'Shopify',
    test: (s) => (s.globals.shopify || /cdn\.shopify\.com/.test(s.renderedHtml) ? { confidence: 0.95, evidence: 'Shopify global / cdn.shopify.com' } : false),
  },

  // --- Hosting / CDN --------------------------------------------------
  {
    kind: 'hosting',
    name: 'Vercel',
    test: (s) => (s.headers.has('x-vercel-id') || header(s, 'server') === 'vercel' ? { confidence: 0.97, evidence: 'x-vercel-id / server: Vercel' } : false),
  },
  {
    kind: 'hosting',
    name: 'Netlify',
    test: (s) => (s.headers.has('x-nf-request-id') || header(s, 'server').includes('netlify') ? { confidence: 0.97, evidence: 'x-nf-request-id / server: Netlify' } : false),
  },
  {
    kind: 'hosting',
    name: 'GitHub Pages',
    test: (s) => (header(s, 'server').includes('github.com') || header(s, 'x-github-request-id') !== '' ? { confidence: 0.9, evidence: 'server: GitHub.com' } : false),
  },
  {
    kind: 'hosting',
    name: 'Cloudflare Pages',
    test: (s) => (s.headers.has('cf-ray') && header(s, 'server') === 'cloudflare' && s.network.some((u) => /\.pages\.dev/.test(u)) ? { confidence: 0.7, evidence: 'cf-ray + pages.dev asset host' } : false),
  },
  {
    kind: 'cdn',
    name: 'Cloudflare',
    test: (s) => (s.headers.has('cf-ray') || header(s, 'server') === 'cloudflare' ? { confidence: 0.95, evidence: 'cf-ray header' } : false),
  },
  {
    kind: 'cdn',
    name: 'Fastly',
    test: (s) => (header(s, 'x-served-by').includes('cache-') || header(s, 'x-fastly-request-id') !== '' || header(s, 'via').includes('varnish') ? { confidence: 0.7, evidence: 'x-served-by / via: varnish' } : false),
  },
  {
    kind: 'cdn',
    name: 'Amazon CloudFront',
    test: (s) => (header(s, 'via').includes('cloudfront') || s.headers.has('x-amz-cf-id') ? { confidence: 0.95, evidence: 'x-amz-cf-id / via: CloudFront' } : false),
  },

  // --- Servers / languages -----------------------------------------
  {
    kind: 'server',
    name: 'Nginx',
    test: (s) => (header(s, 'server').includes('nginx') ? { confidence: 0.9, evidence: `server: ${s.headers.get('server')}`, version: header(s, 'server').match(/nginx\/([\d.]+)/)?.[1] ?? null } : false),
  },
  {
    kind: 'server',
    name: 'Apache',
    test: (s) => (header(s, 'server').includes('apache') ? { confidence: 0.9, evidence: `server: ${s.headers.get('server')}`, version: header(s, 'server').match(/apache\/([\d.]+)/)?.[1] ?? null } : false),
  },
  {
    kind: 'language',
    name: 'PHP',
    test: (s) => (header(s, 'x-powered-by').includes('php') || s.cookieNames.includes('PHPSESSID') ? { confidence: 0.85, evidence: 'x-powered-by: PHP / PHPSESSID cookie', version: header(s, 'x-powered-by').match(/php\/([\d.]+)/)?.[1] ?? null } : false),
  },
  {
    kind: 'language',
    name: 'ASP.NET',
    test: (s) => (s.headers.has('x-aspnet-version') || header(s, 'x-powered-by').includes('asp.net') ? { confidence: 0.85, evidence: 'x-aspnet-version / x-powered-by' } : false),
  },
  {
    kind: 'language',
    name: 'Ruby on Rails',
    test: (s) => (s.cookieNames.some((c) => /_session_id$/.test(c)) || header(s, 'x-powered-by').includes('phusion passenger') ? { confidence: 0.6, evidence: 'rails session cookie' } : false),
  },

  // --- Analytics -------------------------------------------------
  {
    kind: 'analytics',
    name: 'Google Analytics',
    test: (s) => (/googletagmanager\.com\/gtag\/js|google-analytics\.com\/analytics\.js|gtag\(/.test(s.renderedHtml) ? { confidence: 0.9, evidence: 'gtag.js / analytics.js' } : false),
  },
  {
    kind: 'analytics',
    name: 'Google Tag Manager',
    test: (s) => (/googletagmanager\.com\/gtm\.js/.test(s.renderedHtml) ? { confidence: 0.9, evidence: 'gtm.js' } : false),
  },
  {
    kind: 'analytics',
    name: 'Plausible',
    test: (s) => (/plausible\.io\/js/.test(s.renderedHtml) ? { confidence: 0.9, evidence: 'plausible.io script' } : false),
  },
  {
    kind: 'analytics',
    name: 'Hotjar',
    test: (s) => (/static\.hotjar\.com/.test(s.renderedHtml) ? { confidence: 0.9, evidence: 'hotjar script' } : false),
  },
];

export function analyzeStack(ctx: AnalyzerContext): StackReport {
  const signals: Signals = {
    headers: ctx.raw.response.headers,
    rawHtml: ctx.raw.body,
    renderedHtml: ctx.capture.renderedHtml,
    network: ctx.capture.network.map((n) => n.url),
    globals: ctx.capture.globals ?? {},
    generator: ctx.capture.generatorMeta,
    cookieNames: ctx.capture.cookies.map((c) => c.name),
  };

  const detections: StackDetection[] = [];
  for (const rule of RULES) {
    const hit = rule.test(signals);
    if (!hit) continue;
    detections.push({
      kind: rule.kind,
      name: rule.name,
      version: hit.version ?? null,
      confidence: hit.confidence,
      evidence: [hit.evidence],
    });
  }

  const renderingMode = classifyRendering(signals, detections);
  const primaryFramework =
    detections.find((d) => d.kind === 'meta-framework')?.name ??
    detections.find((d) => d.kind === 'framework')?.name ??
    detections.find((d) => d.kind === 'cms')?.name ??
    null;

  detections.push({
    kind: 'rendering',
    name: renderingLabel(renderingMode),
    version: null,
    confidence: 0.7,
    evidence: [renderingEvidence(signals)],
  });

  return { renderingMode, primaryFramework, detections: dedupe(detections) };
}

function textLength(html: string): number {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}

function classifyRendering(s: Signals, detections: StackDetection[]): RenderingMode {
  const hasFramework = detections.some((d) => d.kind === 'framework' || d.kind === 'meta-framework');
  const rawText = textLength(s.rawHtml);
  const renderedText = textLength(s.renderedHtml);
  const ratio = renderedText > 0 ? rawText / renderedText : 1;

  if (!hasFramework) {
    // A CMS still counts as server-rendered.
    if (detections.some((d) => d.kind === 'cms' || d.kind === 'ecommerce')) return 'ssr';
    return ratio > 0.9 ? 'static-html' : 'unknown';
  }

  const staticHost = detections.some((d) => ['Netlify', 'GitHub Pages', 'Cloudflare Pages', 'Vercel'].includes(d.name));
  const immutableCache = (s.headers.get('cache-control') ?? '').includes('immutable') || s.headers.has('age');

  if (ratio < 0.3) return 'csr';
  if (ratio > 0.75) {
    if (detections.some((d) => ['Gatsby', 'Astro'].includes(d.name))) return 'ssg';
    if (staticHost && immutableCache) return 'ssg';
    return 'ssr';
  }
  return 'hybrid';
}

const renderingLabel = (m: RenderingMode): string =>
  ({
    ssr: 'Server-side rendered',
    ssg: 'Static site generation (prerendered)',
    csr: 'Client-side rendered (SPA)',
    hybrid: 'Hybrid rendering',
    'static-html': 'Static HTML/CSS',
    unknown: 'Rendering mode undetermined',
  })[m];

function renderingEvidence(s: Signals): string {
  const rawText = textLength(s.rawHtml);
  const renderedText = textLength(s.renderedHtml);
  return `initial HTML carried ${rawText} chars of text vs ${renderedText} after hydration`;
}

function dedupe(detections: StackDetection[]): StackDetection[] {
  const map = new Map<string, StackDetection>();
  for (const d of detections) {
    const key = `${d.kind}:${d.name}`;
    const existing = map.get(key);
    if (!existing || d.confidence > existing.confidence) map.set(key, d);
  }
  return [...map.values()].sort((a, b) => b.confidence - a.confidence);
}
