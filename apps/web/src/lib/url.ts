/** The host to display for a scanned URL, falling back to the raw string if it doesn't parse. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
