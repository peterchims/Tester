import { nanoid } from 'nanoid';
import type { PageCapture, SafeFetchResult, ViewportRender } from '@techtester/browser';
import type { AnalyzerId, Finding, FindingCategory, ScanOptions, Severity } from '@techtester/contracts';

export interface AnalyzerContext {
  target: URL;
  /** Raw HTTP response (no JS) — authoritative for headers and TLS. */
  raw: SafeFetchResult;
  /** Fully rendered page from a real browser. */
  capture: PageCapture;
  /** One render per viewport in the matrix. */
  renders: ViewportRender[];
  options: ScanOptions;
}

/** Lower-cased header accessor over a raw fetch Response. */
export function headerGetter(raw: SafeFetchResult): (name: string) => string | null {
  return (name: string) => raw.response.headers.get(name.toLowerCase());
}

/**
 * Every analyzer builds `Finding`s with the same envelope (id, analyzer,
 * category, empty defaults for references/affectedViewports). Sharing one
 * factory keeps that shape consistent as it grows instead of drifting across
 * hand-rolled copies in each analyzer.
 */
export function makeFindingFactory(analyzer: AnalyzerId, category: FindingCategory, defaultReferences: string[] = []) {
  return (
    severity: Severity,
    title: string,
    description: string,
    recommendation: string,
    fixSnippet?: string,
    evidence?: Record<string, unknown>,
  ): Finding => ({
    id: nanoid(10),
    analyzer,
    category,
    severity,
    title,
    description,
    recommendation,
    fixSnippet,
    evidence,
    references: defaultReferences,
    affectedViewports: [],
  });
}
