/**
 * Fixed-window per-key rate limiter. State lives in module memory, so it
 * resets on redeploy and does not share state across instances — acceptable
 * for this app's single-instance deployment.
 */
const windowStartByKey = new Map<string, number>();
const countByKey = new Map<string, number>();

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const windowStart = windowStartByKey.get(key);

  if (windowStart === undefined || now - windowStart >= windowMs) {
    windowStartByKey.set(key, now);
    countByKey.set(key, 1);
    return false;
  }

  const count = (countByKey.get(key) ?? 0) + 1;
  countByKey.set(key, count);
  return count > limit;
}
