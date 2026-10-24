import { NextResponse } from "next/server";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { enforceRateLimit, requireUser, workspaceErrorResponse } from "@/lib/server/workspace-security";
import { getUserFitnessRoot } from "@/lib/server/nutrition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function sumNutrition(docs: QueryDocumentSnapshot[]) {
  return docs.reduce((total, doc) => {
    const data = doc.data();
    total.calories += Number(data.calories ?? 0);
    total.protein += Number(data.protein ?? 0);
    total.carbs += Number(data.carbs ?? 0);
    total.fat += Number(data.fat ?? 0);
    return total;
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

export async function GET(request: Request) {
  const timings: Record<string, number> = {};
  let phaseStarted = performance.now();
  try {
    const user = await requireUser(request);
    timings.auth = performance.now() - phaseStarted;
    phaseStarted = performance.now();
    await enforceRateLimit(user.uid, "progress_read", 60, 60 * 60 * 1000);
    timings.limit = performance.now() - phaseStarted;
    phaseStarted = performance.now();
    const { root } = await getUserFitnessRoot(user.uid);
    timings.account = performance.now() - phaseStarted;
    const date = new URL(request.url).searchParams.get("date") ?? localDate();
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00.000Z`) : null;
    if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
      return NextResponse.json({ error: "Choose a valid date." }, { status: 400 });
    }

    phaseStarted = performance.now();
    const [nutritionSnap, waterSnap, workoutsSnap, weightsSnap, goalsSnap] = await Promise.all([
      root.collection("nutrition").where("date", "==", date).get(),
      root.collection("water").where("date", "==", date).get(),
      root.collection("workouts").where("date", "==", date).get(),
      root.collection("weight").where("date", "==", date).get(),
      root.collection("fitnessGoals").doc(user.uid).get(),
    ]);

    timings.data = performance.now() - phaseStarted;
    const ownNutritionDocs = nutritionSnap.docs.filter((doc) => doc.data().loggedBy === user.uid);
    const ownWaterDocs = waterSnap.docs.filter((doc) => doc.data().loggedBy === user.uid);
    const ownWorkoutsDocs = workoutsSnap.docs.filter((doc) => doc.data().subjectUid === user.uid);
    const ownWeightsDocs = weightsSnap.docs.filter((doc) => doc.data().subjectUid === user.uid);
    const weights = ownWeightsDocs
      .map((doc) => ({ id: doc.id, weightKg: Number(doc.data().weightKg ?? 0), date: String(doc.data().date ?? ""), createdAt: doc.data().createdAt?.toDate?.()?.toISOString?.() ?? null }))
      .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));
    const userTotals = sumNutrition(ownNutritionDocs);
    const userWaterMl = ownWaterDocs.reduce((sum, doc) => sum + Number(doc.data().amountMl ?? 0), 0);
    const nutrition = ownNutritionDocs.map((doc) => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toDate?.()?.toISOString?.() ?? null }));
    const water = ownWaterDocs.map((doc) => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toDate?.()?.toISOString?.() ?? null }));
    const workouts = ownWorkoutsDocs.map((doc) => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toDate?.()?.toISOString?.() ?? null }));

    const response = NextResponse.json({
      date,
      totals: { ...userTotals, waterMl: userWaterMl, workouts: ownWorkoutsDocs.length },
      userTotals: { ...userTotals, waterMl: userWaterMl, workouts: ownWorkoutsDocs.length },
      currentWeight: weights.at(-1)?.weightKg ?? null,
      weightHistory: weights,
      records: { nutrition, water, workouts },
      goals: goalsSnap.exists ? goalsSnap.data() : null,
      totalsMayBeIncomplete: false,
    });
    response.headers.set("Server-Timing", Object.entries(timings).map(([name, duration]) => `${name};dur=${duration.toFixed(1)}`).join(", "));
    return response;
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
