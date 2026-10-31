import { NextResponse } from "next/server";

/** Attach opaque trace and phase timing metadata without recording request content. */
export function apiTraceId() {
  return crypto.randomUUID();
}

export function withApiObservability<T extends NextResponse>(
  response: T,
  traceId: string,
  timings: Record<string, number>,
) {
  response.headers.set("X-Request-Id", traceId);
  const entries = Object.entries(timings)
    .filter(([, duration]) => Number.isFinite(duration) && duration >= 0)
    .map(([name, duration]) => `${name};dur=${duration.toFixed(1)}`);
  if (entries.length) response.headers.set("Server-Timing", entries.join(", "));
  return response;
}

export function logApiFailure(route: string, traceId: string, error: unknown) {
  console.error("API request failed", {
    route,
    traceId,
    errorType: error instanceof Error ? error.name : "UnknownError",
  });
}
