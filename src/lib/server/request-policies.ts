import { createHash } from "node:crypto";

export function clampFiniteNumber(value: unknown, max: number, min = 0): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : min;
}

export function normalizeLabels(value: unknown, maxItems = 20, maxLength = 40): string[] {
  if (!value || typeof value !== "object") return [];
  const values = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
  return values.slice(0, maxItems)
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean);
}

export function workoutIdempotencyDocumentId(uid: string, key: string): string | null {
  if (!/^[\w-]{8,100}$/.test(key)) return null;
  return createHash("sha256").update(`${uid}:${key}`).digest("hex").slice(0, 40);
}

export function fitnessRecordCanBeMutated(
  kind: "water" | "weight" | "workouts",
  uid: string,
  record: Record<string, unknown>,
): boolean {
  if (kind === "water") return record.loggedBy === uid;
  if (kind === "weight") return record.subjectUid === uid;
  return record.loggedBy === uid;
}

export function workspaceMembershipCanReadSharedData(
  membership: { workspaceId?: unknown; status?: unknown } | undefined,
  workspace: { status?: unknown } | undefined,
): boolean {
  return typeof membership?.workspaceId === "string"
    && membership.workspaceId.length > 0
    && membership.status !== "deleting"
    && membership.status !== "leaving"
    && workspace !== undefined
    && workspace.status !== "deleting";
}
