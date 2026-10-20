
import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
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

    await enforceRateLimit(
      user.uid,
      "workspace_invite",
      5,
      60 * 60 * 1000,
    );

    const memberRef = adminDb.collection("workspaceMembers").doc(user.uid);
    const memberSnapshot = await memberRef.get();

    if (!memberSnapshot.exists) {
      throw new WorkspaceError("You don't belong to a workspace.", 404);
    }

    const membership = memberSnapshot.data()!;
    const workspaceId = String(membership.workspaceId);

    const inviteCode = randomBytes(8).toString("hex").toUpperCase();
    const inviteHash = createHash("sha256")
      .update(inviteCode)
      .digest("hex");

    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(
      now.toMillis() + 24 * 60 * 60 * 1000,
    );

    const workspaceRef = adminDb.collection("workspaces").doc(workspaceId);
    const inviteRef = adminDb.collection("workspaceInvites").doc(inviteHash);

    await adminDb.runTransaction(async (transaction) => {
      const [currentMember, workspaceSnapshot] = await Promise.all([
        transaction.get(memberRef),
        transaction.get(workspaceRef),
      ]);

      if (
        !currentMember.exists ||
        currentMember.data()?.workspaceId !== workspaceId
      ) {
        throw new WorkspaceError("Workspace membership could not be verified.", 403);
      }

      if (!workspaceSnapshot.exists) {
        throw new WorkspaceError("Workspace not found.", 404);
      }

      transaction.create(inviteRef, {
        workspaceId,
        createdBy: user.uid,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt,
        uses: 0,
        maxUses: 1,
      });
    });

    return NextResponse.json({
      inviteCode,
      expiresAt: expiresAt.toDate().toISOString(),
    });
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
