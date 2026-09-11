import { nanoid } from 'nanoid';
import type { Finding, ResponsiveSummary, ViewportResult } from '@techtester/contracts';
import type { ViewportRender } from '@techtester/browser';

export interface ResponsiveAnalysis {
  viewports: ViewportResult[];
  summary: ResponsiveSummary;
  findings: Finding[];
}

const DEVICE_WEIGHT: Record<string, number> = { mobile: 1.5, tablet: 1.2, desktop: 1 };

export function analyzeResponsive(
  renders: ViewportRender[],
  screenshotKeyFor: (label: string) => string | null,
): ResponsiveAnalysis {
  const viewports: ViewportResult[] = renders.map((render) => {
    const { profile, probe } = render;
    const score = scoreViewport(render);
    return {
      label: profile.label,
      width: profile.width,
      height: profile.height,
      dpr: profile.dpr,
      deviceType: profile.deviceType,
      screenshotKey: screenshotKeyFor(profile.label),
      documentWidth: probe.documentWidth,
      hasHorizontalOverflow: probe.hasHorizontalOverflow,
      overflowPx: probe.overflowPx,
      offendingElements: probe.offenders.map((o) => ({
        selector: o.selector,
        tag: o.tag,
        overflowRight: o.overflowRight,
        rect: o.rect,
        text: o.text,
        reason: o.reason,
      })),
      tapTargetFailures: probe.tapTargetFailures,
      fontFailures: probe.fontFailures,
      score,
    };
  });

  const viewportMetaPresent = renders.some((r) => r.probe.viewportMetaPresent);

  const weightedScore =
    viewports.length > 0
      ? viewports.reduce((sum, v) => sum + v.score * DEVICE_WEIGHT[v.deviceType], 0) /
        viewports.reduce((sum, v) => sum + DEVICE_WEIGHT[v.deviceType], 0)
      : 0;

  // Share of page area that spills outside the viewport, averaged over the
  // small screens where it matters most.
  const smallScreens = renders.filter((r) => r.profile.deviceType !== 'desktop');
  const leavingPctPerScreen = smallScreens.map((r) => {
    const denom = r.probe.viewportWidth * Math.max(r.probe.documentHeight, 1);
    return denom > 0 ? Math.min(100, (r.probe.overflowArea / denom) * 100) : 0;
  });
  const contentLeavingViewportPct =
    leavingPctPerScreen.length > 0
      ? leavingPctPerScreen.reduce((a, b) => a + b, 0) / leavingPctPerScreen.length
      : 0;

  const worst = [...viewports].sort((a, b) => a.score - b.score)[0] ?? null;

  const summary: ResponsiveSummary = {
    score: round(weightedScore),
    contentLeavingViewportPct: round(contentLeavingViewportPct),
    viewportMetaPresent,
    worstViewport: worst && worst.score < 95 ? worst.label : null,
  };

  return { viewports, summary, findings: buildFindings(viewports, viewportMetaPresent) };
}

function scoreViewport(render: ViewportRender): number {
  const { profile, probe } = render;
  let score = 100;

  if (probe.hasHorizontalOverflow) {
    const ratio = probe.overflowPx / profile.width;
    score -= 10 + Math.min(40, ratio * 100 * 1.4);
  }

  const realOffenders = probe.offenders.filter(
    (o) => o.reason === 'overflow' || o.reason === 'fixed-wider-than-viewport',
  ).length;
  score -= Math.min(18, realOffenders * 3);

  score -= Math.min(4, probe.offenders.filter((o) => o.reason === 'clipped-text').length * 2);

  if (profile.deviceType !== 'desktop') {
    score -= Math.min(16, probe.tapTargetFailures * 2);
    score -= Math.min(12, probe.fontFailures * 1.5);
    if (!probe.viewportMetaPresent) score -= 25;
  }

  return round(Math.max(0, Math.min(100, score)));
}

