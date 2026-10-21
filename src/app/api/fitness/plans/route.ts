import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { enforceRateLimit, requireUser, workspaceErrorResponse, WorkspaceError } from "@/lib/server/workspace-security";
import { getUserFitnessRoot } from "@/lib/server/nutrition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
function validatePlan(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new WorkspaceError("Provide a valid weekly plan.", 400);
  const days = (value as Record<string, unknown>).days;
  if (!Array.isArray(days) || days.length !== 7) throw new WorkspaceError("A plan must include all seven days.", 400);
  return days.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new WorkspaceError("Each day must be valid.", 400);
    const day = entry as Record<string, unknown>;
    if (day.day !== dayNames[index] || !Array.isArray(day.routines) || day.routines.length > 5) throw new WorkspaceError("Each day can have up to five routines.", 400);
    const routines = day.routines.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new WorkspaceError("Each routine must be valid.", 400);
      const routine = value as Record<string, unknown>;
      const name = typeof routine.name === "string" ? routine.name.trim() : "";
      if (!name || name.length > 60 || !Array.isArray(routine.exercises) || routine.exercises.length > 20) throw new WorkspaceError("A routine needs a name and up to 20 exercises.", 400);
      const exercises = routine.exercises.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) throw new WorkspaceError("Each exercise must be valid.", 400);
        const exercise = item as Record<string, unknown>;
        const exerciseName = typeof exercise.name === "string" ? exercise.name.trim() : "";
        const sets = Number(exercise.sets), reps = Number(exercise.reps), weightKg = Number(exercise.weightKg ?? 0);
        if (!exerciseName || exerciseName.length > 80 || !Number.isInteger(sets) || sets < 1 || sets > 12 || !Number.isInteger(reps) || reps < 1 || reps > 100 || !Number.isFinite(weightKg) || weightKg < 0 || weightKg > 1000) throw new WorkspaceError("Check the exercise name, sets, reps, and weight.", 400);
        return { name: exerciseName, sets, reps, weightKg, muscle: typeof exercise.muscle === "string" ? exercise.muscle.slice(0, 40) : "Full body", equipment: typeof exercise.equipment === "string" ? exercise.equipment.slice(0, 40) : "Bodyweight" };
      });
      return { id: typeof routine.id === "string" ? routine.id.slice(0, 80) : crypto.randomUUID(), name, workoutType: typeof routine.workoutType === "string" ? routine.workoutType.slice(0, 40) : "Custom", exercises };
    });
    return { day: dayNames[index], routines };
  });
}
export async function GET(request: Request) {
  try {
    const user = await requireUser(request); await enforceRateLimit(user.uid, "fitness_plan_read", 120, 3600000);
    const { root } = await getUserFitnessRoot(user.uid);
    const snap = await root.collection("fitnessPlans").doc(user.uid).get();
    return NextResponse.json({ days: snap.exists ? snap.data()?.days ?? [] : dayNames.map((day) => ({ day, routines: [] })), updatedAt: snap.data()?.updatedAt?.toDate?.()?.toISOString?.() ?? null });
  } catch (error) { return workspaceErrorResponse(error); }
}
export async function PUT(request: Request) {
  try {
    const user = await requireUser(request); await enforceRateLimit(user.uid, "fitness_plan_update", 40, 3600000);
    const body = await request.json().catch(() => null); const days = validatePlan(body);
    const { root } = await getUserFitnessRoot(user.uid);
    await root.collection("fitnessPlans").doc(user.uid).set({ ownerUid: user.uid, days, updatedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ success: true, days });
  } catch (error) { return workspaceErrorResponse(error); }
}
