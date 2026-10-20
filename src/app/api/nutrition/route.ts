import { NextResponse } from "next/server";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/firebase-admin";
import {
  enforceRateLimit,
  requireUser,
  workspaceErrorResponse,
  WorkspaceError,
} from "@/lib/server/workspace-security";
import { getUserWorkspace, validateNutrition } from "@/lib/server/nutrition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/nutrition?date=YYYY-MM-DD&cursor=recordId */
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    await enforceRateLimit(user.uid, "nutrition_list", 120, 60 * 60 * 1000);

    const params = new URL(request.url).searchParams;
    const date = params.get("date");
    if (date !== null) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new WorkspaceError("Choose a valid meal date.", 400);
      }
      const parsedDate = new Date(`${date}T00:00:00.000Z`);
      if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
        throw new WorkspaceError("Choose a valid meal date.", 400);
      }
    }

    const workspaceId = await getUserWorkspace(user.uid);
    const collection = adminDb.collection("workspaces").doc(workspaceId).collection("nutrition");
    let query = collection.orderBy(FieldPath.documentId(), "desc");
    if (date) query = query.where("date", "==", date) as typeof query;

    const cursor = params.get("cursor");
    if (cursor) {
      if (cursor.length > 150 || cursor.includes("/")) {
        throw new WorkspaceError("Invalid nutrition page cursor.", 400);
      }
      const cursorSnapshot = await collection.doc(cursor).get();
      if (!cursorSnapshot.exists) throw new WorkspaceError("Invalid nutrition page cursor.", 400);
      query = query.startAfter(cursorSnapshot);
    }

    const snapshot = await query.limit(101).get();
    const hasMore = snapshot.docs.length > 100;
    const page = snapshot.docs.slice(0, 100);
    const visiblePage = page.filter((doc) => doc.data().loggedBy === user.uid);
    const records = visiblePage.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? null,
      };
    });

    return NextResponse.json({ records, hasMore, nextCursor: hasMore ? page.at(-1)?.id ?? null : null });
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
/** POST /api/nutrition */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    await enforceRateLimit(user.uid, "nutrition_create", 60, 60 * 60 * 1000);

    const body = await request.json().catch(() => null);
    const entry = validateNutrition(body);
    const aiEstimated = Boolean(body && typeof body === "object" && !Array.isArray(body) && (body as Record<string, unknown>).aiEstimated === true);
    const workspaceId = await getUserWorkspace(user.uid);
    const recordRef = adminDb
      .collection("workspaces")
      .doc(workspaceId)
      .collection("nutrition")
      .doc();

    await recordRef.create({
      ...entry,
      aiEstimated,
      loggedBy: user.uid,
      loggedByName: user.displayName ?? user.email ?? "Member",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, recordId: recordRef.id }, { status: 201 });
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}

