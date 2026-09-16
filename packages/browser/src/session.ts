import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { assertSafeTarget } from './guard.js';
import { BASE_DESKTOP, type ViewportProfile } from './devices.js';
import { runResponsiveProbe, type ProbeResult } from './probe.js';
import { extractSeoDom, type SeoDomExtract } from './seoExtract.js';

export interface NetworkEntry {
  url: string;
  status: number;
  resourceType: string;
  mimeType: string;
  server: string | null;
}

export interface PageCapture {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  /** Fully rendered HTML after hydration. */
  renderedHtml: string;
  consoleErrors: string[];
  pageErrors: string[];
  network: NetworkEntry[];
  cookies: { name: string; value: string; secure: boolean; httpOnly: boolean; sameSite: string }[];
  /** Result of sniffing well-known framework globals in the page. */
  globals: Record<string, boolean>;
  generatorMeta: string | null;
  /** Content/meta signals extracted from the rendered DOM, for the SEO analyzer. */
  seo: SeoDomExtract;
}

export interface ViewportRender {
  profile: ViewportProfile;
  probe: ProbeResult;
  screenshot: Buffer;
}

const GLOBAL_SNIFFERS = `(() => {
  const w = window;
  return {
    next: !!w.__NEXT_DATA__ || !!w.next,
    nuxt: !!w.__NUXT__ || !!w.$nuxt,
    react: !!w.React || !!document.querySelector('[data-reactroot], [data-reactid]') || !!(w.__REACT_DEVTOOLS_GLOBAL_HOOK__ && w.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers && w.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers.size),
    vue: !!w.Vue || !!w.__VUE__ || !!document.querySelector('[data-v-app], #app[data-v-app]'),
    angular: !!w.ng || !!w.getAllAngularRootElements || !!document.querySelector('[ng-version]'),
    svelte: !!document.querySelector('style[data-sveltekit], [class*="svelte-"]') || !!w.__svelte,
    gatsby: !!w.___gatsby || !!document.getElementById('___gatsby'),
    remix: !!w.__remixContext,
    astro: !!document.querySelector('astro-island, [astro-island]'),
    jquery: !!w.jQuery || !!w.$,
    gsap: !!w.gsap || !!w.TweenMax,
    wordpress: !!document.querySelector('link[href*="wp-content"], script[src*="wp-includes"], meta[name="generator"][content*="WordPress"]'),
    shopify: !!w.Shopify || !!document.querySelector('script[src*="cdn.shopify.com"]'),
    wix: !!w.wixBiSession || !!document.querySelector('meta[name="generator"][content*="Wix"]'),
    webflow: !!document.querySelector('html[data-wf-page], meta[name="generator"][content*="Webflow"]'),
  };
})()`;

const EMPTY_SEO_DOM: SeoDomExtract = {
  title: null,
  metaDescription: null,
  metaRobots: null,
  canonical: null,
  lang: null,
  charset: null,
  headings: [],
  visibleText: '',
  imagesTotal: 0,
  imagesMissingAlt: 0,
  internalLinks: 0,
  externalLinks: 0,
  genericAnchorCount: 0,
  structuredDataRaw: [],
  openGraph: {},
  twitterCard: {},
  favicon: false,
  hreflangCount: 0,
};

export class ScanBrowser {
  private constructor(private readonly browser: Browser) {}

  static async launch(): Promise<ScanBrowser> {
    const browser = await chromium.launch({
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    return new ScanBrowser(browser);
  }

  async close(): Promise<void> {
    await this.browser.close();
  }

  private async newContext(profile: ViewportProfile): Promise<BrowserContext> {
    return this.browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      deviceScaleFactor: profile.dpr,
      isMobile: profile.isMobile,
      hasTouch: profile.hasTouch,
      userAgent: profile.userAgent,
      ignoreHTTPSErrors: false,
      serviceWorkers: 'block',
    });
  }

  /** Load the target once at desktop with full instrumentation. */
  async capture(url: string): Promise<PageCapture> {
    await assertSafeTarget(url);
    const context = await this.newContext(BASE_DESKTOP);
    const page = await context.newPage();

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const network: NetworkEntry[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
    });
    page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 300)));
    page.on('response', (response) => {
      if (network.length >= 400) return;
      const headers = response.headers();
      network.push({
        url: response.url(),
        status: response.status(),
        resourceType: response.request().resourceType(),
        mimeType: (headers['content-type'] ?? '').split(';')[0],
        server: headers['server'] ?? null,
      });
    });

    let status = 0;
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      status = response?.status() ?? 0;
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    } catch (error) {
      await context.close();
      throw new Error(`Could not load the page: ${(error as Error).message}`);
    }

    const [renderedHtml, globals, generatorMeta, cookies, seo] = await Promise.all([
      page.content(),
      page.evaluate(GLOBAL_SNIFFERS).catch(() => ({}) as Record<string, boolean>),
      page
        .evaluate(() => document.querySelector('meta[name="generator"]')?.getAttribute('content') ?? null)
        .catch(() => null),
      context.cookies().catch(() => []),
      page.evaluate(`(${extractSeoDom.toString()})()`).catch(() => EMPTY_SEO_DOM) as Promise<SeoDomExtract>,
    ]);

    const finalUrl = page.url();
    await context.close();

    return {
      requestedUrl: url,
      finalUrl,
      status,
      renderedHtml,
      consoleErrors,
      pageErrors,
      network,
      cookies: cookies.map((c) => ({
        name: c.name,
        value: c.value ? '<set>' : '',
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite,
      })),
      globals: globals as Record<string, boolean>,
      generatorMeta,
      seo,
    };
  }

  /** Render one viewport, run the responsive probe, and take a full-page screenshot. */
  async renderViewport(url: string, profile: ViewportProfile): Promise<ViewportRender> {
    const context = await this.newContext(profile);
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => undefined);
      await settleLayout(page);
      const probe = (await page.evaluate(`(${runResponsiveProbe.toString()})()`)) as ProbeResult;
      const screenshot = await page.screenshot({ fullPage: true, type: 'png' });
      return { profile, probe, screenshot };
    } finally {
      await context.close();
    }
  }
}

async function settleLayout(page: Page): Promise<void> {
  // Trigger lazy content and let layout settle.
  await page
    .evaluate(async () => {
      await new Promise((r) => setTimeout(r, 250));
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((r) => setTimeout(r, 250));
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 150));
    })
    .catch(() => undefined);
}
