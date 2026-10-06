/** Reconnect delay for the n-th attempt (0-based): 0.5 s, 1 s, 2 s, 4 s, then 5 s. */
export function reconnectDelayMs(attempt: number): number {
  return Math.min(5000, 500 * 2 ** attempt);
}
