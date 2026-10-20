import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/server/firebase-admin";
import { enforceRateLimit, requireUser, workspaceErrorResponse, WorkspaceError } from "@/lib/server/workspace-security";
import { getUserFitnessRoot } from "@/lib/server/nutrition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExerciseInput = { name: string; muscle: string; equipment: string; level: string; type: string; cue: string; source?: string; license?: string };
const clean = (value: unknown, label: string, max: number, fallback = "") => {
  if (typeof value !== "string") return fallback;
  const result = value.trim();
  if (result.length > max) throw new WorkspaceError(`${label} must be ${max} characters or fewer.`, 400);
  return result || fallback;
};
function parseExercise(value: unknown): ExerciseInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new WorkspaceError("Each exercise must be an object.", 400);
  const data = value as Record<string, unknown>;
  const name = clean(data.name, "Name", 100);
  if (!name) throw new WorkspaceError("Each exercise needs a name.", 400);
  const primaryMuscles = Array.isArray(data.primaryMuscles) ? data.primaryMuscles : [];
  const instructions = Array.isArray(data.instructions) ? data.instructions : [];
  return {
    name,
    muscle: clean(data.muscle ?? primaryMuscles[0], "Muscle", 60, "Full body"),
    equipment: clean(data.equipment, "Equipment", 60, "Bodyweight"),
    level: clean(data.level ?? data.difficulty, "Level", 30, "All levels"),
    type: clean(data.type ?? data.mechanic, "Type", 30, "Strength"),
    cue: clean(data.cue ?? instructions[0], "Cue", 500, "Choose a comfortable range and controlled pace."),
    source: clean(data.source, "Source", 120, "User library"),
    license: clean(data.license, "License", 100, "User provided"),
  };
}
function exerciseId(name: string) {
  return name.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 110) || "exercise";
}
async function exerciseCollection(request: Request) {
  const user = await requireUser(request);
  const { root } = await getUserFitnessRoot(user.uid);
  return { user, collection: root.collection("exerciseLibraries").doc(user.uid).collection("exercises") };
}

export async function GET(request: Request) {
  try {
    const { user, collection } = await exerciseCollection(request);
    await enforceRateLimit(user.uid, "exercise_library_read", 120, 3600000);
    const snapshot = await collection.orderBy("name").limit(1000).get();
    return NextResponse.json({ exercises: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })), truncated: snapshot.size === 1000 });
  } catch (error) { return workspaceErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const { user, collection } = await exerciseCollection(request);
    await enforceRateLimit(user.uid, "exercise_library_write", 30, 3600000);
    const body = await request.json().catch(() => null);
    const values = Array.isArray(body) ? body : body && typeof body === "object" ? (body as Record<string, unknown>).exercises : null;
    if (!Array.isArray(values) || values.length < 1 || values.length > 200) throw new WorkspaceError("Import between 1 and 200 exercises at a time.", 400);
    const exercises = values.map(parseExercise);
    const unique = new Map(exercises.map((exercise) => [exerciseId(exercise.name), exercise]));
    const batch = adminDb.batch();
    for (const [id, exercise] of unique) batch.set(collection.doc(id), { ...exercise, ownerUid: user.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await batch.commit();
    return NextResponse.json({ success: true, saved: unique.size, duplicatesInUpload: exercises.length - unique.size });
  } catch (error) { return workspaceErrorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const { user, collection } = await exerciseCollection(request);
    await enforceRateLimit(user.uid, "exercise_library_write", 30, 3600000);
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!/^[a-z0-9-]{1,110}$/.test(id)) throw new WorkspaceError("Choose a valid exercise.", 400);
    const ref = collection.doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data()?.ownerUid !== user.uid) throw new WorkspaceError("Exercise not found.", 404);
    await ref.delete();
    return NextResponse.json({ success: true });
  } catch (error) { return workspaceErrorResponse(error); }
}
