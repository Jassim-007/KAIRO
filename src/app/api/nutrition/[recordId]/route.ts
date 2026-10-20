import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/server/firebase-admin";
import {
  enforceRateLimit,
  requireUser,
  workspaceErrorResponse,
  WorkspaceError,
} from "@/lib/server/workspace-security";
import {
  getUserWorkspace,
  validateNutrition,
} from "@/lib/server/nutrition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ recordId: string }>;
};

async function getRecordReference(
  workspaceId: string,
  recordId: string,
  uid: string,
) {
  if (
    !recordId ||
    recordId.length > 150 ||
    recordId.includes("/")
  ) {
    throw new WorkspaceError(
      "Invalid nutrition record ID.",
      400,
    );
  }

  const ref = adminDb
    .collection("workspaces")
    .doc(workspaceId)
    .collection("nutrition")
    .doc(recordId);

  const snapshot = await ref.get();

  if (!snapshot.exists) {
    throw new WorkspaceError(
      "Nutrition entry not found.",
      404,
    );
  }

  if (snapshot.data()?.loggedBy !== uid) throw new WorkspaceError("This nutrition entry is private to its owner.", 403);

  return ref;
}

/** PATCH /api/nutrition/:recordId */
export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  try {
    const user = await requireUser(request);

    await enforceRateLimit(
      user.uid,
      "nutrition_update",
      60,
      60 * 60 * 1000,
    );

    const { recordId } = await context.params;
    const workspaceId = await getUserWorkspace(user.uid);
    const recordRef = await getRecordReference(
      workspaceId,
      recordId,
      user.uid,
    );

    const body = await request.json().catch(() => null);
    const entry = validateNutrition(body);

    await recordRef.update({
      ...entry,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      recordId,
    });
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}

/** DELETE /api/nutrition/:recordId */
export async function DELETE(
  request: Request,
  context: RouteContext,
) {
  try {
    const user = await requireUser(request);

    await enforceRateLimit(
      user.uid,
      "nutrition_delete",
      30,
      60 * 60 * 1000,
    );

    const { recordId } = await context.params;
    const workspaceId = await getUserWorkspace(user.uid);
    const recordRef = await getRecordReference(
      workspaceId,
      recordId,
      user.uid,
    );

    await recordRef.delete();

    return NextResponse.json({
      success: true,
      recordId,
    });
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}