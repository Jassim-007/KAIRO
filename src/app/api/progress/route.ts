import { NextResponse } from "next/server";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/firebase-admin";
import { enforceRateLimit, requireUser, workspaceErrorResponse } from "@/lib/server/workspace-security";
import { getUserWorkspace } from "@/lib/server/nutrition";

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
  try {
    const user = await requireUser(request);
    await enforceRateLimit(user.uid, "progress_read", 60, 60 * 60 * 1000);
    const workspaceId = await getUserWorkspace(user.uid);
    const workspace = adminDb.collection("workspaces").doc(workspaceId);
    const date = new URL(request.url).searchParams.get("date") ?? localDate();
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00.000Z`) : null;
    if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
      return NextResponse.json({ error: "Choose a valid date." }, { status: 400 });
    }

    const [nutritionSnap, waterSnap, workoutsSnap, weightsSnap, goalsSnap] = await Promise.all([
      workspace.collection("nutrition").where("date", "==", date).get(),
      workspace.collection("water").where("date", "==", date).get(),
      workspace.collection("workouts").where("date", "==", date).get(),
      workspace.collection("weight").where("date", "==", date).get(),
      workspace.collection("fitnessGoals").doc(user.uid).get(),
    ]);

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

    return NextResponse.json({
      date,
      totals: { ...userTotals, waterMl: userWaterMl, workouts: ownWorkoutsDocs.length },
      userTotals: { ...userTotals, waterMl: userWaterMl, workouts: ownWorkoutsDocs.length },
      currentWeight: weights.at(-1)?.weightKg ?? null,
      weightHistory: weights,
      records: { nutrition, water, workouts },
      goals: goalsSnap.exists ? goalsSnap.data() : null,
      totalsMayBeIncomplete: false,
    });
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
