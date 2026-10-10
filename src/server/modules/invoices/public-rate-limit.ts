import "server-only";

import { createHash } from "node:crypto";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const LIMITS = { read: 40, pdf: 8 } as const;

/** Best-effort per-process prototype limits; production needs a shared limiter. */
export function allowPublicInvoiceRequest(
  clientAddress: string,
  operation: keyof typeof LIMITS,
  now = Date.now(),
): boolean {
  const addressDigest = createHash("sha256").update(clientAddress).digest("hex");
  const key = `${operation}:${addressDigest}`;
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    if (buckets.size > 10_000) {
      for (const [bucketKey, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(bucketKey);
      }
    }
    return true;
  }
  if (current.count >= LIMITS[operation]) return false;
  current.count += 1;
  return true;
}
