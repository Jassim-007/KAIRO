
import "server-only";

import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/server/firebase-admin";

export class WorkspaceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "WorkspaceError";
  }
}

export async function requireUser(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new WorkspaceError("Please sign in to continue.", 401);
  }

  const token = authorization.slice("Bearer ".length).trim();

  if (!token) {
    throw new WorkspaceError("Please sign in to continue.", 401);
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token, true);
    if (decoded.firebase?.sign_in_provider === "password" && decoded.email_verified !== true) {
      throw new WorkspaceError("Verify your email before using your account.", 403);
    }
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      displayName: decoded.name ?? null,
    };
  } catch (error) {
    if (error instanceof WorkspaceError) throw error;
    throw new WorkspaceError("Your session is invalid. Please sign in again.", 401);
  }
}

/**
 * A persistent per-user rate limit stored in Firestore.
 * Each API operation uses its own counter document.
 */
export async function enforceRateLimit(
  uid: string,
  action: string,
  maxRequests: number,
  windowMs: number,
) {
  const safeAction = action.replace(/[^a-zA-Z0-9_-]/g, "_");
  const ref = adminDb
    .collection("apiRateLimits")
    .doc(`${uid}_${safeAction}`);

  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const now = Date.now();

    const data = snapshot.data();
    const windowStartedAt =
      data?.windowStartedAt instanceof Timestamp
        ? data.windowStartedAt.toMillis()
        : 0;

    const count =
      windowStartedAt > 0 && now - windowStartedAt < windowMs
        ? Number(data?.count ?? 0)
        : 0;

    if (count >= maxRequests) {
      throw new WorkspaceError(
        "Too many requests. Please wait before trying again.",
        429,
      );
    }

    const nextWindowStart =
      count === 0 ? Timestamp.fromMillis(now) : data?.windowStartedAt;

    transaction.set(ref, {
      windowStartedAt: nextWindowStart,
      count: count + 1,
      updatedAt: Timestamp.fromMillis(now),
    });
  });
}

export function workspaceErrorResponse(error: unknown) {
  if (error instanceof WorkspaceError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }

  console.error("Workspace API error:", error);

  return NextResponse.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 },
  );
}
