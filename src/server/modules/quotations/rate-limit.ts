import "server-only";

import { createHash } from "node:crypto";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const LIMITS = { read: 60, respond: 8 } as const;

/** Best-effort, per-process prototype limit. Production multi-instance limits need a shared store. */
export function allowPublicQuotationRequest(
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