function buildFindings(viewports: ViewportResult[], viewportMetaPresent: boolean): Finding[] {
  const findings: Finding[] = [];

  if (!viewportMetaPresent) {
    findings.push(
      finding({
        severity: 'high',
        title: 'No responsive viewport meta tag',
        description:
          'The page does not declare <meta name="viewport">. Mobile browsers fall back to a ~980px layout viewport and zoom out, so the site is not usably responsive on phones.',
        recommendation: 'Add the viewport meta tag to the <head> of every page and verify key journeys at mobile widths.',
        fixSnippet: '<meta name="viewport" content="width=device-width, initial-scale=1" />',
        references: ['https://developer.mozilla.org/en-US/docs/Web/HTML/Viewport_meta_tag'],
      }),
    );
  }

  const overflowing = viewports.filter((v) => v.hasHorizontalOverflow);
  if (overflowing.length > 0) {
    const mobileAffected = overflowing.some((v) => v.deviceType !== 'desktop');
    const topOffenders = overflowing
      .flatMap((v) => v.offendingElements.filter((o) => o.reason === 'overflow' || o.reason === 'fixed-wider-than-viewport').map((o) => ({ viewport: v.label, ...o })))
      .sort((a, b) => b.overflowRight - a.overflowRight)
      .slice(0, 8);
    findings.push(
      finding({
        severity: mobileAffected ? 'high' : 'medium',
        title: `Content overflows the viewport on ${overflowing.length} screen size${overflowing.length > 1 ? 's' : ''}`,
        description:
          'One or more elements are wider than the screen, forcing horizontal scrolling and pushing content out of view. This is the most common responsive-design defect.',
        evidence: {
          affected: overflowing.map((v) => `${v.label} (+${v.overflowPx}px)`),
          offenders: topOffenders,
        },
        recommendation:
          'Give the offending elements max-width:100% (or width:100%), replace fixed pixel widths with relative units, allow flex/grid children to shrink (min-width:0), and constrain media with img,video{max-width:100%}. Wide tables and code blocks should scroll inside their own overflow-x:auto container.',
        fixSnippet:
          'img, video, canvas, iframe, table { max-width: 100%; }\n*, *::before, *::after { box-sizing: border-box; }\n/* let flex/grid items shrink instead of overflowing */\n.flex-child { min-width: 0; }',
        affectedViewports: overflowing.map((v) => v.label),
        references: ['https://web.dev/articles/responsive-web-design-basics'],
      }),
    );
  }

  const tapFailingViewports = viewports.filter((v) => v.deviceType !== 'desktop' && v.tapTargetFailures > 0);
  if (tapFailingViewports.length > 0) {
    const worst = Math.max(...tapFailingViewports.map((v) => v.tapTargetFailures));
    findings.push(
      finding({
        severity: worst >= 5 ? 'medium' : 'low',
        title: 'Tap targets are smaller than the recommended 44×44px',
        description: `${worst} interactive element${worst > 1 ? 's are' : ' is'} too small to tap reliably on a touch screen.`,
        evidence: {
          examples: tapFailingViewports[0].offendingElements
            .filter((o) => o.reason === 'tiny-tap-target')
            .slice(0, 6)
            .map((o) => ({ selector: o.selector, size: `${o.rect.width}×${o.rect.height}` })),
        },
        recommendation: 'Ensure links, buttons, and form controls are at least 44×44 CSS px (with padding) and spaced apart on mobile.',
        fixSnippet: 'a, button, [role="button"] { min-height: 44px; min-width: 44px; }',
        affectedViewports: tapFailingViewports.map((v) => v.label),
        references: ['https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html'],
      }),
    );
  }

  const fontFailingViewports = viewports.filter((v) => v.deviceType !== 'desktop' && v.fontFailures > 0);
  if (fontFailingViewports.length > 0) {
    findings.push(
      finding({
        severity: 'low',
        title: 'Text is too small to read comfortably on mobile',
        description:
          'Some text renders below 12px on phones, and some form inputs render below 16px which makes iOS Safari zoom in on focus.',
        recommendation: 'Use a base font-size of at least 16px for body text and 16px for inputs to avoid the iOS focus-zoom.',
        fixSnippet: 'html { font-size: 100%; }\ninput, select, textarea { font-size: 16px; }',
        affectedViewports: fontFailingViewports.map((v) => v.label),
      }),
    );
  }

  return findings;
}

function finding(input: Omit<Finding, 'id' | 'analyzer' | 'category' | 'references' | 'affectedViewports'> & Partial<Pick<Finding, 'references' | 'affectedViewports' | 'evidence'>>): Finding {
  return {
    id: nanoid(10),
    analyzer: 'responsive',
    category: 'responsiveness',
    references: [],
    affectedViewports: [],
    ...input,
  };
}

const round = (n: number): number => Math.round(n * 10) / 10;
