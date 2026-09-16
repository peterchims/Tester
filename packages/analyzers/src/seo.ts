import { nanoid } from 'nanoid';
import { safeFetch } from '@techtester/browser';
import type { Finding, HeadingOutlineItem, KeywordSignal, Severity, SeoFieldCheck, SeoSummary, StructuredDataBlock } from '@techtester/contracts';
import type { AnalyzerContext } from './context.js';

export interface SeoAnalysis {
  summary: SeoSummary;
  findings: Finding[];
}

const DOC = 'https://developers.google.com/search/docs';

// A page's actual keyword profile is measured from its own text, headings, and
// URL — never invented. "Ranking" itself (a search engine's live position for a
// query) isn't observable without that engine's own ranking API/credentials, so
// this analyzer reports on-page structure and indexability signals that search
// engines are documented to use, not a fabricated rank number.
export async function analyzeSeo(ctx: AnalyzerContext): Promise<SeoAnalysis> {
  const dom = ctx.capture.seo;
  const findings: Finding[] = [];
  const url = ctx.target;

  // The sitemap URL(s) to check come from robots.txt when it declares one, so
  // robots.txt has to be fetched first.
  const robots = await fetchRobotsTxt(url);
  const sitemapResult = await fetchSitemap(url, robots.sitemapUrls);

  // --- Indexability --------------------------------------------------
  const xRobotsTag = ctx.raw.response.headers.get('x-robots-tag');
  const robotsDirective = `${dom.metaRobots ?? ''} ${xRobotsTag ?? ''}`.toLowerCase();
  const blockedByRobotsTxt = robots.present && isDisallowed(robots.disallowRules, url.pathname);

  let indexability: SeoSummary['indexability'] = 'indexable';
  let indexabilityReason: string | null = null;
  if (robotsDirective.includes('noindex')) {
    indexability = 'noindex';
    indexabilityReason = dom.metaRobots?.toLowerCase().includes('noindex')
      ? `<meta name="robots" content="${dom.metaRobots}">`
      : `X-Robots-Tag: ${xRobotsTag}`;
    findings.push(
      seo('critical', 'Page is set to noindex', `${indexabilityReason} tells every search engine not to index this page — it cannot appear in search results at all while this is set.`, 'Remove the noindex directive unless this page is deliberately excluded from search (e.g. a staging or duplicate page).', undefined, { directive: indexabilityReason }),
    );
  } else if (blockedByRobotsTxt) {
    indexability = 'blocked-by-robots';
    indexabilityReason = `robots.txt disallows ${url.pathname}`;
    findings.push(
      seo('critical', 'Page is blocked by robots.txt', `robots.txt at ${url.origin}/robots.txt disallows crawling of ${url.pathname}. Search engines that respect robots.txt will not crawl (and eventually will drop) this page.`, 'Remove the Disallow rule that matches this path if the page should be indexed.', undefined, { path: url.pathname, disallow: robots.disallowRules }),
    );
  }

  // --- Title ---------------------------------------------------------
  const title = fieldCheck(dom.title, 30, 60);
  if (!title.present) {
    findings.push(seo('critical', 'Missing <title>', 'The page has no <title> element. Title is the single strongest on-page relevance signal and what search engines show as the result headline.', 'Give every page a unique, descriptive title of roughly 50-60 characters.', '<title>Primary keyword – Brand name</title>'));
  } else if (!title.withinRecommendedLength) {
    const tooShort = title.length < 30;
    findings.push(seo('low', `Title is ${tooShort ? 'too short' : 'too long'} (${title.length} characters)`, `"${title.text}" is ${title.length} characters. ${tooShort ? 'Very short titles under-use the space search engines give you.' : 'Titles beyond ~60 characters are usually truncated in search results.'}`, tooShort ? 'Expand the title to describe the page and include your primary term, aiming for 30-60 characters.' : 'Shorten the title to the most important terms, aiming for 30-60 characters.'));
  }

  // --- Meta description ------------------------------------------
  const metaDescription = fieldCheck(dom.metaDescription, 70, 160);
  if (!metaDescription.present) {
    findings.push(seo('medium', 'Missing meta description', 'There is no <meta name="description">. Search engines will fall back to auto-extracted text for the result snippet, which you cannot control.', 'Write a unique 70-160 character description that summarises the page and encourages a click.', '<meta name="description" content="…">'));
  } else if (!metaDescription.withinRecommendedLength) {
    const tooShort = metaDescription.length < 70;
    findings.push(seo('low', `Meta description is ${tooShort ? 'too short' : 'too long'} (${metaDescription.length} characters)`, `The description is ${metaDescription.length} characters. ${tooShort ? 'It under-uses the space available in a search snippet.' : 'It will likely be truncated in search results.'}`, 'Aim for roughly 70-160 characters.'));
  }

  // --- Canonical ------------------------------------------------
  let selfReferencing: boolean | null = null;
  if (dom.canonical) {
    selfReferencing = normalizeUrl(dom.canonical) === normalizeUrl(ctx.capture.finalUrl);
    if (!selfReferencing) {
      findings.push(seo('medium', 'Canonical URL points elsewhere', `This page declares canonical ${dom.canonical}, telling search engines the "real" version is a different URL. If that is unintentional, this page's own ranking signals are being handed to another URL.`, 'Point the canonical tag at this page\'s own URL unless you are deliberately consolidating a duplicate.', undefined, { canonical: dom.canonical, actual: ctx.capture.finalUrl }));
    }
  } else {
    findings.push(seo('low', 'No canonical URL declared', 'Without a canonical tag, search engines must guess which URL variant (with/without query params, trailing slash, etc.) is authoritative.', 'Add a self-referencing canonical tag.', `<link rel="canonical" href="${normalizeUrl(ctx.capture.finalUrl)}">`));
  }

  // --- Headings ---------------------------------------------------
  const h1s = dom.headings.filter((h) => h.level === 1);
  const headingOrderValid = isHeadingOrderValid(dom.headings);
  if (h1s.length === 0) {
    findings.push(seo('medium', 'No H1 heading', 'The page has no top-level H1. The H1 is the strongest on-page content signal after the title.', 'Add a single H1 that describes the page, ideally including your primary keyword.'));
  } else if (h1s.length > 1) {
    findings.push(seo('low', `${h1s.length} H1 headings found`, 'Multiple H1s dilute which heading search engines treat as the page\'s main topic.', 'Use exactly one H1 per page; demote the others to H2/H3.', undefined, { h1s: h1s.map((h) => h.text) }));
  }
  if (!headingOrderValid) {
    findings.push(seo('low', 'Heading levels skip a level', 'The heading outline jumps levels (e.g. an H1 followed directly by an H3), which breaks the document outline search engines and screen readers rely on.', 'Nest headings sequentially — H1 → H2 → H3 — without skipping a level.', undefined, { outline: dom.headings.slice(0, 20) }));
  }

  // --- Content depth -----------------------------------------------
  const words = dom.visibleText.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  if (wordCount < 300) {
    findings.push(seo('medium', `Thin content (${wordCount} words)`, 'Pages with very little visible text give search engines little to evaluate topical relevance from.', 'Expand the page with substantive, unique content relevant to its target topic — aim for at least a few hundred words for a page meant to rank.', undefined, { wordCount }));
  }

  // --- Keywords ------------------------------------------------
  const topKeywords = extractKeywords(dom.visibleText, {
    title: dom.title ?? '',
    h1: h1s.map((h) => h.text).join(' '),
    metaDescription: dom.metaDescription ?? '',
    url: url.pathname,
  });
  const primary = topKeywords.find((k) => k.phrase.includes(' ')) ?? topKeywords[0];
  if (primary && !primary.inTitle && !primary.inH1) {
    findings.push(
      seo(
        'medium',
        'Most-repeated phrase is missing from the title and H1',
        `"${primary.phrase}" is the most-repeated meaningful phrase in the page's own text (${primary.occurrences}× / ${primary.densityPct}% density), but it appears in neither the <title> nor the H1 — the two elements search engines weight most heavily for topical relevance.`,
        `If "${primary.phrase}" is meant to be this page's target term, work it into the title and H1. If it isn't, the page's content and its intended keyword may be misaligned.`,
        undefined,
        { phrase: primary.phrase, occurrences: primary.occurrences, densityPct: primary.densityPct },
      ),
    );
  }
  const stuffed = topKeywords.find((k) => k.densityPct > 3);
  if (stuffed) {
    findings.push(
      seo('medium', `Possible keyword stuffing: "${stuffed.phrase}" (${stuffed.densityPct}% density)`, `"${stuffed.phrase}" repeats ${stuffed.occurrences} times — ${stuffed.densityPct}% of all words on the page. Unnaturally high repetition of a phrase reads as manipulative to search engines and to visitors.`, 'Vary the wording — use synonyms and related terms instead of repeating the exact phrase.', undefined, { phrase: stuffed.phrase, densityPct: stuffed.densityPct }),
    );
  }

  // --- Images / links --------------------------------------------
  if (dom.imagesMissingAlt > 0) {
    const ratio = dom.imagesTotal > 0 ? dom.imagesMissingAlt / dom.imagesTotal : 0;
    findings.push(
      seo(ratio > 0.5 ? 'medium' : 'low', `${dom.imagesMissingAlt} of ${dom.imagesTotal} images have no alt attribute`, 'Images without alt text are invisible to image search and to assistive technology, and lose a legitimate place to reflect page keywords naturally.', 'Add a descriptive alt attribute to every content image (use alt="" only for purely decorative images).', '<img src="…" alt="Describe what the image shows">'),
    );
  }
  if (dom.genericAnchorCount > 2) {
    findings.push(
      seo('low', `${dom.genericAnchorCount} links use generic text like "click here"`, 'Non-descriptive anchor text ("click here", "read more") tells search engines nothing about the linked page and is a known weak signal for both SEO and accessibility.', 'Use anchor text that describes the destination, e.g. "see our pricing" instead of "click here".'),
    );
  }

  // --- Structured data --------------------------------------------
  const structuredData = parseStructuredData(dom.structuredDataRaw);
  const invalid = structuredData.filter((b) => !b.valid);
  if (invalid.length > 0) {
    findings.push(seo('medium', `${invalid.length} structured data block(s) fail to parse`, 'Invalid JSON-LD is silently ignored by search engines — it earns none of the rich-result eligibility it was meant to.', 'Fix the JSON syntax error(s) in the ld+json block(s).', undefined, { errors: invalid.map((b) => b.error) }));
  } else if (structuredData.length === 0) {
    findings.push(seo('info', 'No structured data (JSON-LD) found', 'Structured data is optional but unlocks rich results (star ratings, breadcrumbs, FAQs, product pricing, …) where applicable.', 'Add JSON-LD matching an appropriate schema.org type (Organization, Product, Article, BreadcrumbList, FAQPage, …) if one fits this page.', undefined, undefined));
  }

  // --- Social previews --------------------------------------------
  const openGraph = socialCheck(dom.openGraph, ['title', 'description', 'image', 'url']);
  if (!openGraph.present) {
    findings.push(seo('low', 'No Open Graph tags', 'Without Open Graph tags, links shared on social platforms and chat apps render with an unpredictable, unbranded preview.', 'Add og:title, og:description, og:image, and og:url.', '<meta property="og:title" content="…">\n<meta property="og:description" content="…">\n<meta property="og:image" content="…">\n<meta property="og:url" content="…">'));
  } else if (openGraph.missing.length > 0) {
    findings.push(seo('info', `Open Graph tags incomplete (missing ${openGraph.missing.join(', ')})`, 'A partial Open Graph set still produces an incomplete or broken social preview.', `Add the missing og:${openGraph.missing.join(', og:')} tag(s).`));
  }
  const twitterCard = socialCheck(dom.twitterCard, ['card', 'title', 'description']);

  // --- robots.txt / sitemap ----------------------------------------
  if (!robots.present) {
    findings.push(seo('info', 'No robots.txt found', 'robots.txt is optional, but its absence means there is no explicit crawl policy or sitemap pointer for search engines to discover.', 'Add a robots.txt at the site root, even a permissive one, with a Sitemap: directive.'));
  } else if (robots.sitemapUrls.length === 0) {
    findings.push(seo('info', 'robots.txt does not declare a Sitemap', 'Declaring the sitemap in robots.txt is the standard way search engines discover it without it being submitted manually.', 'Add "Sitemap: https://yoursite.com/sitemap.xml" to robots.txt.'));
  }
  if (!sitemapResult.present) {
    findings.push(seo('medium', 'No sitemap.xml found', 'A sitemap helps search engines discover and prioritise every URL on the site, especially ones with few internal links pointing to them.', 'Publish a sitemap.xml listing your indexable URLs and reference it from robots.txt.'));
  } else if (sitemapResult.includesScannedUrl === false) {
    findings.push(seo('low', 'Scanned URL is missing from the sitemap', `${sitemapResult.urlCount ?? 0} URL(s) are listed in the sitemap, but this page is not one of them.`, 'Add this URL to the sitemap if it is meant to be indexed.'));
  }

  // --- Misc ---------------------------------------------------
  if (!dom.favicon) {
    findings.push(seo('info', 'No favicon declared', 'Missing favicons render as a blank/default tab icon and in some search result surfaces (e.g. mobile search, bookmarks).', 'Add a <link rel="icon"> pointing at a favicon.'));
  }
  if (!dom.lang) {
    findings.push(seo('low', 'Document language not declared', 'Without a lang attribute, search engines and translators must guess the page\'s language, which can affect how and where it is surfaced.', 'Set a valid lang attribute on the <html> element.', '<html lang="en">'));
  }

  const summary: SeoSummary = {
    indexability,
    indexabilityReason,
    title,
    metaDescription,
    canonical: { present: !!dom.canonical, url: dom.canonical, selfReferencing },
    h1Count: h1s.length,
    headingOutline: dom.headings.slice(0, 30) as HeadingOutlineItem[],
    headingOrderValid,
    wordCount,
    topKeywords,
    imagesTotal: dom.imagesTotal,
    imagesMissingAlt: dom.imagesMissingAlt,
    internalLinks: dom.internalLinks,
    externalLinks: dom.externalLinks,
    genericAnchorCount: dom.genericAnchorCount,
    structuredData,
    openGraph,
    twitterCard,
    robotsTxt: { present: robots.present, blocksScannedPath: blockedByRobotsTxt, sitemapDeclared: robots.sitemapUrls.length > 0 },
    sitemap: { present: sitemapResult.present, urlCount: sitemapResult.urlCount, includesScannedUrl: sitemapResult.includesScannedUrl },
    favicon: dom.favicon,
    hreflangCount: dom.hreflangCount,
  };

  return { summary, findings };
}

