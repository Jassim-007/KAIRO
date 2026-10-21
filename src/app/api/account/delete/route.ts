import { FieldPath, type DocumentReference, type Query } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/server/firebase-admin";
import { workspaceErrorResponse, WorkspaceError } from "@/lib/server/workspace-security";
import { memberOwnsRecord, resolveDeletionScope, type DeletionType } from "@/lib/server/account-deletion-policy";
import { deleteQueryInPages } from "@/lib/server/delete-query-in-pages";

export const runtime = "nodejs";

async function deletionStage<T>(stage: string, operation: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  console.info("Account deletion stage started", { stage });
  try {
    const result = await operation();
    console.info("Account deletion stage completed", { stage, durationMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "unknown";
    console.error("Account deletion stage failed", { stage, durationMs: Date.now() - startedAt, code });
    throw error;
  }
}

type DeletionJob = {
  ownerUid?: unknown;
  workspaceId?: unknown;
  deletionType?: unknown;
  status?: unknown;
};

async function removeQuery(query: Query, stage: string) {
  const count = await deletionStage(`${stage}.paged_cleanup`, () => deleteQueryInPages({
    query,
    documentIdField: FieldPath.documentId(),
    createBatch: () => adminDb.batch(),
    pageSize: 400,
    onPageCommitted: (pageCount, page) => console.info("Account deletion cleanup page completed", {
      stage,
      page,
      count: pageCount,
    }),
  }));
  console.info("Account deletion stage completed", { stage: `${stage}.documents`, count });
}

async function removeDocuments(refs: DocumentReference[], stage: string) {
  const unique = new Map(refs.map((ref) => [ref.path, ref]));
  if (!unique.size) return;
  const documents = [...unique.values()];
  const pageSize = 400;
  for (let offset = 0; offset < documents.length; offset += pageSize) {
    const page = documents.slice(offset, offset + pageSize);
    await deletionStage(`${stage}.batch_commit`, async () => {
      const batch = adminDb.batch();
      for (const ref of page) batch.delete(ref);
      await batch.commit();
    });
    console.info("Account deletion cleanup page completed", {
      stage,
      page: Math.floor(offset / pageSize) + 1,
      count: page.length,
    });
  }
  console.info("Account deletion stage completed", { stage: `${stage}.documents`, count: documents.length });
}

async function removeRateLimits(uid: string) {
  const prefix = uid + "_";
  await removeQuery(
    adminDb.collection("apiRateLimits")
      .where(FieldPath.documentId(), ">=", prefix)
      .where(FieldPath.documentId(), "<=", prefix + String.fromCharCode(0xf8ff)),
    "rate_limits",
  );
}

async function removeMemberRecords(workspaceId: string, uid: string) {
  const workspaceRef = adminDb.collection("workspaces").doc(workspaceId);
  const workouts = workspaceRef.collection("workouts");
  const [nutrition, water, weights, workoutsBySubject, workoutsByLogger] = await Promise.all([
    deletionStage("member.nutrition_query", () => workspaceRef.collection("nutrition").where("loggedBy", "==", uid).get()),
    deletionStage("member.water_query", () => workspaceRef.collection("water").where("loggedBy", "==", uid).get()),
    deletionStage("member.weight_query", () => workspaceRef.collection("weight").where("subjectUid", "==", uid).get()),
    deletionStage("member.workouts_subject_query", () => workouts.where("subjectUid", "==", uid).get()),
    deletionStage("member.workouts_logger_query", () => workouts.where("loggedBy", "==", uid).get()),
  ]);

  // Delete only records attributed to this member.
  await removeDocuments([
    ...nutrition.docs.filter((doc) => memberOwnsRecord("nutrition", doc.data(), uid)).map((doc) => doc.ref),
    ...water.docs.filter((doc) => memberOwnsRecord("water", doc.data(), uid)).map((doc) => doc.ref),
    ...weights.docs.filter((doc) => memberOwnsRecord("weight", doc.data(), uid)).map((doc) => doc.ref),
    ...workoutsBySubject.docs.filter((doc) => memberOwnsRecord("workouts", doc.data(), uid)).map((doc) => doc.ref),
    ...workoutsByLogger.docs.filter((doc) => memberOwnsRecord("workouts", doc.data(), uid)).map((doc) => doc.ref),
  ], "member.attributed_records");

  const invites = await deletionStage("member.invites_query", () => adminDb.collection("workspaceInvites")
    .where("workspaceId", "==", workspaceId)
    .get());
  await Promise.all([
    deletionStage("member.fitness_goal", () => workspaceRef.collection("fitnessGoals").doc(uid).delete()),
    deletionStage("member.water_goal", () => workspaceRef.collection("waterGoals").doc(uid).delete()),
    deletionStage("member.fitness_plan", () => workspaceRef.collection("fitnessPlans").doc(uid).delete()),
    deletionStage("member.exercise_library_recursive_delete", () => adminDb.recursiveDelete(workspaceRef.collection("exerciseLibraries").doc(uid))),
    removeDocuments(invites.docs.filter((doc) => doc.data().createdBy === uid).map((doc) => doc.ref), "member.owned_invites"),
  ]);
}

function deletionTypeFromJob(job: DeletionJob, uid: string): { type: DeletionType; workspaceId: string | null } {
  const scope = resolveDeletionScope(job, uid);
  if (!scope) throw new WorkspaceError("The account-deletion record is invalid. Contact support.", 409);
  return scope;
}

async function createDeletionJob(uid: string) {
  const memberRef = adminDb.collection("workspaceMembers").doc(uid);
  const userRef = adminDb.collection("users").doc(uid);
  const jobRef = adminDb.collection("accountDeletionJobs").doc(uid);
  const memberSnapshot = await deletionStage("job.membership_lookup", () => memberRef.get());

  if (!memberSnapshot.exists) {
    await deletionStage("job.create_solo", () => adminDb.runTransaction(async (transaction) => {
      const [currentMember, currentJob] = await Promise.all([
        transaction.get(memberRef),
        transaction.get(jobRef),
      ]);
      if (currentJob.exists) return;
      if (currentMember.exists) {
        throw new WorkspaceError("Your workspace membership changed. Please retry account deletion.", 409);
      }
      transaction.create(jobRef, {
        ownerUid: uid,
        deletionType: "solo",
        status: "deleting",
        startedAt: new Date().toISOString(),
      });
      transaction.set(userRef, { accountStatus: "deleting" }, { merge: true });
    }));
    return;
  }

  const member = memberSnapshot.data();
  const workspaceId = member?.workspaceId;
  if (typeof workspaceId !== "string" || !workspaceId) {
    throw new WorkspaceError("Your workspace membership is invalid. Contact support.", 409);
  }
  if (member?.role !== "owner" && member?.role !== "member") {
    throw new WorkspaceError("Your workspace role could not be verified. Contact support.", 403);
  }

  const deletionType: DeletionType = member.role === "owner" ? "owner" : "member";
  const workspaceRef = adminDb.collection("workspaces").doc(workspaceId);
  await deletionStage("job.create_workspace", () => adminDb.runTransaction(async (transaction) => {
    const [currentMember, currentWorkspace, currentJob] = await Promise.all([
      transaction.get(memberRef),
      transaction.get(workspaceRef),
      transaction.get(jobRef),
    ]);
    if (currentJob.exists) return;

    if (!currentMember.exists || currentMember.data()?.role !== member.role || currentMember.data()?.workspaceId !== workspaceId) {
      throw new WorkspaceError("Your workspace membership changed. Please retry account deletion.", 409);
    }
    if (!currentWorkspace.exists) {
      throw new WorkspaceError("Your workspace could not be found.", 404);
    }

    const workspace = currentWorkspace.data();
    if (deletionType === "owner" && workspace?.createdBy !== uid) {
      throw new WorkspaceError("Workspace ownership could not be verified.", 403);
    }
    if (deletionType === "member" && workspace?.status === "deleting") {
      throw new WorkspaceError("Workspace deletion is already in progress. Please try again later.", 409);
    }

    transaction.create(jobRef, {
      ownerUid: uid,
      workspaceId,
      deletionType,
      status: "deleting",
      startedAt: new Date().toISOString(),
    });
    if (deletionType === "owner") transaction.update(workspaceRef, { status: "deleting" });
    transaction.update(memberRef, { status: "deleting" });
    transaction.set(userRef, { accountStatus: "deleting" }, { merge: true });
  }));
}

async function cleanOwnerData(uid: string, workspaceId: string) {
  const workspaceRef = adminDb.collection("workspaces").doc(workspaceId);
  await removeQuery(adminDb.collection("workspaceInvites").where("workspaceId", "==", workspaceId), "owner.workspace_invites");
  await deletionStage("owner.workspace_recursive_delete", () => adminDb.recursiveDelete(workspaceRef));
  await removeQuery(adminDb.collection("workspaceMembers").where("workspaceId", "==", workspaceId), "owner.workspace_members");
  await deletionStage("owner.owner_membership_delete", () => adminDb.collection("workspaceMembers").doc(uid).delete());
}

async function cleanMemberData(uid: string, workspaceId: string) {
  await removeMemberRecords(workspaceId, uid);
  const memberRef = adminDb.collection("workspaceMembers").doc(uid);
  const workspaceRef = adminDb.collection("workspaces").doc(workspaceId);
  await adminDb.runTransaction(async (transaction) => {
    const [member, workspace, members] = await Promise.all([
      transaction.get(memberRef),
      transaction.get(workspaceRef),
      transaction.get(adminDb.collection("workspaceMembers").where("workspaceId", "==", workspaceId)),
    ]);
    if (member.exists) transaction.delete(memberRef);
    if (workspace.exists) transaction.update(workspaceRef, {
      memberCount: members.docs.filter((doc) => doc.id !== uid && doc.data().status !== "deleting" && doc.data().status !== "leaving").length,
    });
  });
}

export async function DELETE(request: Request) {
  let resumableJobActive = false;
  const requestStartedAt = Date.now();
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      throw new WorkspaceError("Please sign in again to delete your account.", 401);
    }
    const token = authorization.slice("Bearer ".length).trim();
    if (!token) throw new WorkspaceError("Please sign in again to delete your account.", 401);

    const decoded = await deletionStage("auth.verify_recent_token", () => adminAuth.verifyIdToken(token, true));
    const uid = decoded.uid;
    const authTime = Number(decoded.auth_time ?? 0);
    if (!Number.isFinite(authTime) || authTime <= 0 || Date.now() / 1000 - authTime > 300) {
      throw new WorkspaceError("For your security, sign in again before deleting your account.", 401);
    }

    const jobRef = adminDb.collection("accountDeletionJobs").doc(uid);
    let jobSnapshot = await deletionStage("job.load", () => jobRef.get());
    if (!jobSnapshot.exists) {
      await createDeletionJob(uid);
      jobSnapshot = await deletionStage("job.reload", () => jobRef.get());
    }
    if (!jobSnapshot.exists) {
      throw new WorkspaceError("Could not initialize account deletion. Please try again.", 500);
    }
    const { type, workspaceId } = deletionTypeFromJob(jobSnapshot.data() as DeletionJob, uid);
    resumableJobActive = true;

    // Each cleanup is repeatable; the durable job remains until Firestore cleanup finishes.
    console.info("Account deletion resumed", { deletionType: type });
    if (type === "owner") await deletionStage("owner.cleanup", () => cleanOwnerData(uid, workspaceId!));
    if (type === "member") await deletionStage("member.cleanup", () => cleanMemberData(uid, workspaceId!));
    await deletionStage("rate_limits.cleanup", () => removeRateLimits(uid));
    // The user's current solo storage lives under users/{uid}; recursiveDelete
    // also removes nested records such as fitnessMemory and privateUsage.
    await deletionStage("user_data.recursive_delete", () => adminDb.recursiveDelete(adminDb.collection("users").doc(uid)));
    if (type === "solo") await deletionStage("solo.membership_delete", () => adminDb.collection("workspaceMembers").doc(uid).delete());

    // Keep the durable job in place unless Firebase Auth confirms deletion.
    // The client can retry this same request after any failure because every
    // Firestore cleanup above is idempotent.
    try {
      await deletionStage("auth.delete_user", () => adminAuth.deleteUser(uid));
    } catch (error) {
      console.error("Account deletion stage failed", {
        stage: "auth.delete_user",
        durationMs: Date.now() - requestStartedAt,
        code: typeof error === "object" && error !== null && "code" in error ? String(error.code) : "unknown",
      });
      throw new WorkspaceError(
        "Your data cleanup is saved, but Firebase could not remove the sign-in account. Your deletion is still in progress; return here and retry.",
        503,
      );
    }

    try {
      await deletionStage("job.remove", () => jobRef.delete());
    } catch (cleanupError) {
      console.error("Account deleted, but deletion-job cleanup failed:", cleanupError);
    }
    console.info("Account deletion completed", { durationMs: Date.now() - requestStartedAt });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (resumableJobActive && !(error instanceof WorkspaceError)) {
      console.error("Account deletion request failed; the durable job remains retryable:", {
        durationMs: Date.now() - requestStartedAt,
        code: typeof error === "object" && error !== null && "code" in error ? String(error.code) : "unknown",
      });
      return NextResponse.json(
        {
          error:
            "Your account deletion is still in progress, but the server could not finish data cleanup. Your progress is saved; return to Account settings and retry.",
        },
        { status: 503 },
      );
    }
    return workspaceErrorResponse(error);
  }
}

