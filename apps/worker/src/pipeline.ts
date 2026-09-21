import type { Redis } from 'ioredis';
import {
  analyzeResponsive,
  analyzeSecurity,
  analyzeSeo,
  analyzeStack,
  computeScores,
  type AnalyzerContext,
} from '@techtester/analyzers';
import { ScanBrowser, assertSafeTarget, safeFetch, selectViewports, type ViewportRender } from '@techtester/browser';
import type { FindingCategory, ScanReport, ScanStage, ScanStatus } from '@techtester/contracts';
import { scans, type ScanRow } from '@techtester/database';
import { publishProgress } from '@techtester/queue';
import { getArtifactStore, screenshotKey } from '@techtester/storage';

interface Reporter {
  (stage: ScanStage, progress: number, message: string): Promise<void>;
}

/** How many viewport contexts to render concurrently — each is an independent page load, so there's no need to serialize them. */
const VIEWPORT_CONCURRENCY = 4;

const STAGE_STATUS: Partial<Record<ScanStage, ScanStatus>> = { done: 'completed', error: 'failed' };
const statusForStage = (stage: ScanStage): ScanStatus => STAGE_STATUS[stage] ?? 'running';

export async function runScan(scan: ScanRow, redis: Redis): Promise<void> {
  const report: Reporter = async (stage, progress, message) => {
    await Promise.all([
      scans.updateProgress(scan.id, { stage, progress }),
      publishProgress(redis, { scanId: scan.id, stage, status: statusForStage(stage), message, progress, at: new Date().toISOString() }),
    ]);
  };

  const startedAt = await scans.markRunning(scan.id);
  await report('guard', 4, 'Validating the target URL');

  const { url: target } = await assertSafeTarget(scan.normalized_url);

  await report('fetch', 12, 'Fetching the raw HTML response');
  const raw = await safeFetch(target.toString(), { maxBytes: 5_000_000, timeoutMs: 20_000 });

  await report('load', 22, 'Loading the page in a real browser');
  const browser = await ScanBrowser.launch();

  try {
    const capture = await browser.capture(target.toString());

    const ctx: AnalyzerContext = { target, raw, capture, renders: [], options: scan.options };

    await report('stack', 34, 'Detecting the framework and architecture');
    const stack = analyzeStack(ctx);

    const allViewports = selectViewports(scan.options.viewports ?? 'all');
    const store = getArtifactStore();
    const renders: ViewportRender[] = [];

    // The desktop profile was already rendered as part of capture() above —
    // reuse it instead of navigating to the target a second time.
    const desktopIncluded = allViewports.some((v) => v.label === capture.desktopRender.profile.label);
    if (desktopIncluded) {
      await store.put(screenshotKey(scan.id, capture.desktopRender.profile.label), capture.desktopRender.screenshot);
      renders.push(capture.desktopRender);
    }
    const remainingViewports = allViewports.filter((v) => v.label !== capture.desktopRender.profile.label);

    let rendered = renders.length;
    for (let i = 0; i < remainingViewports.length; i += VIEWPORT_CONCURRENCY) {
      const chunk = remainingViewports.slice(i, i + VIEWPORT_CONCURRENCY);
      await report(
        'responsive',
        36 + Math.round((rendered / allViewports.length) * 34),
        `Rendering ${chunk.map((profile) => profile.label).join(', ')}`,
      );
      const outcomes = await Promise.allSettled(chunk.map((profile) => browser.renderViewport(target.toString(), profile)));
      for (let j = 0; j < outcomes.length; j += 1) {
        const outcome = outcomes[j];
        const profile = chunk[j];
        rendered += 1;
        if (outcome.status === 'fulfilled') {
          await store.put(screenshotKey(scan.id, profile.label), outcome.value.screenshot);
          renders.push(outcome.value);
        } else {
          // One flaky/slow viewport shouldn't discard every other render already
          // computed for this scan — record it and keep going.
          console.error(`[worker] viewport "${profile.label}" failed for scan ${scan.id}:`, (outcome.reason as Error)?.message ?? outcome.reason);
        }
      }
    }
    ctx.renders = renders;

    await report('responsive', 72, 'Scoring responsiveness across the device matrix');
    const responsive = analyzeResponsive(renders, (label) =>
      store.exists(screenshotKey(scan.id, label)) ? screenshotKey(scan.id, label) : null,
    );
    const evaluated: FindingCategory[] = ['responsiveness'];

    // Security and SEO both only read from `ctx` (already fully populated) and
    // each do their own independent network I/O — no reason to serialize them.
    await report('security', 80, 'Checking security headers, TLS, cookies, and exposed paths');
    await report('seo', 88, 'Auditing SEO structure, keywords, and indexability');
    const [security, seo] = await Promise.all([analyzeSecurity(ctx), analyzeSeo(ctx)]);
    evaluated.push('security', 'seo');

    await report('scoring', 96, 'Computing the overall score');
    const findings = [...responsive.findings, ...security.findings, ...seo.findings];
    const { categories, overallScore } = computeScores({ findings, responsive: responsive.summary, evaluated });

    const fullReport: ScanReport = {
      id: scan.id,
      url: scan.url,
      normalizedUrl: scan.normalized_url,
      status: 'completed',
      stage: 'done',
      progress: 100,
      overallScore,
      error: null,
      requestedAt: scan.requested_at.toISOString(),
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      options: scan.options,
      categories,
      findings: sortFindings(findings),
      responsive: responsive.summary,
      viewports: responsive.viewports,
      stack,
      security: security.summary,
      seo: seo.summary,
    };

    await scans.complete(scan.id, fullReport);
    await report('done', 100, `Scan complete — overall score ${overallScore}/100`);
  } finally {
    await browser.close();
  }
}

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 } as const;

function sortFindings<T extends { severity: keyof typeof SEVERITY_ORDER }>(findings: T[]): T[] {
  return [...findings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