// ---------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------

interface RobotsTxt {
  present: boolean;
  disallowRules: string[];
  sitemapUrls: string[];
}

async function fetchRobotsTxt(target: URL): Promise<RobotsTxt> {
  try {
    const result = await safeFetch(new URL('/robots.txt', target.origin).toString(), { timeoutMs: 6000, maxBytes: 100_000 });
    if (!result.response.ok) return { present: false, disallowRules: [], sitemapUrls: [] };
    const lines = result.body.split(/\r?\n/);
    const disallowRules: string[] = [];
    const sitemapUrls: string[] = [];
    let inWildcardGroup = false;
    let sawAnyGroup = false;
    for (const raw of lines) {
      const line = raw.split('#')[0].trim();
      if (!line) continue;
      const [rawKey, ...rest] = line.split(':');
      const key = rawKey.trim().toLowerCase();
      const value = rest.join(':').trim();
      if (key === 'user-agent') {
        sawAnyGroup = true;
        inWildcardGroup = value === '*';
      } else if (key === 'disallow' && (inWildcardGroup || !sawAnyGroup)) {
        if (value) disallowRules.push(value);
        else if (raw.trim() === 'Disallow:') disallowRules.push(''); // explicit "allow all"
      } else if (key === 'sitemap' && value) {
        sitemapUrls.push(value);
      }
    }
    return { present: true, disallowRules: disallowRules.filter(Boolean), sitemapUrls };
  } catch {
    return { present: false, disallowRules: [], sitemapUrls: [] };
  }
}

