
import { NextResponse } from "next/server";
import { FieldPath, FieldValue } from "firebase-admin/firestore";

import {
  enforceRateLimit,
  requireUser,
  workspaceErrorResponse,
  WorkspaceError,
} from "@/lib/server/workspace-security";
import {
  getUserFitnessRoot,
  validateNutrition,
} from "@/lib/server/nutrition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";



/** GET /api/nutrition?date=YYYY-MM-DD&cursor=recordId */
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);

    await enforceRateLimit(
      user.uid,
      "nutrition_list",
      120,
      60 * 60 * 1000,
    );

    const params = new URL(request.url).searchParams;
    const date = params.get("date");

    if (date !== null) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new WorkspaceError(
          "Choose a valid meal date.",
          400,
        );
      }

      const parsedDate = new Date(`${date}T00:00:00.000Z`);

      if (
        Number.isNaN(parsedDate.getTime()) ||
        parsedDate.toISOString().slice(0, 10) !== date
      ) {
        throw new WorkspaceError(
          "Choose a valid meal date.",
          400,
        );
      }
    }

    const { root } = await getUserFitnessRoot(user.uid);

    const collection = root.collection("nutrition");

    // Filter by the authenticated owner before pagination.
    let query = collection.where("loggedBy", "==", user.uid);

    if (date !== null) {
      query = query.where("date", "==", date);
    }

    query = query
      .orderBy("date", "desc")
      .orderBy(FieldPath.documentId(), "desc");

    const cursor = params.get("cursor");

    if (cursor) {
      if (cursor.length > 150 || cursor.includes("/")) {
        throw new WorkspaceError(
          "Invalid nutrition page cursor.",
          400,
        );
      }

      const cursorSnapshot = await collection.doc(cursor).get();

      if (!cursorSnapshot.exists) {
        throw new WorkspaceError(
          "Invalid nutrition page cursor.",
          400,
        );
      }

      const cursorData = cursorSnapshot.data()!;

      // A cursor must belong to this user and match the active date filter.
      if (
        cursorData.loggedBy !== user.uid ||
        typeof cursorData.date !== "string" ||
        (date !== null && cursorData.date !== date)
      ) {
        throw new WorkspaceError(
          "Invalid nutrition page cursor.",
          400,
        );
      }

      query = query.startAfter(
        cursorData.date,
        cursorSnapshot.id,
      );
    }

    const snapshot = await query.limit(101).get();

    const hasMore = snapshot.docs.length > 100;
    const page = snapshot.docs.slice(0, 100);

    const records = page.map((doc) => {
      const data = doc.data();

      return {
        id: doc.id,
        ...data,
        createdAt:
          data.createdAt?.toDate?.()?.toISOString?.() ?? null,
        updatedAt:
          data.updatedAt?.toDate?.()?.toISOString?.() ?? null,
      };
    });

    return NextResponse.json({
      records,
      hasMore,
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
    });
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}

/** POST /api/nutrition */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);

    await enforceRateLimit(
      user.uid,
      "nutrition_create",
      60,
      60 * 60 * 1000,
    );

    const body = await request.json().catch(() => null);
    const entry = validateNutrition(body);

    const aiEstimated = Boolean(
      body &&
        typeof body === "object" &&
        !Array.isArray(body) &&
        (body as Record<string, unknown>).aiEstimated === true,
    );

    const { root } = await getUserFitnessRoot(user.uid);

    const recordRef = root.collection("nutrition")
      .doc();

    await recordRef.create({
      ...entry,
      aiEstimated,
      loggedBy: user.uid,
      loggedByName:
        user.displayName ?? user.email ?? "Member",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json(
      {
        success: true,
        recordId: recordRef.id,
      },
      { status: 201 },
    );
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
