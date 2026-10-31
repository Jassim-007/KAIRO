
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
import { activeWorkspaceMemberCount } from "@/lib/server/account-deletion-policy";
import { isWorkspaceInviteExpiredOrUsed } from "@/lib/server/expiration";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);

    await enforceRateLimit(
      user.uid,
      "workspace_invite",
      5,
      60 * 60 * 1000,
    );

    const memberRef = adminDb
      .collection("workspaceMembers")
      .doc(user.uid);

    const memberSnapshot = await memberRef.get();

    if (!memberSnapshot.exists) {
      throw new WorkspaceError(
        "You don't belong to a workspace.",
        404,
      );
    }

    const membership = memberSnapshot.data()!;
    const workspaceId = membership.workspaceId;

    if (typeof workspaceId !== "string" || !workspaceId) {
      throw new WorkspaceError(
        "Your workspace membership is invalid.",
        403,
      );
    }

    const inviteCode = randomBytes(8).toString("hex").toUpperCase();

    const inviteHash = createHash("sha256")
      .update(inviteCode)
      .digest("hex");

    const now = Timestamp.now();

    const expiresAt = Timestamp.fromMillis(
      now.toMillis() + 24 * 60 * 60 * 1000,
    );

    const workspaceRef = adminDb
      .collection("workspaces")
      .doc(workspaceId);

    const inviteRef = adminDb
      .collection("workspaceInvites")
      .doc(inviteHash);

    await adminDb.runTransaction(async (transaction) => {
      const [currentMember, workspaceSnapshot] =
        await Promise.all([
          transaction.get(memberRef),
          transaction.get(workspaceRef),
        ]);

      if (
        !currentMember.exists ||
        currentMember.data()?.workspaceId !== workspaceId
      ) {
        throw new WorkspaceError(
          "Workspace membership could not be verified.",
          403,
        );
      }
      if (currentMember.data()?.role !== "owner") {
        throw new WorkspaceError("Only the workspace owner can create invitations.", 403);
      }

      if (!workspaceSnapshot.exists) {
        throw new WorkspaceError(
          "Workspace not found.",
          404,
        );
      }

      const workspace = workspaceSnapshot.data()!;

      if (workspace.status === "deleting") {
        throw new WorkspaceError(
          "This workspace is being deleted.",
          410,
        );
      }

      const members = await transaction.get(adminDb.collection("workspaceMembers").where("workspaceId", "==", workspaceId));
      if (activeWorkspaceMemberCount(members.docs.map((doc) => doc.data())) >= 2) {
        throw new WorkspaceError("That workspace already has two members.", 409);
      }

      // Opportunistically remove expired/consumed invite documents for this
      // workspace whenever its owner creates a replacement. This keeps cleanup
      // request-driven and avoids paid TTL or scheduled infrastructure.
      const existingInvites = await transaction.get(
        adminDb
          .collection("workspaceInvites")
          .where("workspaceId", "==", workspaceId)
          .limit(400),
      );
      for (const existingInvite of existingInvites.docs) {
        const data = existingInvite.data();
        const oldExpiresAt = data.expiresAt as Timestamp | undefined;
        const expiry =
          oldExpiresAt && typeof oldExpiresAt.toMillis === "function"
            ? oldExpiresAt.toMillis()
            : undefined;
        if (
          isWorkspaceInviteExpiredOrUsed(
            expiry,
            Number(data.uses ?? 0),
            Number(data.maxUses ?? 1),
            now.toMillis(),
          )
        ) {
          transaction.delete(existingInvite.ref);
        }
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
