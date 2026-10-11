import "server-only";

import { createHash } from "node:crypto";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const DEFAULT_READS_PER_MINUTE = 60;
const MAX_CONFIGURED_READS_PER_MINUTE = 10_000;

function readLimit(): number {
  const configured = Number(process.env.WEBAMEEN_PUBLIC_CATALOG_READS_PER_MINUTE);
  if (
    !Number.isInteger(configured) ||
    configured < 1 ||
    configured > MAX_CONFIGURED_READS_PER_MINUTE
  ) {
    return DEFAULT_READS_PER_MINUTE;
  }
  return configured;
}

/** Best-effort per-process protection; production multi-instance limits need a shared store. */
export function allowPublicCatalogRequest(
  clientAddress: string,
  now = Date.now(),
): boolean {
  const addressDigest = createHash("sha256").update(clientAddress).digest("hex");
  const current = buckets.get(addressDigest);
  if (!current || current.resetAt <= now) {
    buckets.set(addressDigest, { count: 1, resetAt: now + WINDOW_MS });
    if (buckets.size > 10_000) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
      }
    }
    return true;
  }
  if (current.count >= readLimit()) return false;
  current.count += 1;
  return true;
}