export function isDisallowed(rules: string[], pathname: string): boolean {
  return rules.some((rule) => {
    if (rule === '/') return true;
    const pattern = rule.replace(/\*/g, '.*').replace(/\$$/, '$');
    try {
      return new RegExp(`^${pattern}`).test(pathname);
    } catch {
      return pathname.startsWith(rule);
    }
  });
}

// ---------------------------------------------------------------------------
// sitemap.xml
// ---------------------------------------------------------------------------

interface SitemapResult {
  present: boolean;
  urlCount: number | null;
  includesScannedUrl: boolean | null;
}

async function fetchSitemap(target: URL, declaredUrls: string[]): Promise<SitemapResult> {
  const candidates = declaredUrls.length > 0 ? declaredUrls : [new URL('/sitemap.xml', target.origin).toString()];
  for (const candidate of candidates) {
    try {
      const result = await safeFetch(candidate, { timeoutMs: 8000, maxBytes: 2_000_000 });
      if (!result.response.ok) continue;
      const locs = Array.from(result.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)).map((m) => normalizeUrl(m[1]));
      const scanned = normalizeUrl(target.toString());
      return { present: true, urlCount: locs.length, includesScannedUrl: locs.includes(scanned) };
    } catch {
      continue;
    }
  }
  return { present: false, urlCount: null, includesScannedUrl: null };
}

