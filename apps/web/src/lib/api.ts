import type { ProgressEvent, ScanReport, ScanSummary } from '@techtester/contracts';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4100';

export class ApiError extends Error {}

async function json<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(body?.message ?? body?.error ?? `Request failed (${response.status})`);
  }
  return (body?.data ?? body) as T;
}

export async function createScan(url: string, consent: boolean): Promise<ScanSummary> {
  const response = await fetch(`${API_URL}/v1/scans`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url, consent }),
  });
  return json<ScanSummary>(response);
}

export async function getScanSummary(id: string): Promise<ScanSummary> {
  const response = await fetch(`${API_URL}/v1/scans/${id}`, { credentials: 'include', cache: 'no-store' });
  return json<ScanSummary>(response);
}

export async function getScanReport(id: string): Promise<ScanReport> {
  const response = await fetch(`${API_URL}/v1/scans/${id}/report`, { credentials: 'include', cache: 'no-store' });
  return json<ScanReport>(response);
}

export async function listRecentScans(): Promise<ScanSummary[]> {
  const response = await fetch(`${API_URL}/v1/scans`, { credentials: 'include', cache: 'no-store' });
  return json<ScanSummary[]>(response);
}

export const screenshotUrl = (scanId: string, label: string): string =>
  `${API_URL}/v1/scans/${scanId}/screenshots/${encodeURIComponent(label)}`;

/**
 * Subscribe to scan progress over SSE. Falls back to polling if EventSource
 * is unavailable (older browsers / some proxies).
 */
export function watchScanProgress(id: string, onEvent: (event: ProgressEvent) => void): () => void {
  if (typeof EventSource === 'undefined') {
    let cancelled = false;
    const poll = async () => {
      while (!cancelled) {
        try {
          const summary = await getScanSummary(id);
          onEvent({
            scanId: id,
            stage: summary.stage,
            status: summary.status,
            progress: summary.progress,
            message: summary.status,
            at: new Date().toISOString(),
          });
          if (summary.status === 'completed' || summary.status === 'failed') return;
        } catch {
          /* keep polling */
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }

  const source = new EventSource(`${API_URL}/v1/scans/${id}/events`, { withCredentials: true });
  source.onmessage = (message) => {
    try {
      onEvent(JSON.parse(message.data) as ProgressEvent);
    } catch {
      /* ignore malformed frame */
    }
  };
  return () => source.close();
}
