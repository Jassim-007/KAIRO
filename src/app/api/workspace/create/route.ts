
import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import {
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/firebase-admin";
import {
  enforceRateLimit,
  requireUser,
  workspaceErrorResponse,
  WorkspaceError,
} from "@/lib/server/workspace-security";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    await enforceRateLimit(user.uid, "workspace_create", 3, 60 * 60 * 1000);

    const memberRef = adminDb.collection("workspaceMembers").doc(user.uid);
    const existing = await memberRef.get();

    if (existing.exists) {
      throw new WorkspaceError("Your account already belongs to a workspace.", 409);
    }

    const inviteCode = randomBytes(8).toString("hex").toUpperCase();
    const inviteHash = createHash("sha256").update(inviteCode).digest("hex");
    const workspaceRef = adminDb.collection("workspaces").doc();
    const inviteRef = adminDb.collection("workspaceInvites").doc(inviteHash);
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(
      now.toMillis() + 24 * 60 * 60 * 1000,
    );

    await adminDb.runTransaction(async (transaction) => {
      const memberSnapshot = await transaction.get(memberRef);
      if (memberSnapshot.exists) {
        throw new WorkspaceError("Your account already belongs to a workspace.", 409);
      }

      transaction.create(workspaceRef, {
        name: "Our Fitness Space",
        createdBy: user.uid,
        createdAt: FieldValue.serverTimestamp(),
        memberCount: 1,
      });

      transaction.create(memberRef, {
        workspaceId: workspaceRef.id,
        role: "owner",
        joinedAt: FieldValue.serverTimestamp(),
        email: user.email,
        displayName: user.displayName,
      });

      transaction.create(inviteRef, {
        workspaceId: workspaceRef.id,
        createdBy: user.uid,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt,
        uses: 0,
        maxUses: 1,
      });
    });

    return NextResponse.json({
      workspaceId: workspaceRef.id,
      inviteCode,
      expiresAt: expiresAt.toDate().toISOString(),
    });
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
