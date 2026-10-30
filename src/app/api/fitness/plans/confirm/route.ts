import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getUserFitnessRoot } from "@/lib/server/nutrition";
import { enforceRateLimit, requireUser, workspaceErrorResponse, WorkspaceError } from "@/lib/server/workspace-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    await enforceRateLimit(user.uid, "fitness_plan_confirm", 20, 3600000);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const date = body?.date;
    if (!isDate(date)) {
      throw new WorkspaceError("Choose a valid workout date.", 400);
    }
    const plan = body?.plan as Record<string, unknown> | undefined;
    if (!plan || typeof plan !== "object" || Array.isArray(plan) || typeof plan.id !== "string" || !/^[\w-]{8,80}$/.test(plan.id) || typeof plan.focus !== "string" || typeof plan.warmup !== "string" || !Array.isArray(plan.exercises) || plan.exercises.length < 1 || plan.exercises.length > 8) {
      throw new WorkspaceError("Review a valid workout plan before confirming it.", 400);
    }
    const exercises = plan.exercises.map((item) => {
      if (!item || typeof item !== "object") throw new WorkspaceError("One of the exercises is invalid.", 400);
      const exercise = item as Record<string, unknown>;
      const sets = Number(exercise.sets);
      const reps = typeof exercise.reps === "string" ? Number(exercise.reps.match(/\d+/)?.[0]) : Number(exercise.reps);
      const weightKg = exercise.weightKg === null ? 0 : Number(exercise.weightKg);
      if (typeof exercise.name !== "string" || !exercise.name.trim() || !Number.isInteger(sets) || sets < 1 || sets > 6 || !Number.isInteger(reps) || reps < 1 || reps > 100 || !Number.isFinite(weightKg) || weightKg < 0 || weightKg > 500) throw new WorkspaceError("Check the exercise names, sets, reps, and suggested weights.", 400);
      return { name: exercise.name.trim().slice(0, 80), sets, reps, weightKg, muscle: typeof exercise.muscle === "string" ? exercise.muscle.slice(0, 40) : "Full body", equipment: typeof exercise.equipment === "string" ? exercise.equipment.slice(0, 40) : "Bodyweight" };
    });
    const routineId = plan.id;
    const routine = {
      id: routineId,
      name: String(plan.focus).trim().slice(0, 60) || "AI workout",
      workoutType: /push/i.test(String(plan.focus)) ? "Push" : /pull/i.test(String(plan.focus)) ? "Pull" : /leg/i.test(String(plan.focus)) ? "Legs" : "Custom",
      notes: [String(plan.warmup).slice(0, 300), String(plan.coachTip || "").slice(0, 300)].filter(Boolean).join(" · "),
      exercises,
    };
    const { root } = await getUserFitnessRoot(user.uid);
    const ref = root.collection("fitnessPlanDates").doc(`${user.uid}_${date}`);
    const weeklyRef = root.collection("fitnessPlans").doc(user.uid);
    await root.firestore.runTransaction(async (transaction) => {
      const [snap, weeklySnap] = await Promise.all([transaction.get(ref), transaction.get(weeklyRef)]);
      const existing: Record<string, unknown>[] = Array.isArray(snap.data()?.routines)
        ? snap.data()!.routines
        : (() => {
            const weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date(`${date}T12:00:00.000Z`).getUTCDay()];
            const days = weeklySnap.data()?.days;
            const routines = Array.isArray(days) ? days.find((item: { day?: string }) => item?.day === weekday)?.routines : [];
            return Array.isArray(routines) ? routines : [];
          })();
      if (!existing.some((item) => item?.id === routineId)) {
        if (existing.length >= 5) throw new WorkspaceError("That date already has five routines.", 409);
        transaction.set(ref, { ownerUid: user.uid, date, routines: [...existing, routine], updatedAt: FieldValue.serverTimestamp() });
      }
    });
    return NextResponse.json({ success: true, date, routineId });
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
