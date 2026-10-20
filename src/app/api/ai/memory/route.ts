
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/server/firebase-admin";
import {
  enforceRateLimit,
  ensureAccountActive,
  requireUser,
  workspaceErrorResponse,
  WorkspaceError,
} from "@/lib/server/workspace-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function chatRef(uid: string) {
  return adminDb
    .collection("users")
    .doc(uid)
    .collection("fitnessMemory")
    .doc("chat");
}

function savedPlan(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const plan = value as Record<string, unknown>;

  if (
    typeof plan.focus !== "string" ||
    typeof plan.warmup !== "string" ||
    typeof plan.coachTip !== "string" ||
    !Array.isArray(plan.exercises)
  ) {
    return undefined;
  }

  const exercises = plan.exercises.slice(0, 6).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const exercise = item as Record<string, unknown>;

    if (
      typeof exercise.name !== "string" ||
      !exercise.name.trim() ||
      typeof exercise.reps !== "string"
    ) {
      return [];
    }

    const weightKg =
      typeof exercise.weightKg === "number" &&
      Number.isFinite(exercise.weightKg) &&
      exercise.weightKg >= 0 &&
      exercise.weightKg <= 500
        ? exercise.weightKg
        : null;

    return [
      {
        name: exercise.name.slice(0, 80),
        sets:
          typeof exercise.sets === "number" &&
          Number.isFinite(exercise.sets)
            ? Math.min(6, Math.max(1, Math.round(exercise.sets)))
            : 3,
        reps: exercise.reps.slice(0, 30),
        weightKg,
        restSeconds:
          typeof exercise.restSeconds === "number" &&
          Number.isFinite(exercise.restSeconds)
            ? Math.min(300, Math.max(0, Math.round(exercise.restSeconds)))
            : 90,
        why: typeof exercise.why === "string"
          ? exercise.why.slice(0, 180)
          : "",
      },
    ];
  });

  return exercises.length
    ? {
        focus: plan.focus.slice(0, 100),
        warmup: plan.warmup.slice(0, 300),
        exercises,
        coachTip: plan.coachTip.slice(0, 300),
      }
    : undefined;
}

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);

    await ensureAccountActive(user.uid);
    await enforceRateLimit(
      user.uid,
      "ai_memory_read",
      120,
      3600000,
    );

    const snap = await chatRef(user.uid).get();
    const messages =
      snap.exists && Array.isArray(snap.data()?.messages)
        ? snap.data()!.messages.slice(-80)
        : [];

    return NextResponse.json({ messages });
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);

    await ensureAccountActive(user.uid);
    await enforceRateLimit(
      user.uid,
      "ai_memory_write",
      120,
      3600000,
    );

    const body = await request.json().catch(() => null);

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      !Array.isArray(body.messages) ||
      body.messages.length > 4
    ) {
      throw new WorkspaceError(
        "Provide one conversation turn at a time.",
        400,
      );
    }

    const messages = body.messages.map((value: unknown) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new WorkspaceError("Invalid chat message.", 400);
      }

      const item = value as Record<string, unknown>;

      if (
        !["user", "assistant"].includes(String(item.role)) ||
        typeof item.content !== "string" ||
        !item.content.trim() ||
        item.content.length > 2000
      ) {
        throw new WorkspaceError(
          "Chat messages must be valid and under 4,000 characters.",
          400,
        );
      }

      const plan =
        item.role === "assistant"
          ? savedPlan(item.workoutPlan)
          : undefined;

      return {
        role: item.role,
        content: item.content.trim(),
        ...(plan ? { workoutPlan: plan } : {}),
        createdAt: new Date().toISOString(),
      };
    });

    const ref = chatRef(user.uid);

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const old =
        snap.exists && Array.isArray(snap.data()?.messages)
          ? snap.data()!.messages
          : [];

      tx.set(ref, {
        ownerUid: user.uid,
        messages: [...old, ...messages].slice(-80),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
