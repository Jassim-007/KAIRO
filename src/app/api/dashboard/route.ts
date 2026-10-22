import { NextResponse } from "next/server";
import { FieldPath, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import {
  enforceRateLimit,
  requireUser,
  workspaceErrorResponse,
} from "@/lib/server/workspace-security";
import { getUserFitnessRoot } from "@/lib/server/nutrition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function serialize(doc: QueryDocumentSnapshot) {
  const data = doc.data();
  return {
    id: doc.id,
    ...data,
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? null,
  };
}

export async function GET(request: Request) {
  const timings: Record<string, number> = {};
  let phaseStarted = performance.now();

  try {
    const user = await requireUser(request);
    timings.auth = performance.now() - phaseStarted;

    phaseStarted = performance.now();
    await enforceRateLimit(user.uid, "dashboard_overview_read", 120, 3600000);
    timings.limit = performance.now() - phaseStarted;

    phaseStarted = performance.now();
    const { root } = await getUserFitnessRoot(user.uid);
    timings.account = performance.now() - phaseStarted;

    const date = new URL(request.url).searchParams.get("date");
    const selectedDate = date ?? new Date().toISOString().slice(0, 10);
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)
      ? new Date(`${selectedDate}T00:00:00.000Z`)
      : null;
    if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== selectedDate) {
      return NextResponse.json({ error: "Choose a valid date." }, { status: 400 });
    }

    phaseStarted = performance.now();
    const [nutritionSnap, waterSnap, dailyWorkouts, dailyWeights, goalsSnap, weightsSnap, workoutsSnap, planSnap] = await Promise.all([
      root.collection("nutrition").where("date", "==", selectedDate).get(),
      root.collection("water").where("date", "==", selectedDate).get(),
      root.collection("workouts").where("date", "==", selectedDate).where("subjectUid", "==", user.uid).get(),
      root.collection("weight").where("date", "==", selectedDate).where("subjectUid", "==", user.uid).get(),
      root.collection("fitnessGoals").doc(user.uid).get(),
      root.collection("weight").where("subjectUid", "==", user.uid).orderBy("date", "desc").orderBy(FieldPath.documentId(), "desc").limit(100).get(),
      root.collection("workouts").where("subjectUid", "==", user.uid).orderBy("date", "desc").orderBy(FieldPath.documentId(), "desc").limit(100).get(),
      root.collection("fitnessPlans").doc(user.uid).get(),
    ]);
    timings.data = performance.now() - phaseStarted;

    const nutritionDocs = nutritionSnap.docs.filter((doc) => doc.data().loggedBy === user.uid);
    const waterDocs = waterSnap.docs.filter((doc) => doc.data().loggedBy === user.uid);
    const workouts = dailyWorkouts.docs;
    const weights = dailyWeights.docs
      .map((doc) => ({ id: doc.id, date: String(doc.data().date ?? ""), weightKg: Number(doc.data().weightKg ?? 0), createdAt: doc.data().createdAt?.toDate?.()?.toISOString?.() ?? null }))
      .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));
    const userTotals = nutritionDocs.reduce((totals, doc) => {
      const data = doc.data();
      totals.calories += Number(data.calories ?? 0);
      totals.protein += Number(data.protein ?? 0);
      totals.carbs += Number(data.carbs ?? 0);
      totals.fat += Number(data.fat ?? 0);
      return totals;
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
    const userWaterMl = waterDocs.reduce((total, doc) => total + Number(doc.data().amountMl ?? 0), 0);

    const response = NextResponse.json({
      date: selectedDate,
      totals: { ...userTotals, waterMl: userWaterMl, workouts: workouts.length },
      userTotals: { ...userTotals, waterMl: userWaterMl, workouts: workouts.length },
      currentWeight: weights.at(-1)?.weightKg ?? null,
      hasWeightForDate: dailyWeights.docs.length > 0,
      weightHistory: weights,
      goals: goalsSnap.exists ? goalsSnap.data() : null,
      records: { weights: weightsSnap.docs.map(serialize), workouts: workoutsSnap.docs.map(serialize) },
      days: planSnap.exists ? planSnap.data()?.days ?? [] : dayNames.map((day) => ({ day, routines: [] })),
    });
    response.headers.set(
      "Server-Timing",
      Object.entries(timings)
        .map(([name, duration]) => `${name};dur=${duration.toFixed(1)}`)
        .join(", "),
    );
    return response;
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
