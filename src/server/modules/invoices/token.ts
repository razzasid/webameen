import "server-only";

import { createHash, randomBytes } from "node:crypto";

export function createInvoiceToken(): { token: string; tokenHashHex: string } {
  const tokenBytes = randomBytes(32);
  return {
    token: tokenBytes.toString("hex"),
    tokenHashHex: createHash("sha256").update(tokenBytes).digest("hex"),
  };
}

export function hashInvoiceToken(token: string): string | null {
  if (!/^[0-9a-f]{64}$/i.test(token)) return null;
  return createHash("sha256").update(Buffer.from(token, "hex")).digest("hex");
}