export function normalizeUrl(value: string): string {
  try {
    const u = new URL(value);
    u.hash = '';
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch {
    return value;
  }
}

// ---------------------------------------------------------------------------
// Keyword extraction — measured from the page's own rendered text.
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(
  `a about above after again against all am an and any are aren't as at be because been before being below between both but by can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself let's me more most mustn't my myself no nor not of off on once only or other ought our ours ourselves out over own same shan't she she'd she'll she's should shouldn't so some such than that that's the their theirs them themselves then there there's these they they'd they'll they're they've this those through to too under until up very was wasn't we we'd we'll we're we've were weren't what what's when when's where where's which while who who's whom why why's with won't would wouldn't you you'd you'll you're you've your yours yourself yourselves your our us home page click here read more learn`.split(
    ' ',
  ),
);

export function extractKeywords(
  visibleText: string,
  fields: { title: string; h1: string; metaDescription: string; url: string },
): KeywordSignal[] {
  const tokens = visibleText
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const totalWords = tokens.length;
  if (totalWords === 0) return [];

  const counts = new Map<string, number>();
  for (const n of [1, 2, 3]) {
    for (let i = 0; i + n <= tokens.length; i += 1) {
      const window = tokens.slice(i, i + n);
      if (window.some((w) => STOPWORDS.has(w) || /^\d+$/.test(w) || w.length < 3)) continue;
      const phrase = window.join(' ');
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
    }
  }

  const titleLower = fields.title.toLowerCase();
  const h1Lower = fields.h1.toLowerCase();
  const descLower = fields.metaDescription.toLowerCase();
  const urlSlug = fields.url.toLowerCase().replace(/[-/_]+/g, ' ');

  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || b[0].split(' ').length - a[0].split(' ').length)
    .slice(0, 10)
    .map(([phrase, occurrences]) => ({
      phrase,
      occurrences,
      densityPct: round((occurrences / totalWords) * 100),
      inTitle: titleLower.includes(phrase),
      inH1: h1Lower.includes(phrase),
      inMetaDescription: descLower.includes(phrase),
      inUrl: urlSlug.includes(phrase),
    }));
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export function fieldCheck(text: string | null, minLen: number, maxLen: number): SeoFieldCheck {
  const trimmed = text?.trim() || null;
  const length = trimmed?.length ?? 0;
  return {
    present: !!trimmed,
    text: trimmed,
    length,
    withinRecommendedLength: !!trimmed && length >= minLen && length <= maxLen,
  };
}

export function isHeadingOrderValid(headings: { level: number }[]): boolean {
  if (headings.length === 0) return true;
  if (headings[0].level !== 1) return false;
  let maxSeen = 1;
  for (const h of headings.slice(1)) {
    if (h.level > maxSeen + 1) return false;
    maxSeen = Math.max(maxSeen, h.level);
  }
  return true;
}

export function parseStructuredData(raw: string[]): StructuredDataBlock[] {
  return raw.map((block) => {
    try {
      const parsed = JSON.parse(block);
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      const types = entries.flatMap((entry) => {
        const t = entry?.['@type'];
        if (!t) return [];
        return Array.isArray(t) ? t : [t];
      });
      return { types, valid: true, error: null };
    } catch (error) {
      return { types: [], valid: false, error: (error as Error).message };
    }
  });
}

export function socialCheck(tags: Record<string, string>, required: string[]): { present: boolean; missing: string[] } {
  const present = Object.keys(tags).length > 0;
  const missing = required.filter((key) => !tags[key]);
  return { present, missing: present ? missing : required };
}

function seo(
  severity: Severity,
  title: string,
  description: string,
  recommendation: string,
  fixSnippet?: string,
  evidence?: Record<string, unknown>,
): Finding {
  return {
    id: nanoid(10),
    analyzer: 'seo',
    category: 'seo',
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

const round = (n: number): number => Math.round(n * 100) / 100;
