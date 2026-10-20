import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/server/firebase-admin";
import { enforceRateLimit, requireUser, workspaceErrorResponse, WorkspaceError } from "@/lib/server/workspace-security";
import { getUserWorkspace } from "@/lib/server/nutrition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Kind = "water" | "weight" | "workouts";
const kinds: Kind[] = ["water", "weight", "workouts"];
type Member = { uid: string; displayName: string | null };

function dateValue(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new WorkspaceError("Choose a valid date.", 400);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new WorkspaceError("Choose a valid date.", 400);
  return value;
}
function text(value: unknown, label: string, min: number, max: number, optional = false) {
  if (optional && (value === undefined || value === null || value === "")) return "";
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) throw new WorkspaceError(`${label} must contain ${min}–${max} characters.`, 400);
  return value.trim();
}
function finite(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new WorkspaceError(`${label} must be between ${min} and ${max}.`, 400);
  return value;
}
async function resolveSubject(uid: string, workspaceId: string, value: unknown): Promise<Member> {
  const subjectUid = typeof value === "string" && value ? value : uid;
  const memberRef = adminDb.collection("workspaceMembers").doc(subjectUid);
  const snapshot = await memberRef.get();
  if (!snapshot.exists || snapshot.data()?.workspaceId !== workspaceId) throw new WorkspaceError("Choose a member of your workspace.", 400);
  const data = snapshot.data()!;
  return { uid: subjectUid, displayName: typeof data.displayName === "string" ? data.displayName : null };
}
async function parseEntry(kind: Kind, body: unknown, uid: string, workspaceId: string) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new WorkspaceError("Provide a valid entry.", 400);
  const data = body as Record<string, unknown>;
  const date = dateValue(data.date);
  const notes = text(data.notes, "Notes", 0, 500, true);
  if (kind === "water") return { date, amountMl: finite(data.amountMl, "Water amount", 1, 5000), notes, loggedBy: uid };
  const subject = await resolveSubject(uid, workspaceId, data.subjectUid);
  if (kind === "weight" && subject.uid !== uid) throw new WorkspaceError("Weight entries are private to your account.", 403);
  if (kind === "weight") return { date, weightKg: finite(data.weightKg, "Weight", 1, 500), notes, subjectUid: subject.uid, subjectName: subject.displayName, loggedBy: uid };
  const workoutType = text(data.workoutType, "Workout type", 1, 40);
  const allowed = ["Push", "Pull", "Legs", "Custom"];
  if (!allowed.includes(workoutType)) throw new WorkspaceError("Choose Push, Pull, Legs, or Custom.", 400);
  if (!Array.isArray(data.exercises) || data.exercises.length < 1 || data.exercises.length > 30) throw new WorkspaceError("Add 1–30 exercises.", 400);
  const exercises = data.exercises.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new WorkspaceError("Each exercise must be valid.", 400);
    const exercise = item as Record<string, unknown>;
    const setDetails = Array.isArray(exercise.setDetails) ? exercise.setDetails.slice(0, 100).map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new WorkspaceError("Each set must be valid.", 400);
      const set = value as Record<string, unknown>;
      const rir = set.rir === null || set.rir === undefined ? null : finite(set.rir, "RIR", 0, 10);
      if (typeof set.completed !== "boolean") throw new WorkspaceError("Set completion must be valid.", 400);
      return { weightKg: finite(set.weightKg, "Set weight", 0, 1000), reps: finite(set.reps, "Set reps", 1, 1000), rir, completed: set.completed };
    }) : undefined;
    return { name: text(exercise.name, "Exercise name", 1, 80), sets: finite(exercise.sets, "Sets", 1, 100), reps: finite(exercise.reps, "Reps", 1, 1000), weightKg: finite(exercise.weightKg ?? 0, "Exercise weight", 0, 1000), ...(typeof exercise.muscle === "string" ? { muscle: exercise.muscle.slice(0, 40) } : {}), ...(typeof exercise.equipment === "string" ? { equipment: exercise.equipment.slice(0, 40) } : {}), ...(setDetails ? { setDetails } : {}) };
  });
  return { date, workoutType, exercises, notes, ...(typeof data.durationMinutes === "number" && Number.isFinite(data.durationMinutes) ? { durationMinutes: Math.max(0, Math.min(1440, Math.round(data.durationMinutes))) } : {}), subjectUid: subject.uid, subjectName: subject.displayName, loggedBy: uid };
}
async function context(request: Request, params: Promise<{ kind: string }>) {
  const user = await requireUser(request);
  const { kind } = await params;
  if (!kinds.includes(kind as Kind)) throw new WorkspaceError("Unknown fitness tracker.", 404);
  const workspaceId = await getUserWorkspace(user.uid);
  return { user, kind: kind as Kind, workspaceId, collection: adminDb.collection("workspaces").doc(workspaceId).collection(kind) };
}

export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  try {
    const { user, kind, collection } = await context(request, params);
    await enforceRateLimit(user.uid, `fitness_${kind}_list`, 120, 3600000);
    const url = new URL(request.url);
    const date = url.searchParams.get("date");
    if (date !== null) dateValue(date);
    // All fitness records have a validated date. Sorting by that single field
    // uses Firestore’s automatic single-field index and avoids requiring an
    // extra __name__ composite index for water and weight history.
    let query = date
      ? collection.where("date", "==", date).orderBy("date", "desc")
      : collection.orderBy("date", "desc");
    const cursor = url.searchParams.get("cursor");
    if (cursor) {
      if (cursor.length > 150 || cursor.includes("/")) throw new WorkspaceError("Invalid page cursor.", 400);
      const snapshot = await collection.doc(cursor).get();
      if (!snapshot.exists) throw new WorkspaceError("Invalid page cursor.", 400);
      query = query.startAfter(snapshot);
    }
    const result = await query.limit(101).get();
    const hasMore = result.docs.length > 100;
    const docs = result.docs.slice(0, 100);
    const visibleDocs = docs.filter((doc) => kind === "workouts" || (kind === "water" ? doc.data().loggedBy === user.uid : doc.data().subjectUid === user.uid));
    const records = visibleDocs.map((doc) => {
      const data = doc.data();
      return { id: doc.id, ...data, createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null, updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? null };
    });
    return NextResponse.json({ records, hasMore, nextCursor: hasMore ? docs.at(-1)?.id ?? null : null });
  } catch (error) { return workspaceErrorResponse(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  try {
    const { user, kind, workspaceId, collection } = await context(request, params);
    await enforceRateLimit(user.uid, `fitness_${kind}_create`, 60, 3600000);
    const body = await request.json().catch(() => null);
    const entry = await parseEntry(kind, body, user.uid, workspaceId);
    const ref = collection.doc();
    await ref.create({ ...entry, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ success: true, recordId: ref.id }, { status: 201 });
  } catch (error) { return workspaceErrorResponse(error); }
}


