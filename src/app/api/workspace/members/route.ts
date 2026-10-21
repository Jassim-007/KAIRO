
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/server/firebase-admin";
import {
  enforceRateLimit,
  requireUser,
  workspaceErrorResponse,
  WorkspaceError,
} from "@/lib/server/workspace-security";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);

    await enforceRateLimit(
      user.uid,
      "workspace_members_v2",
      300,
      60 * 60 * 1000,
    );

    const membershipRef = adminDb
      .collection("workspaceMembers")
      .doc(user.uid);

    const membershipSnapshot = await membershipRef.get();

    if (!membershipSnapshot.exists) {
      const requestedDate = new URL(request.url).searchParams.get("date");
      const date = requestedDate ?? new Date().toISOString().slice(0, 10);
      const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00.000Z`) : null;
      if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
        throw new WorkspaceError("Choose a valid activity date.", 400);
      }
      return NextResponse.json({ workspace: null, members: [], activityDate: date, sharedActivity: { nutrition: [], water: [], weight: [], workouts: [] }, currentUserId: user.uid });
    }

    const membership = membershipSnapshot.data()!;

if (membership.status === "deleting") {
  throw new WorkspaceError(
    "Your account is being deleted. Please try again later.",
    410,
  );
}

const workspaceId = membership.workspaceId;

if (typeof workspaceId !== "string" || !workspaceId.trim()) {
  throw new WorkspaceError(
    "Your workspace membership is invalid.",
    403,
  );
}

    const workspaceRef = adminDb
      .collection("workspaces")
      .doc(workspaceId);

    const workspaceSnapshot = await workspaceRef.get();

    if (!workspaceSnapshot.exists) {
      throw new WorkspaceError("Your workspace could not be found.", 404);
    }
    if (workspaceSnapshot.data()?.status === "deleting") {
  throw new WorkspaceError(
    "This workspace is being deleted. Please try again later.",
    410,
  );
}

    const membersSnapshot = await adminDb
      .collection("workspaceMembers")
      .where("workspaceId", "==", workspaceId)
      .get();

    const members = membersSnapshot.docs.map((doc) => {
      const member = doc.data();

      if (member.status === "deleting" || member.status === "leaving") return null;

      return {
        uid: doc.id,
        displayName: member.displayName ?? "Member",
        email: member.email ?? null,
        role: member.role ?? "member",
        joinedAt: member.joinedAt?.toDate?.()?.toISOString?.() ?? null,
      };
    }).filter((member): member is NonNullable<typeof member> => member !== null);
    const memberNames = new Map(members.map((member) => [member.uid, String(member.displayName || "Member")]));

    const requestedDate = new URL(request.url).searchParams.get("date");
    const today = new Date().toISOString().slice(0, 10);
    const activityDate = requestedDate ?? today;
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(activityDate)
      && !Number.isNaN(new Date(`${activityDate}T00:00:00.000Z`).getTime())
      && new Date(`${activityDate}T00:00:00.000Z`).toISOString().slice(0, 10) === activityDate;
    if (!validDate) throw new WorkspaceError("Choose a valid activity date.", 400);

    const workspaceData = adminDb.collection("workspaces").doc(workspaceId);
    const [nutritionSnapshot, waterSnapshot, weightSnapshot, dailyWorkoutsSnapshot] = await Promise.all([
      workspaceData.collection("nutrition").where("date", "==", activityDate).limit(200).get(),
      workspaceData.collection("water").where("date", "==", activityDate).limit(200).get(),
      workspaceData.collection("weight").where("date", "==", activityDate).limit(200).get(),
      workspaceData.collection("workouts").where("date", "==", activityDate).limit(100).get(),
    ]);

    const meals = nutritionSnapshot.docs.map((doc) => {
      const data = doc.data();
      const loggedBy = typeof data.loggedBy === "string" ? data.loggedBy : "";
      return {
        id: doc.id, date: activityDate, loggedBy,
        loggedByName: memberNames.get(loggedBy) ?? "Workspace member",
        foodName: typeof data.foodName === "string" ? data.foodName.slice(0, 120) : "Food entry",
        mealType: typeof data.mealType === "string" ? data.mealType.slice(0, 40) : "Meal",
        servings: typeof data.servings === "number" ? data.servings : 1,
        calories: typeof data.calories === "number" ? data.calories : 0,
        protein: typeof data.protein === "number" ? data.protein : 0,
        carbs: typeof data.carbs === "number" ? data.carbs : 0,
        fat: typeof data.fat === "number" ? data.fat : 0,
        notes: typeof data.notes === "string" ? data.notes.slice(0, 500) : "",
      };
    }).filter((entry) => memberNames.has(entry.loggedBy) && entry.loggedBy !== user.uid);
    const water = waterSnapshot.docs.map((doc) => {
      const data = doc.data();
      const loggedBy = typeof data.loggedBy === "string" ? data.loggedBy : "";
      return { id: doc.id, date: activityDate, loggedBy, loggedByName: memberNames.get(loggedBy) ?? "Workspace member", amountMl: typeof data.amountMl === "number" ? data.amountMl : 0, notes: typeof data.notes === "string" ? data.notes.slice(0, 500) : "" };
    }).filter((entry) => memberNames.has(entry.loggedBy) && entry.loggedBy !== user.uid);
    const weight = weightSnapshot.docs.map((doc) => {
      const data = doc.data();
      const subjectUid = typeof data.subjectUid === "string" ? data.subjectUid : "";
      return { id: doc.id, date: activityDate, subjectUid, subjectName: memberNames.get(subjectUid) ?? "Workspace member", weightKg: typeof data.weightKg === "number" ? data.weightKg : 0, notes: typeof data.notes === "string" ? data.notes.slice(0, 500) : "" };
    }).filter((entry) => memberNames.has(entry.subjectUid) && entry.subjectUid !== user.uid);

    return NextResponse.json({
      workspace: {
        id: workspaceSnapshot.id,
        name: workspaceSnapshot.data()?.name ?? "Our Fitness Space",
        memberCount: members.length,
      },
      members,
      activityDate,
      sharedActivity: {
        nutrition: meals,
        water,
        weight,
        workouts: dailyWorkoutsSnapshot.docs.map((doc) => {
          const workout = doc.data();
          const loggedBy = typeof workout.loggedBy === "string" ? workout.loggedBy : null;
          const subjectUid = typeof workout.subjectUid === "string" ? workout.subjectUid : loggedBy;
          const exercises = Array.isArray(workout.exercises) ? workout.exercises.slice(0, 30).map((exercise: Record<string, unknown>) => ({
            name: typeof exercise.name === "string" ? exercise.name.slice(0, 80) : "Exercise",
            sets: typeof exercise.sets === "number" ? exercise.sets : 0,
            reps: typeof exercise.reps === "number" ? exercise.reps : 0,
            weightKg: typeof exercise.weightKg === "number" ? exercise.weightKg : 0,
          })) : [];
          return {
            id: doc.id,
            date: activityDate,
            workoutType: typeof workout.workoutType === "string" ? workout.workoutType : "Workout",
            subjectUid,
            subjectName: subjectUid ? memberNames.get(subjectUid) ?? null : null,
            loggedBy,
            notes: typeof workout.notes === "string" ? workout.notes.slice(0, 500) : "",
            exercises,
          };
        }).filter((workout) => workout.subjectUid && memberNames.has(workout.subjectUid) && workout.subjectUid !== user.uid),
      },
      currentUserId: user.uid,
    });
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
