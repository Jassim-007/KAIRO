import { type DocumentReference } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/server/firebase-admin";
import { memberOwnsRecord, workspaceLifecycleDecision } from "@/lib/server/account-deletion-policy";
import { requireUser, WorkspaceError, workspaceErrorResponse } from "@/lib/server/workspace-security";

export const runtime = "nodejs";

async function deleteRefs(refs: DocumentReference[]) {
  const unique = [...new Map(refs.map((ref) => [ref.path, ref])).values()];
  for (let i = 0; i < unique.length; i += 400) {
    const batch = adminDb.batch();
    for (const ref of unique.slice(i, i + 400)) batch.delete(ref);
    await batch.commit();
  }
}

async function removeMemberData(workspaceId: string, uid: string) {
  const root = adminDb.collection("workspaces").doc(workspaceId);
  const workouts = root.collection("workouts");
  const [nutrition, water, weight, bySubject, byLogger] = await Promise.all([
    root.collection("nutrition").where("loggedBy", "==", uid).get(),
    root.collection("water").where("loggedBy", "==", uid).get(),
    root.collection("weight").where("subjectUid", "==", uid).get(),
    workouts.where("subjectUid", "==", uid).get(),
    workouts.where("loggedBy", "==", uid).get(),
  ]);
  await deleteRefs([
    ...nutrition.docs.filter((d) => memberOwnsRecord("nutrition", d.data(), uid)).map((d) => d.ref),
    ...water.docs.filter((d) => memberOwnsRecord("water", d.data(), uid)).map((d) => d.ref),
    ...weight.docs.filter((d) => memberOwnsRecord("weight", d.data(), uid)).map((d) => d.ref),
    ...bySubject.docs.filter((d) => memberOwnsRecord("workouts", d.data(), uid)).map((d) => d.ref),
    ...byLogger.docs.filter((d) => memberOwnsRecord("workouts", d.data(), uid)).map((d) => d.ref),
  ]);
  await Promise.all([
    root.collection("fitnessGoals").doc(uid).delete(),
    root.collection("waterGoals").doc(uid).delete(),
    root.collection("fitnessPlans").doc(uid).delete(),
    adminDb.recursiveDelete(root.collection("exerciseLibraries").doc(uid)),
  ]);
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const { action } = await request.json().catch(() => ({}));
    if (action !== "leave" && action !== "delete") throw new WorkspaceError("Choose leave or delete workspace.", 400);
    const memberRef = adminDb.collection("workspaceMembers").doc(user.uid);
    const membershipSnapshot = await memberRef.get();
    if (!membershipSnapshot.exists) throw new WorkspaceError("You don't belong to a workspace.", 404);
    const membership = membershipSnapshot.data()!;
    const decision = workspaceLifecycleDecision(action, membership.role);
    if (!decision.allowed) throw new WorkspaceError(action === "delete" ? "Only the workspace owner can delete it." : "The owner cannot leave. Delete the workspace instead.", 403);
    const workspaceId = membership.workspaceId;
    if (typeof workspaceId !== "string" || !workspaceId) throw new WorkspaceError("Your workspace membership is invalid.", 403);
    const workspaceRef = adminDb.collection("workspaces").doc(workspaceId);

    if (action === "leave") {
      await adminDb.runTransaction(async (tx) => {
        const current = await tx.get(memberRef);
        if (!current.exists || current.data()?.workspaceId !== workspaceId || current.data()?.role !== "member") throw new WorkspaceError("Workspace membership could not be verified.", 409);
        tx.update(memberRef, { status: "leaving" });
      });
      await removeMemberData(workspaceId, user.uid);
      await adminDb.runTransaction(async (tx) => {
        const [current, workspace, members] = await Promise.all([
          tx.get(memberRef), tx.get(workspaceRef), tx.get(adminDb.collection("workspaceMembers").where("workspaceId", "==", workspaceId)),
        ]);
        if (current.exists && current.data()?.status === "leaving") tx.delete(memberRef);
        if (workspace.exists) tx.update(workspaceRef, { memberCount: members.docs.filter((d) => d.id !== user.uid && d.data().status !== "deleting" && d.data().status !== "leaving").length });
      });
      return NextResponse.json({ success: true, action });
    }

    const workspaceSnapshot = await workspaceRef.get();
    if (workspaceSnapshot.exists && workspaceSnapshot.data()?.createdBy !== user.uid) throw new WorkspaceError("Workspace ownership could not be verified.", 403);
    await adminDb.runTransaction(async (tx) => {
      const [current, workspace] = await Promise.all([tx.get(memberRef), tx.get(workspaceRef)]);
      if (!current.exists || current.data()?.role !== "owner" || current.data()?.workspaceId !== workspaceId) throw new WorkspaceError("Workspace ownership could not be verified.", 403);
      if (workspace.exists) tx.update(workspaceRef, { status: "deleting" });
    });
    const invites = await adminDb.collection("workspaceInvites").where("workspaceId", "==", workspaceId).get();
    await deleteRefs(invites.docs.map((d) => d.ref));
    if (workspaceSnapshot.exists) await adminDb.recursiveDelete(workspaceRef);
    const members = await adminDb.collection("workspaceMembers").where("workspaceId", "==", workspaceId).get();
    await deleteRefs(members.docs.map((d) => d.ref));
    await memberRef.delete();
    return NextResponse.json({ success: true, action });
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
