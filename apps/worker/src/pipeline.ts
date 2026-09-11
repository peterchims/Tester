import type { Redis } from 'ioredis';
import {
  analyzeResponsive,
  analyzeSecurity,
  analyzeStack,
  computeScores,
  type AnalyzerContext,
} from '@techtester/analyzers';
import { ScanBrowser, assertSafeTarget, safeFetch, selectViewports, type ViewportRender } from '@techtester/browser';
import type { FindingCategory, ScanReport, ScanStage } from '@techtester/contracts';
import { scans, type ScanRow } from '@techtester/database';
import { publishProgress } from '@techtester/queue';
import { getArtifactStore, screenshotKey } from '@techtester/storage';

interface Reporter {
  (stage: ScanStage, progress: number, message: string): Promise<void>;
}

export async function runScan(scan: ScanRow, redis: Redis): Promise<void> {
  const report: Reporter = async (stage, progress, message) => {
    await scans.updateProgress(scan.id, { stage, progress });
    await publishProgress(redis, {
      scanId: scan.id,
      stage,
      status: stage === 'done' ? 'completed' : stage === 'error' ? 'failed' : 'running',
      message,
      progress,
      at: new Date().toISOString(),
    });
  };

  await scans.markRunning(scan.id);
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

    const viewports = selectViewports(scan.options.viewports ?? 'all');
    const renders: ViewportRender[] = [];
    const store = getArtifactStore();

    for (let i = 0; i < viewports.length; i += 1) {
      const profile = viewports[i];
      await report(
        'responsive',
        36 + Math.round((i / viewports.length) * 34),
        `Rendering ${profile.label} (${profile.width}×${profile.height})`,
      );
      const render = await browser.renderViewport(target.toString(), profile);
      await store.put(screenshotKey(scan.id, profile.label), render.screenshot);
      renders.push(render);
    }
    ctx.renders = renders;

    await report('responsive', 72, 'Scoring responsiveness across the device matrix');
    const responsive = analyzeResponsive(renders, (label) =>
      store.exists(screenshotKey(scan.id, label)) ? screenshotKey(scan.id, label) : null,
    );

    await report('security', 82, 'Checking security headers, TLS, cookies, and exposed paths');
    const security = await analyzeSecurity(ctx);

    await report('scoring', 94, 'Computing the overall score');
    const findings = [...responsive.findings, ...security.findings];
    const evaluated: FindingCategory[] = ['responsiveness', 'security'];
    const { categories, overallScore } = computeScores({ findings, responsive: responsive.summary, evaluated });

    const now = new Date().toISOString();
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
      startedAt: scan.started_at?.toISOString() ?? now,
      finishedAt: now,
      options: scan.options,
      categories,
      findings: sortFindings(findings),
      responsive: responsive.summary,
      viewports: responsive.viewports,
      stack,
      security: security.summary,
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
