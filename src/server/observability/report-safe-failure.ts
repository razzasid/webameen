import "server-only";

import { randomUUID } from "node:crypto";

export function reportSafeFailure(
  operation: string,
  error: unknown,
  message: string,
): string {
  const referenceId = randomUUID();
  const candidate = error instanceof Error ? error.constructor.name : typeof error;
  const errorType = /^[A-Za-z0-9_$]{1,50}$/.test(candidate) ? candidate : "Error";
  console.error(
    JSON.stringify({
      event: "webameen_operation_failed",
      operation,
      referenceId,
      errorType,
    }),
  );
  return `${message} Reference: ${referenceId}`;
}
