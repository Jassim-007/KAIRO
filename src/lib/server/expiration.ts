export type RateLimitRecord = {
  windowStartedAtMs?: number;
  expiresAtMs?: number;
  count?: number;
};

/** Returns the stored count only while both its request window and retention are active. */
export function activeRateLimitCount(
  record: RateLimitRecord | undefined,
  now: number,
  windowMs: number,
): number {
  if (!record) return 0;

  const expiresAt = record.expiresAtMs;
  if (typeof expiresAt === "number" && Number.isFinite(expiresAt) && expiresAt <= now) {
    return 0;
  }

  const windowStartedAt = record.windowStartedAtMs;
  if (
    typeof windowStartedAt !== "number" ||
    !Number.isFinite(windowStartedAt) ||
    windowStartedAt <= 0 ||
    now - windowStartedAt >= windowMs
  ) {
    return 0;
  }

  const count = record.count;
  return typeof count === "number" && Number.isFinite(count) && count > 0
    ? Math.floor(count)
    : 0;
}

export function isWorkspaceInviteUsable(
  expiresAtMs: number | undefined,
  uses: number | undefined,
  maxUses: number | undefined,
  now: number,
): boolean {
  const limit = maxUses ?? 1;
  const consumed = uses ?? 0;
  return (
    typeof expiresAtMs === "number" &&
    Number.isFinite(expiresAtMs) &&
    expiresAtMs > now &&
    Number.isFinite(consumed) &&
    Number.isFinite(limit) &&
    consumed < limit
  );
}

export function isWorkspaceInviteExpiredOrUsed(
  expiresAtMs: number | undefined,
  uses: number | undefined,
  maxUses: number | undefined,
  now: number,
): boolean {
  return !isWorkspaceInviteUsable(expiresAtMs, uses, maxUses, now);
}
