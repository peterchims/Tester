import type { ScanReport, ScanSummary } from '@techtester/contracts';
import type { ScanRow } from '@techtester/database';

export function toSummary(row: ScanRow): ScanSummary {
  return {
    id: row.id,
    url: row.url,
    normalizedUrl: row.normalized_url,
    status: row.status,
    stage: row.stage,
    progress: row.progress,
    overallScore: row.overall_score,
    error: row.error,
    requestedAt: row.requested_at.toISOString(),
    startedAt: row.started_at?.toISOString() ?? null,
    finishedAt: row.finished_at?.toISOString() ?? null,
  };
}

export function toReport(row: ScanRow): ScanReport {
  if (row.report) {
    // Keep live status fields authoritative from the row.
    return { ...row.report, ...toSummary(row), options: row.options };
  }
  return {
    ...toSummary(row),
    options: row.options,
    categories: [],
    findings: [],
    responsive: null,
    viewports: [],
    stack: null,
    security: null,
    seo: null,
  };
}
