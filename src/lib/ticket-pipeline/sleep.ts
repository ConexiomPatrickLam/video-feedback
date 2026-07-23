/** Extracted so retry-backoff delays can be mocked out (instant) in tests. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
