import "server-only";

import { adminDb } from "@/lib/server/firebase-admin";
import { ensureAccountActive, WorkspaceError } from "@/lib/server/workspace-security";

export const MEAL_TYPES = [
  "Breakfast",
  "Lunch",
  "Dinner",
  "Snack",
  "Pre-workout",
  "Post-workout",
] as const;

export type MealType = (typeof MEAL_TYPES)[number];

export type NutritionInput = {
  foodName: string;
  mealType: MealType;
  servings: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  date: string;
  notes: string;
};

export function validateNutrition(body: unknown): NutritionInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new WorkspaceError("Please provide a valid food entry.", 400);
  }

  const data = body as Record<string, unknown>;
  const foodName = typeof data.foodName === "string" ? data.foodName.trim() : "";

  if (!foodName || foodName.length > 120) {
    throw new WorkspaceError("Food name must contain 1–120 characters.", 400);
  }

  if (typeof data.mealType !== "string" || !MEAL_TYPES.includes(data.mealType as MealType)) {
    throw new WorkspaceError("Select a valid meal type.", 400);
  }

  const numericFields = [
    ["servings", 0.01, 100],
    ["calories", 0, 10000],
    ["protein", 0, 1000],
    ["carbs", 0, 1000],
    ["fat", 0, 1000],
  ] as const;
  const numbers: Record<string, number> = {};

  for (const [field, min, max] of numericFields) {
    const value = data[field];
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
      throw new WorkspaceError(`${field} must be a number between ${min} and ${max}.`, 400);
    }
    numbers[field] = value;
  }

  const date = typeof data.date === "string" ? data.date : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new WorkspaceError("Choose a valid meal date.", 400);
  }
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    throw new WorkspaceError("Choose a valid meal date.", 400);
  }

  const notes = typeof data.notes === "string" ? data.notes.trim() : "";
  if (notes.length > 500) {
    throw new WorkspaceError("Notes must be 500 characters or fewer.", 400);
  }

  return {
    foodName,
    mealType: data.mealType as MealType,
    servings: numbers.servings,
    calories: numbers.calories,
    protein: numbers.protein,
    carbs: numbers.carbs,
    fat: numbers.fat,
    date,
    notes,
  };
}

export async function getUserWorkspace(uid: string) {
  const membershipSnapshot = await adminDb.collection("workspaceMembers").doc(uid).get();
  if (!membershipSnapshot.exists) {
    throw new WorkspaceError("Join or create a workspace before tracking nutrition.", 404);
  }
  const membership = membershipSnapshot.data()!;
  const workspaceId = membership.workspaceId;
  if (typeof workspaceId !== "string" || !workspaceId) {
    throw new WorkspaceError("Your workspace membership is invalid.", 403);
  }
  if (membership.status === "deleting") {
    throw new WorkspaceError("Your account is being deleted. Please try again later.", 410);
  }
  const workspaceSnapshot = await adminDb.collection("workspaces").doc(workspaceId).get();
  if (!workspaceSnapshot.exists) {
    throw new WorkspaceError("Your workspace could not be found.", 404);
  }
  if (workspaceSnapshot.data()?.status === "deleting") {
    throw new WorkspaceError("This workspace is being deleted. Please try again later.", 410);
  }
  return workspaceId;
}

/** Shared members keep workspace storage; solo accounts use only their user document. */
export async function getUserFitnessRoot(uid: string) {
  await ensureAccountActive(uid);
  const membershipSnapshot = await adminDb.collection("workspaceMembers").doc(uid).get();
  if (!membershipSnapshot.exists) {
    return { root: adminDb.collection("users").doc(uid), workspaceId: null as string | null };
  }
  const workspaceId = await getUserWorkspace(uid);
  return { root: adminDb.collection("workspaces").doc(workspaceId), workspaceId };
}
