import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createScanSchema, scanOptionsSchema, isReleaseBlocking, type Finding } from './index.js';

test('createScanSchema prepends https:// when the scheme is missing', () => {
  const parsed = createScanSchema.parse({ url: 'example.com', consent: true });
  assert.equal(parsed.url, 'https://example.com');
});

test('createScanSchema keeps an explicit http scheme', () => {
  const parsed = createScanSchema.parse({ url: 'http://example.com', consent: true });
  assert.equal(parsed.url, 'http://example.com');
});

test('createScanSchema rejects non-http protocols', () => {
  assert.throws(() => createScanSchema.parse({ url: 'ftp://example.com', consent: true }));
});

test('createScanSchema requires explicit consent', () => {
  assert.throws(() => createScanSchema.parse({ url: 'example.com', consent: false }));
});

test('scanOptionsSchema fills defaults', () => {
  assert.deepEqual(scanOptionsSchema.parse(undefined), { viewports: 'all', probePaths: true });
});

test('isReleaseBlocking flags high and critical findings', () => {
  const base: Omit<Finding, 'severity'> = {
    id: 'x',
    analyzer: 'security',
    category: 'security',
    title: 't',
    description: 'd',
    recommendation: 'r',
    references: [],
    affectedViewports: [],
  };
  assert.equal(isReleaseBlocking([{ ...base, severity: 'low' }]), false);
  assert.equal(isReleaseBlocking([{ ...base, severity: 'high' }]), true);
});
