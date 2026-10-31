import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { enforceRateLimit, requireUser, workspaceErrorResponse, WorkspaceError } from "@/lib/server/workspace-security";
import { getUserFitnessRoot } from "@/lib/server/nutrition";
import { parseFitnessEntry, fitnessKinds } from "@/lib/server/fitness";
import { readBoundedJson, RequestBodyTooLarge } from "@/lib/server/request-body";
import { fitnessRecordCanBeMutated } from "@/lib/server/request-policies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ kind: string; recordId: string }> };
async function getRef(
  request: Request,
  context: Context,
  operation: "update" | "delete",
) {
  const user = await requireUser(request);
  const { kind, recordId } = await context.params;
  if (!fitnessKinds.includes(kind as (typeof fitnessKinds)[number])) throw new WorkspaceError("Unknown fitness tracker.", 404);
  if (!recordId || recordId.length > 150 || recordId.includes("/")) throw new WorkspaceError("Invalid record ID.", 400);
  await enforceRateLimit(user.uid, `fitness_${kind}_${operation}`, operation === "delete" ? 30 : 60, 3600000);
  const { root, workspaceId } = await getUserFitnessRoot(user.uid);
  const ref = root.collection(kind).doc(recordId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new WorkspaceError("Entry not found.", 404);
  const record = snapshot.data()!;
  if (!fitnessRecordCanBeMutated(kind as "water" | "weight" | "workouts", user.uid, record)) {
    throw new WorkspaceError("Only the member who owns this entry can change it.", 403);
  }
  return { user, kind: kind as "water" | "weight" | "workouts", workspaceId, ref };
}
export async function PATCH(request: Request, context: Context) {
  try {
    const { user, kind, workspaceId, ref } = await getRef(request, context, "update");
    const body = await readBoundedJson(request, 64_000).catch((error) => {
      if (error instanceof RequestBodyTooLarge) throw new WorkspaceError("Fitness entry request is too large.", 413);
      return null;
    });
    const entry = await parseFitnessEntry(kind, body, user.uid, workspaceId);
    await ref.update({ ...entry, updatedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ success: true });
  } catch (error) { return workspaceErrorResponse(error); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const { ref } = await getRef(request, context, "delete");
    await ref.delete();
    return NextResponse.json({ success: true });
  } catch (error) { return workspaceErrorResponse(error); }
}
