import type { PageCapture, SafeFetchResult, ViewportRender } from '@techtester/browser';
import type { ScanOptions } from '@techtester/contracts';

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
