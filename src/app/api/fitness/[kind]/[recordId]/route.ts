import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { enforceRateLimit, requireUser, workspaceErrorResponse, WorkspaceError } from "@/lib/server/workspace-security";
import { getUserFitnessRoot } from "@/lib/server/nutrition";
import { parseFitnessEntry, fitnessKinds } from "@/lib/server/fitness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ kind: string; recordId: string }> };
async function getRef(request: Request, context: Context) {
  const user = await requireUser(request);
  const { kind, recordId } = await context.params;
  if (!fitnessKinds.includes(kind as (typeof fitnessKinds)[number])) throw new WorkspaceError("Unknown fitness tracker.", 404);
  if (!recordId || recordId.length > 150 || recordId.includes("/")) throw new WorkspaceError("Invalid record ID.", 400);
  const { root, workspaceId } = await getUserFitnessRoot(user.uid);
  const ref = root.collection(kind).doc(recordId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new WorkspaceError("Entry not found.", 404);
  const record = snapshot.data()!;
  if (kind === "water" && record.loggedBy !== user.uid) throw new WorkspaceError("This water entry is private to its owner.", 403);
  if (kind === "weight" && record.subjectUid !== user.uid) throw new WorkspaceError("This weight entry is private to its owner.", 403);
  if (kind === "workouts" && record.loggedBy !== user.uid) throw new WorkspaceError("Only the member who logged this workout can change it.", 403);
  return { user, kind: kind as "water" | "weight" | "workouts", workspaceId, ref };
}
export async function PATCH(request: Request, context: Context) {
  try {
    const { user, kind, workspaceId, ref } = await getRef(request, context);
    await enforceRateLimit(user.uid, `fitness_${kind}_update`, 60, 3600000);
    const body = await request.json().catch(() => null);
    const entry = await parseFitnessEntry(kind, body, user.uid, workspaceId);
    await ref.update({ ...entry, updatedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ success: true });
  } catch (error) { return workspaceErrorResponse(error); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const { user, kind, ref } = await getRef(request, context);
    await enforceRateLimit(user.uid, `fitness_${kind}_delete`, 30, 3600000);
    await ref.delete();
    return NextResponse.json({ success: true });
  } catch (error) { return workspaceErrorResponse(error); }
}
