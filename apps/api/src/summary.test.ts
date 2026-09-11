import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ScanRow } from '@techtester/database';
import { toReport, toSummary } from './summary.js';

const row: ScanRow = {
  id: 'abc',
  url: 'https://example.com',
  normalized_url: 'https://example.com/',
  session_id: 's1',
  status: 'running',
  stage: 'responsive',
  progress: 50,
  options: { viewports: 'all', probePaths: true },
  overall_score: null,
  error: null,
  report: null,
  requested_at: new Date('2026-09-10T00:00:00Z'),
  started_at: new Date('2026-09-10T00:00:05Z'),
  finished_at: null,
};

test('toSummary maps snake_case columns and ISO dates', () => {
  const summary = toSummary(row);
  assert.equal(summary.normalizedUrl, 'https://example.com/');
  assert.equal(summary.progress, 50);
  assert.equal(summary.startedAt, '2026-09-10T00:00:05.000Z');
  assert.equal(summary.finishedAt, null);
});

test('toReport returns empty sections until a report exists', () => {
  const report = toReport(row);
  assert.deepEqual(report.findings, []);
  assert.equal(report.responsive, null);
});

test('toReport keeps live status fields authoritative over a stored report', () => {
  const withReport: ScanRow = {
    ...row,
    status: 'completed',
    stage: 'done',
    progress: 100,
    overall_score: 88,
    report: { ...toReport(row), status: 'completed', overallScore: 88 },
  };
  const report = toReport(withReport);
  assert.equal(report.overallScore, 88);
  assert.equal(report.status, 'completed');
});
