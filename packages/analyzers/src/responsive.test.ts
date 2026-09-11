import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ViewportRender } from '@techtester/browser';
import { analyzeResponsive } from './responsive.js';

const baseProbe = {
  viewportWidth: 390,
  viewportHeight: 844,
  documentWidth: 390,
  documentHeight: 2000,
  hasHorizontalOverflow: false,
  overflowPx: 0,
  viewportMetaPresent: true,
  offenders: [],
  tapTargetFailures: 0,
  fontFailures: 0,
  overflowArea: 0,
};

const render = (over: Partial<typeof baseProbe>, label = 'iPhone 13/14'): ViewportRender => ({
  profile: { label, width: 390, height: 844, dpr: 3, deviceType: 'mobile', isMobile: true, hasTouch: true },
  probe: { ...baseProbe, ...over },
  screenshot: Buffer.alloc(0),
});

test('a clean responsive page scores near 100', () => {
  const result = analyzeResponsive([render({})], () => 'k.png');
  assert.ok(result.summary.score >= 98);
  assert.equal(result.findings.length, 0);
});

test('horizontal overflow drops the score and raises a high finding', () => {
  const result = analyzeResponsive(
    [
      render({
        hasHorizontalOverflow: true,
        overflowPx: 200,
        documentWidth: 590,
        overflowArea: 390 * 400,
        offenders: [
          { selector: 'div.hero', tag: 'div', overflowRight: 200, rect: { x: 0, y: 0, width: 590, height: 400 }, reason: 'overflow' },
        ],
      }),
    ],
    () => null,
  );
  assert.ok(result.summary.score < 80, `score was ${result.summary.score}`);
  assert.ok(result.summary.contentLeavingViewportPct > 0);
  assert.equal(result.findings.some((f) => f.severity === 'high' && /overflow/i.test(f.title)), true);
});

test('missing viewport meta is a high finding', () => {
  const result = analyzeResponsive([render({ viewportMetaPresent: false })], () => null);
  assert.equal(result.summary.viewportMetaPresent, false);
  assert.equal(result.findings.some((f) => /viewport meta/i.test(f.title)), true);
});
