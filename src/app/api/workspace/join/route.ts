

import { createHash } from "node:crypto";
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
import { activeWorkspaceMemberCount } from "@/lib/server/account-deletion-policy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);

    await enforceRateLimit(
      user.uid,
      "workspace_join",
      5,
      60 * 60 * 1000,
    );

    const body = await request.json().catch(() => null);

    const inviteCode =
      typeof body?.inviteCode === "string"
        ? body.inviteCode.trim().toUpperCase()
        : "";

    if (!/^[A-F0-9]{16}$/.test(inviteCode)) {
      throw new WorkspaceError(
        "Enter a valid 16-character invite code.",
        400,
      );
    }

    const inviteHash = createHash("sha256")
      .update(inviteCode)
      .digest("hex");

    const inviteRef = adminDb
      .collection("workspaceInvites")
      .doc(inviteHash);

    const memberRef = adminDb
      .collection("workspaceMembers")
      .doc(user.uid);

    await adminDb.runTransaction(async (transaction) => {
      const [memberSnapshot, inviteSnapshot] =
        await Promise.all([
          transaction.get(memberRef),
          transaction.get(inviteRef),
        ]);

      if (memberSnapshot.exists) {
        throw new WorkspaceError(
          "Your account already belongs to a workspace.",
          409,
        );
      }

      if (!inviteSnapshot.exists) {
        throw new WorkspaceError(
          "That invite code is invalid.",
          404,
        );
      }

      const invite = inviteSnapshot.data()!;
      const expiresAt = invite.expiresAt as Timestamp;

      if (
        !expiresAt ||
        typeof expiresAt.toMillis !== "function" ||
        expiresAt.toMillis() <= Date.now() ||
        Number(invite.uses ?? 0) >= Number(invite.maxUses ?? 1)
      ) {
        throw new WorkspaceError(
          "That invite has expired or has already been used.",
          410,
        );
      }

      if (typeof invite.workspaceId !== "string" || !invite.workspaceId) {
        throw new WorkspaceError(
          "That invitation is invalid.",
          400,
        );
      }

      const workspaceRef = adminDb
        .collection("workspaces")
        .doc(invite.workspaceId);

      const [workspaceSnapshot, workspaceMembers] = await Promise.all([
        transaction.get(workspaceRef),
        transaction.get(adminDb.collection("workspaceMembers").where("workspaceId", "==", invite.workspaceId)),
      ]);

      if (!workspaceSnapshot.exists) {
        throw new WorkspaceError(
          "That workspace no longer exists.",
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

      const activeCount = activeWorkspaceMemberCount(workspaceMembers.docs.map((doc) => doc.data()));
      if (activeCount >= 2) {
        throw new WorkspaceError(
          "That workspace already has two members.",
          409,
        );
      }

      transaction.create(memberRef, {
        workspaceId: workspaceRef.id,
        role: "member",
        joinedAt: FieldValue.serverTimestamp(),
        email: user.email,
        displayName: user.displayName,
      });

      transaction.update(inviteRef, {
        uses: FieldValue.increment(1),
        usedBy: user.uid,
        usedAt: FieldValue.serverTimestamp(),
      });

      transaction.update(workspaceRef, {
        memberCount: activeCount + 1,
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
