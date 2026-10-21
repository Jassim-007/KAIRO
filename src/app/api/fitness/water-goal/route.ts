import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { enforceRateLimit, requireUser, workspaceErrorResponse, WorkspaceError } from "@/lib/server/workspace-security";
import { getUserFitnessRoot } from "@/lib/server/nutrition";
export const runtime = "nodejs";
export async function GET(request: Request) { try { const user = await requireUser(request); const { root } = await getUserFitnessRoot(user.uid); const snap = await root.collection("waterGoals").doc(user.uid).get(); return NextResponse.json({ goalMl: snap.exists ? snap.data()?.goalMl ?? 2000 : 2000 }); } catch (error) { return workspaceErrorResponse(error); } }
export async function PUT(request: Request) { try { const user = await requireUser(request); await enforceRateLimit(user.uid, "water_goal_update", 10, 3600000); const body = await request.json().catch(() => null); const goalMl = body && typeof body.goalMl === "number" ? body.goalMl : NaN; if (!Number.isFinite(goalMl) || goalMl < 250 || goalMl > 10000) throw new WorkspaceError("Water goal must be between 250 and 10,000 ml.", 400); const { root } = await getUserFitnessRoot(user.uid); await root.collection("waterGoals").doc(user.uid).set({ goalMl, updatedAt: FieldValue.serverTimestamp() }); return NextResponse.json({ success: true, goalMl }); } catch (error) { return workspaceErrorResponse(error); } }
