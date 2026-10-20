import "server-only";
import { adminDb } from "@/lib/server/firebase-admin";
import { WorkspaceError } from "@/lib/server/workspace-security";
export const fitnessKinds = ["water", "weight", "workouts"] as const;
type Kind = (typeof fitnessKinds)[number];
function dateValue(value: unknown) { if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new WorkspaceError("Choose a valid date.", 400); const date = new Date(`${value}T00:00:00.000Z`); if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new WorkspaceError("Choose a valid date.", 400); return value; }
function text(value: unknown, label: string, min: number, max: number, optional = false) { if (optional && (value === undefined || value === null || value === "")) return ""; if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) throw new WorkspaceError(`${label} must contain ${min}–${max} characters.`, 400); return value.trim(); }
function finite(value: unknown, label: string, min: number, max: number) { if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new WorkspaceError(`${label} must be between ${min} and ${max}.`, 400); if ((label === "Water amount" || label === "Sets" || label === "Reps") && !Number.isInteger(value)) throw new WorkspaceError(label + " must be a whole number.", 400); return value; }
async function subject(uid: string, workspaceId: string, value: unknown) { const id = typeof value === "string" && value ? value : uid; const member = await adminDb.collection("workspaceMembers").doc(id).get(); if (!member.exists || member.data()?.workspaceId !== workspaceId) throw new WorkspaceError("Choose a member of your workspace.", 400); return { subjectUid: id, subjectName: typeof member.data()?.displayName === "string" ? member.data()!.displayName : null }; }
export async function parseFitnessEntry(kind: Kind, body: unknown, uid: string, workspaceId: string) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new WorkspaceError("Provide a valid entry.", 400);
  const data = body as Record<string, unknown>; const date = dateValue(data.date); const notes = text(data.notes, "Notes", 0, 500, true);
  if (kind === "water") return { date, amountMl: finite(data.amountMl, "Water amount", 1, 5000), notes, loggedBy: uid };
  const who = await subject(uid, workspaceId, data.subjectUid);
  if (kind === "weight") return { date, weightKg: finite(data.weightKg, "Weight", 1, 500), notes, ...who, loggedBy: uid };
  const workoutType = text(data.workoutType, "Workout type", 1, 40); if (!["Push", "Pull", "Legs", "Custom"].includes(workoutType)) throw new WorkspaceError("Choose Push, Pull, Legs, or Custom.", 400);
  if (!Array.isArray(data.exercises) || data.exercises.length < 1 || data.exercises.length > 30) throw new WorkspaceError("Add 1–30 exercises.", 400);
  const exercises = data.exercises.map((item) => { if (!item || typeof item !== "object" || Array.isArray(item)) throw new WorkspaceError("Each exercise must be valid.", 400); const exercise = item as Record<string, unknown>; const setDetails = Array.isArray(exercise.setDetails) ? exercise.setDetails.slice(0, 100).map((value) => { if (!value || typeof value !== "object" || Array.isArray(value)) throw new WorkspaceError("Each set must be valid.", 400); const set = value as Record<string, unknown>; const rir = set.rir === null || set.rir === undefined ? null : finite(set.rir, "RIR", 0, 10); if (typeof set.completed !== "boolean") throw new WorkspaceError("Set completion must be valid.", 400); return { weightKg: finite(set.weightKg, "Set weight", 0, 1000), reps: finite(set.reps, "Set reps", 1, 1000), rir, completed: set.completed }; }) : undefined; return { name: text(exercise.name, "Exercise name", 1, 80), sets: finite(exercise.sets, "Sets", 1, 100), reps: finite(exercise.reps, "Reps", 1, 1000), weightKg: finite(exercise.weightKg ?? 0, "Exercise weight", 0, 1000), ...(typeof exercise.muscle === "string" ? { muscle: exercise.muscle.slice(0, 40) } : {}), ...(typeof exercise.equipment === "string" ? { equipment: exercise.equipment.slice(0, 40) } : {}), ...(setDetails ? { setDetails } : {}) }; });
  return { date, workoutType, exercises, notes, ...(typeof data.durationMinutes === "number" && Number.isFinite(data.durationMinutes) ? { durationMinutes: Math.max(0, Math.min(1440, Math.round(data.durationMinutes))) } : {}), ...who, loggedBy: uid };
}




