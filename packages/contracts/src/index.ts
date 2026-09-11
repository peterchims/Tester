import { z } from 'zod';

/**
 * TechTester shared domain contracts.
 *
 * These schemas are the single source of truth for the shape of a scan, its
 * pipeline progress, and its findings. The API validates requests/responses
 * against them, the worker produces results that satisfy them, and the web app
 * renders them.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const scanStatus = z.enum(['queued', 'running', 'completed', 'failed']);
export type ScanStatus = z.infer<typeof scanStatus>;

export const severity = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export type Severity = z.infer<typeof severity>;

/** Weight applied to each severity when computing a category score (0-100). */
export const SEVERITY_PENALTY: Record<Severity, number> = {
  critical: 40,
  high: 20,
  medium: 10,
  low: 4,
  info: 0,
};

export const findingCategory = z.enum([
  'responsiveness',
  'security',
  'performance',
  'accessibility',
  'seo',
  'best-practices',
]);
export type FindingCategory = z.infer<typeof findingCategory>;

export const analyzerId = z.enum(['responsive', 'stack', 'security', 'performance', 'accessibility', 'seo', 'links']);
export type AnalyzerId = z.infer<typeof analyzerId>;

export const deviceType = z.enum(['mobile', 'tablet', 'desktop']);
export type DeviceType = z.infer<typeof deviceType>;

export const stackKind = z.enum([
  'framework',
  'meta-framework',
  'rendering',
  'css',
  'ui-library',
  'hosting',
  'cdn',
  'cms',
  'ecommerce',
  'analytics',
  'library',
  'language',
  'server',
  'security',
]);
export type StackKind = z.infer<typeof stackKind>;

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const scanOptionsSchema = z
  .object({
    /** Which viewport group(s) to render. `all` uses the full matrix. */
    viewports: z.enum(['all', 'mobile', 'desktop']).default('all'),
    /** Light public-path security probing (/.git/HEAD, /.env, ...). */
    probePaths: z.boolean().default(true),
  })
  .default({ viewports: 'all', probePaths: true });
export type ScanOptions = z.infer<typeof scanOptionsSchema>;

