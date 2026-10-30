import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getUserFitnessRoot } from "@/lib/server/nutrition";
import { enforceRateLimit, requireUser, workspaceErrorResponse, WorkspaceError } from "@/lib/server/workspace-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    await enforceRateLimit(user.uid, "fitness_plan_date_update", 60, 3600000);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const { date, routineId, action, toDate } = body ?? {};
    if (!validDate(date) || typeof routineId !== "string" || !routineId || !["remove", "move"].includes(String(action))) throw new WorkspaceError("Choose a valid routine and date action.", 400);
    if (action === "move" && (!validDate(toDate) || toDate === date)) throw new WorkspaceError("Choose a different valid date to move this routine to.", 400);
    const { root } = await getUserFitnessRoot(user.uid);
    const weeklyRef = root.collection("fitnessPlans").doc(user.uid);
    const sourceRef = root.collection("fitnessPlanDates").doc(`${user.uid}_${date}`);
    const targetRef = action === "move" ? root.collection("fitnessPlanDates").doc(`${user.uid}_${toDate}`) : null;
    await root.firestore.runTransaction(async (transaction) => {
      const [weeklySnap, sourceSnap, targetSnap] = await Promise.all([transaction.get(weeklyRef), transaction.get(sourceRef), targetRef ? transaction.get(targetRef) : Promise.resolve(null)]);
      const weeklyDays = weeklySnap.data()?.days;
      const weekday = weekdays[new Date(`${date}T12:00:00.000Z`).getUTCDay()];
      const weeklyRoutines = Array.isArray(weeklyDays) ? weeklyDays.find((item: { day?: string }) => item?.day === weekday)?.routines : [];
      const sourceRoutines: Record<string, unknown>[] = Array.isArray(sourceSnap.data()?.routines) ? sourceSnap.data()!.routines : Array.isArray(weeklyRoutines) ? weeklyRoutines : [];
      const routine = sourceRoutines.find((item) => item?.id === routineId);
      if (!routine) {
        if (action === "remove" && sourceSnap.exists) return;
        if (action === "move" && targetSnap && Array.isArray(targetSnap.data()?.routines) && targetSnap.data()!.routines.some((item: { id?: string }) => item?.id === routineId)) return;
        throw new WorkspaceError("That routine is no longer scheduled for this date. Refresh the dashboard and try again.", 409);
      }
      transaction.set(sourceRef, { ownerUid: user.uid, date, routines: sourceRoutines.filter((item) => item?.id !== routineId), updatedAt: FieldValue.serverTimestamp() });
      if (targetRef && targetSnap) {
        const targetDate = toDate as string;
        const targetWeekday = weekdays[new Date(`${targetDate}T12:00:00.000Z`).getUTCDay()];
        const targetWeekly = Array.isArray(weeklyDays) ? weeklyDays.find((item: { day?: string }) => item?.day === targetWeekday)?.routines : [];
        const targetRoutines: Record<string, unknown>[] = Array.isArray(targetSnap.data()?.routines) ? targetSnap.data()!.routines : Array.isArray(targetWeekly) ? targetWeekly : [];
        if (!targetRoutines.some((item) => item?.id === routineId)) {
          if (targetRoutines.length >= 5) throw new WorkspaceError("That date already has five routines.", 409);
          transaction.set(targetRef, { ownerUid: user.uid, date: targetDate, routines: [...targetRoutines, routine], updatedAt: FieldValue.serverTimestamp() });
        }
      }
    });
    return NextResponse.json({ success: true, action, date, toDate: action === "move" ? toDate : null });
  } catch (error) { return workspaceErrorResponse(error); }
}
