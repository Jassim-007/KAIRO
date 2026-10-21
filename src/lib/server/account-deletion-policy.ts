export type DeletionType = "owner" | "member" | "solo";
export type DeletionScope = { type: DeletionType; workspaceId: string | null };
type DeletionJob = { ownerUid?: unknown; workspaceId?: unknown; deletionType?: unknown; status?: unknown };
type RecordKind = "nutrition" | "water" | "weight" | "workouts";

/** Validate and normalize a durable deletion job. Unscoped legacy jobs were owner jobs. */
export function resolveDeletionScope(job: DeletionJob, uid: string): DeletionScope | null {
  if (job.ownerUid !== uid || job.status !== "deleting") return null;
  const type = job.deletionType ?? "owner";
  if (type === "solo" && !job.workspaceId) return { type, workspaceId: null };
  if ((type === "owner" || type === "member") && typeof job.workspaceId === "string" && job.workspaceId) {
    return { type, workspaceId: job.workspaceId };
  }
  return null;
}

/** Only a valid, active job for this UID should block normal API access. */
export function isDeletionInProgress(job: DeletionJob | undefined, uid: string): boolean {
  return !!job && resolveDeletionScope(job, uid) !== null;
}

/** A member cleanup may remove only shared records attributed to that member. */
export function memberOwnsRecord(kind: RecordKind, record: Record<string, unknown>, uid: string): boolean {
  if (kind === "nutrition" || kind === "water") return record.loggedBy === uid;
  if (kind === "weight") return record.subjectUid === uid;
  return record.subjectUid === uid || record.loggedBy === uid;
}

export function activeWorkspaceMemberCount(members: Array<{ status?: unknown }>): number {
  return members.filter((member) => member.status !== "deleting" && member.status !== "leaving").length;
}

export function isWorkspaceOwner(membership: { role?: unknown }, uid: string, createdBy: unknown): boolean {
  return membership.role === "owner" && createdBy === uid;
}

export function workspaceLifecycleDecision(action: unknown, role: unknown) {
  if (action === "delete") return role === "owner"
    ? { allowed: true, removeWorkspace: true, removeMemberRecords: false, preservePersonalData: true }
    : { allowed: false, removeWorkspace: false, removeMemberRecords: false, preservePersonalData: true };
  if (action === "leave") return role === "member"
    ? { allowed: true, removeWorkspace: false, removeMemberRecords: true, preservePersonalData: true }
    : { allowed: false, removeWorkspace: false, removeMemberRecords: false, preservePersonalData: true };
  return { allowed: false, removeWorkspace: false, removeMemberRecords: false, preservePersonalData: true };
}

