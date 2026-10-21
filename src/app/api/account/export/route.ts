import { NextResponse } from "next/server";
import type { QuerySnapshot } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/firebase-admin";
import { enforceRateLimit, requireUser, workspaceErrorResponse } from "@/lib/server/workspace-security";
import { getUserFitnessRoot } from "@/lib/server/nutrition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function records(snapshot: QuerySnapshot) {
  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
}

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    await enforceRateLimit(user.uid, "account_data_export", 5, 60 * 60 * 1000);
    const { root } = await getUserFitnessRoot(user.uid);
    const profileRef = adminDb.collection("users").doc(user.uid);

    const [profile, nutrition, water, weight, workouts, fitnessGoals, waterGoals, plan, memory, exercises] = await Promise.all([
      profileRef.get(),
      root.collection("nutrition").where("loggedBy", "==", user.uid).get(),
      root.collection("water").where("loggedBy", "==", user.uid).get(),
      root.collection("weight").where("subjectUid", "==", user.uid).get(),
      root.collection("workouts").where("subjectUid", "==", user.uid).get(),
      root.collection("fitnessGoals").doc(user.uid).get(),
      root.collection("waterGoals").doc(user.uid).get(),
      root.collection("fitnessPlans").doc(user.uid).get(),
      profileRef.collection("fitnessMemory").doc("chat").get(),
      root.collection("exerciseLibraries").doc(user.uid).collection("exercises").get(),
    ]);

    const exportData = {
      format: "form-ai-fitness-personal-data",
      version: 1,
      generatedAt: new Date().toISOString(),
      account: {
        uid: user.uid,
        email: user.email,
        profile: profile.exists ? {
          displayName: profile.data()?.displayName ?? null,
          photoURL: profile.data()?.photoURL ?? null,
          gender: profile.data()?.gender ?? null,
          createdAt: profile.data()?.createdAt ?? null,
          updatedAt: profile.data()?.updatedAt ?? null,
        } : null,
      },
      fitness: {
        nutrition: records(nutrition),
        water: records(water),
        weight: records(weight),
        workoutsAboutYou: records(workouts),
        goals: fitnessGoals.exists ? fitnessGoals.data() : null,
        waterGoal: waterGoals.exists ? waterGoals.data() : null,
        workoutPlan: plan.exists ? plan.data() : null,
        exerciseLibrary: records(exercises),
      },
      aiMemory: memory.exists ? memory.data() : null,
      scope: {
        workoutsAboutYou: "Includes this account's workout records from personal storage or its shared workspace, including workouts logged by a partner where available.",
        excluded: ["other members' profiles and personal records", "workspace invitations and membership data", "authentication credentials", "API rate-limit and usage metadata", "Firebase Storage files"],
      },
    };

    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="fitness-data-${date}.json"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