export const createScanSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1)
    .transform((value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`))
    .pipe(z.string().url())
    .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'Only HTTP(S) URLs are supported'),
  /** The caller confirms they own or are authorised to test the target. */
  consent: z.literal(true),
  options: scanOptionsSchema.optional(),
});
export type CreateScan = z.infer<typeof createScanSchema>;

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

export const findingSchema = z.object({
  id: z.string(),
  analyzer: analyzerId,
  category: findingCategory,
  severity,
  title: z.string(),
  description: z.string(),
  /** Free-form structured proof: the header value seen, the offending selector, etc. */
  evidence: z.record(z.string(), z.unknown()).optional(),
  recommendation: z.string(),
  /** Copy-pasteable fix (config snippet, header block, code). */
  fixSnippet: z.string().optional(),
  references: z.array(z.string().url()).default([]),
  /** Viewport labels this finding was observed on, when viewport-specific. */
  affectedViewports: z.array(z.string()).default([]),
});
export type Finding = z.infer<typeof findingSchema>;

// ---------------------------------------------------------------------------
// Responsive results
// ---------------------------------------------------------------------------

export const offendingElementSchema = z.object({
  selector: z.string(),
  tag: z.string(),
  /** How many CSS px the element's right edge exceeds the viewport width. */
  overflowRight: z.number(),
  rect: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
  /** Visible text sample, trimmed. */
  text: z.string().optional(),
  reason: z.enum(['overflow', 'fixed-wider-than-viewport', 'clipped-text', 'tiny-tap-target', 'small-font']),
});
export type OffendingElement = z.infer<typeof offendingElementSchema>;

export const viewportResultSchema = z.object({
  label: z.string(),
  width: z.number(),
  height: z.number(),
  dpr: z.number(),
  deviceType,
  /** Storage key for the full-page screenshot. */
  screenshotKey: z.string().nullable(),
  documentWidth: z.number(),
  hasHorizontalOverflow: z.boolean(),
  overflowPx: z.number(),
  offendingElements: z.array(offendingElementSchema),
  tapTargetFailures: z.number(),
  fontFailures: z.number(),
  /** 0-100 responsiveness score for this viewport. */
  score: z.number(),
});
export type ViewportResult = z.infer<typeof viewportResultSchema>;

export const responsiveSummarySchema = z.object({
  /** Overall responsiveness percentage across the matrix (0-100). */
  score: z.number(),
  /** Share of on-page content that overflows / leaves the viewport on mobile (0-100). */
  contentLeavingViewportPct: z.number(),
  viewportMetaPresent: z.boolean(),
  worstViewport: z.string().nullable(),
});
export type ResponsiveSummary = z.infer<typeof responsiveSummarySchema>;

// ---------------------------------------------------------------------------
// Stack detection
// ---------------------------------------------------------------------------

export const stackDetectionSchema = z.object({
  kind: stackKind,
  name: z.string(),
  version: z.string().nullable(),
  /** 0-1 confidence. */
  confidence: z.number(),
  evidence: z.array(z.string()),
});
export type StackDetection = z.infer<typeof stackDetectionSchema>;

export const renderingModeSchema = z.enum(['ssr', 'ssg', 'csr', 'hybrid', 'static-html', 'unknown']);
export type RenderingMode = z.infer<typeof renderingModeSchema>;

export const stackReportSchema = z.object({
  renderingMode: renderingModeSchema,
  primaryFramework: z.string().nullable(),
  detections: z.array(stackDetectionSchema),
});
export type StackReport = z.infer<typeof stackReportSchema>;

// ---------------------------------------------------------------------------
// Security summary
// ---------------------------------------------------------------------------

export const headerStatus = z.enum(['present', 'missing', 'misconfigured']);
export type HeaderStatus = z.infer<typeof headerStatus>;

export const securityHeaderSchema = z.object({
  name: z.string(),
  status: headerStatus,
  value: z.string().nullable(),
  note: z.string(),
});
export type SecurityHeaderCheck = z.infer<typeof securityHeaderSchema>;

export const tlsSummarySchema = z.object({
  https: z.boolean(),
  redirectsHttpToHttps: z.boolean(),
  hsts: z.boolean(),
  mixedContentCount: z.number(),
});
export type TlsSummary = z.infer<typeof tlsSummarySchema>;

export const securitySummarySchema = z.object({
  grade: z.enum(['A', 'B', 'C', 'D', 'F']),
  headers: z.array(securityHeaderSchema),
  tls: tlsSummarySchema,
  exposedPaths: z.array(z.string()),
});
export type SecuritySummary = z.infer<typeof securitySummarySchema>;

// ---------------------------------------------------------------------------
// Category scores
// ---------------------------------------------------------------------------

export const categoryScoreSchema = z.object({
  category: findingCategory,
  score: z.number(),
  weight: z.number(),
  /** False until an analyzer for this category has actually run. */
  evaluated: z.boolean(),
});
export type CategoryScore = z.infer<typeof categoryScoreSchema>;

// ---------------------------------------------------------------------------
// Progress events (SSE)
// ---------------------------------------------------------------------------

export const scanStageSchema = z.enum([
  'queued',
  'guard',
  'fetch',
  'load',
  'stack',
  'responsive',
  'security',
  'scoring',
  'done',
  'error',
]);
export type ScanStage = z.infer<typeof scanStageSchema>;

export const progressEventSchema = z.object({
  scanId: z.string(),
  stage: scanStageSchema,
  status: scanStatus,
  message: z.string(),
  /** 0-100 rough completion. */
  progress: z.number(),
  at: z.string(),
});
export type ProgressEvent = z.infer<typeof progressEventSchema>;

// ---------------------------------------------------------------------------
// Scan + report
// ---------------------------------------------------------------------------

export const scanSummarySchema = z.object({
  id: z.string(),
  url: z.string(),
  normalizedUrl: z.string(),
  status: scanStatus,
  stage: scanStageSchema,
  progress: z.number(),
  overallScore: z.number().nullable(),
  error: z.string().nullable(),
  requestedAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
export type ScanSummary = z.infer<typeof scanSummarySchema>;

export const scanReportSchema = scanSummarySchema.extend({
  options: scanOptionsSchema,
  categories: z.array(categoryScoreSchema),
  findings: z.array(findingSchema),
  responsive: responsiveSummarySchema.nullable(),
  viewports: z.array(viewportResultSchema),
  stack: stackReportSchema.nullable(),
  security: securitySummarySchema.nullable(),
});
export type ScanReport = z.infer<typeof scanReportSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const isReleaseBlocking = (findings: Finding[]): boolean =>
  findings.some((finding) => finding.severity === 'critical' || finding.severity === 'high');
