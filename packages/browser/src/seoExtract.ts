/**
 * In-page SEO/content extractor. Serialized and run via `page.evaluate` once,
 * against the fully rendered DOM (after JS hydration) — so a client-rendered
 * title/canonical/JSON-LD set by React/Vue after load is captured correctly,
 * not just whatever was in the raw server HTML. Must be self-contained: no
 * imports, no closures over module scope.
 */

export interface SeoHeading {
  level: number;
  text: string;
}

export interface SeoDomExtract {
  title: string | null;
  metaDescription: string | null;
  metaRobots: string | null;
  canonical: string | null;
  lang: string | null;
  charset: string | null;
  headings: SeoHeading[];
  visibleText: string;
  imagesTotal: number;
  imagesMissingAlt: number;
  internalLinks: number;
  externalLinks: number;
  genericAnchorCount: number;
  structuredDataRaw: string[];
  openGraph: Record<string, string>;
  twitterCard: Record<string, string>;
  favicon: boolean;
  hreflangCount: number;
}

export function extractSeoDom(): SeoDomExtract {
  const doc = document;
  const origin = location.origin;
  const GENERIC_ANCHORS = new Set(['click here', 'here', 'read more', 'more', 'this link', 'link', 'this page', 'go']);

  const resolve = (href: string | null): string | null => {
    if (!href) return null;
    try {
      return new URL(href, location.href).toString();
    } catch {
      return null;
    }
  };

  const title = doc.title?.trim() || null;
  const metaDescription = doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || null;
  const metaRobots = doc.querySelector('meta[name="robots"]')?.getAttribute('content')?.trim() || null;
  const canonicalHref = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null;
  const canonical = resolve(canonicalHref);
  const lang = doc.documentElement.getAttribute('lang');
  const charset = doc.characterSet || doc.querySelector('meta[charset]')?.getAttribute('charset') || null;

  const headings: SeoHeading[] = Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((el) => ({
    level: Number(el.tagName[1]),
    text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 160),
  }));

  const visibleText = ((doc.body as HTMLElement | null)?.innerText ?? '').trim().slice(0, 60_000);

  const images = Array.from(doc.images);
  const imagesTotal = images.length;
  const imagesMissingAlt = images.filter((img) => !img.hasAttribute('alt')).length;

  let internalLinks = 0;
  let externalLinks = 0;
  let genericAnchorCount = 0;
  for (const a of Array.from(doc.querySelectorAll('a[href]'))) {
    const href = a.getAttribute('href') ?? '';
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue;
    const resolved = resolve(href);
    if (!resolved) continue;
    try {
      const url = new URL(resolved);
      if (url.origin === origin) internalLinks += 1;
      else externalLinks += 1;
    } catch {
      continue;
    }
    const text = (a.textContent ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (GENERIC_ANCHORS.has(text)) genericAnchorCount += 1;
  }

  const structuredDataRaw = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))
    .map((el) => (el.textContent ?? '').trim())
    .filter(Boolean)
    .slice(0, 25)
    .map((s) => s.slice(0, 20_000));

  const openGraph: Record<string, string> = {};
  for (const meta of Array.from(doc.querySelectorAll('meta[property^="og:"]'))) {
    const key = meta.getAttribute('property')?.slice(3);
    const value = meta.getAttribute('content');
    if (key && value) openGraph[key] = value;
  }

  const twitterCard: Record<string, string> = {};
  for (const meta of Array.from(doc.querySelectorAll('meta[name^="twitter:"]'))) {
    const key = meta.getAttribute('name')?.slice(8);
    const value = meta.getAttribute('content');
    if (key && value) twitterCard[key] = value;
  }

  const favicon = !!doc.querySelector('link[rel~="icon"]');
  const hreflangCount = doc.querySelectorAll('link[rel="alternate"][hreflang]').length;

  return {
    title,
    metaDescription,
    metaRobots,
    canonical,
    lang,
    charset,
    headings,
    visibleText,
    imagesTotal,
    imagesMissingAlt,
    internalLinks,
    externalLinks,
    genericAnchorCount,
    structuredDataRaw,
    openGraph,
    twitterCard,
    favicon,
    hreflangCount,
  };
}
