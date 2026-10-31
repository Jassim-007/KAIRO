
import {
  FieldPath,
  FieldValue,
  type Query,
} from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import {
  enforceRateLimit,
  requireUser,
  workspaceErrorResponse,
  WorkspaceError,
} from "@/lib/server/workspace-security";
import { getUserFitnessRoot } from "@/lib/server/nutrition";
import { parseFitnessEntry } from "@/lib/server/fitness";
import { workoutIdempotencyDocumentId } from "@/lib/server/request-policies";
import { readBoundedJson, RequestBodyTooLarge } from "@/lib/server/request-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Kind = "water" | "weight" | "workouts";

function dateValue(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new WorkspaceError("Choose a valid date.", 400);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new WorkspaceError("Choose a valid date.", 400);
  return value;
}

const kinds: Kind[] = ["water", "weight", "workouts"];

async function context(
  request: Request,
  params: Promise<{ kind: string }>,
) {
  const user = await requireUser(request);
  const { kind } = await params;

  if (!kinds.includes(kind as Kind)) {
    throw new WorkspaceError("Unknown fitness tracker.", 404);
  }
  return { user, kind: kind as Kind };
}

function buildListQuery(
  collection: FirebaseFirestore.CollectionReference,
  kind: Kind,
  uid: string,
  date: string | null,
) {
  let query: Query = collection;

  if (kind === "water") {
    query = query.where("loggedBy", "==", uid);
  } else if (kind === "weight") {
    query = query.where("subjectUid", "==", uid);
  }

  if (date !== null) {
    query = query.where("date", "==", date);
  }

  return query.orderBy("date", "desc").orderBy(
    FieldPath.documentId(),
    "desc",
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  try {
    const { user, kind } = await context(
      request,
      params,
    );

    await enforceRateLimit(
      user.uid,
      `fitness_${kind}_list`,
      120,
      3600000,
    );

    const { root } = await getUserFitnessRoot(user.uid);
    const collection = root.collection(kind);

    const url = new URL(request.url);
    const date = url.searchParams.get("date");

    if (date !== null) {
      dateValue(date);
    }

    let query = buildListQuery(
      collection,
      kind,
      user.uid,
      date,
    );

    const cursor = url.searchParams.get("cursor");

    if (cursor) {
      if (cursor.length > 150 || cursor.includes("/")) {
        throw new WorkspaceError(
          "Invalid page cursor.",
          400,
        );
      }

      const cursorSnapshot = await collection.doc(cursor).get();

      if (!cursorSnapshot.exists) {
        throw new WorkspaceError(
          "Invalid page cursor.",
          400,
        );
      }

      const cursorData = cursorSnapshot.data()!;

      // A cursor must belong to this query's visible result set.
      if (
        (kind === "water" && cursorData.loggedBy !== user.uid) ||
        (kind === "weight" && cursorData.subjectUid !== user.uid) ||
        (date !== null && cursorData.date !== date) ||
        typeof cursorData.date !== "string"
      ) {
        throw new WorkspaceError(
          "Invalid page cursor.",
          400,
        );
      }

      query = query.startAfter(
        cursorData.date,
        cursorSnapshot.id,
      );
    }

    const result = await query.limit(101).get();
    const hasMore = result.docs.length > 100;
    const docs = result.docs.slice(0, 100);

    const records = docs.map((doc) => {
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
      nextCursor: hasMore ? docs.at(-1)?.id ?? null : null,
    });
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  try {
    const { user, kind } =
      await context(request, params);

    await enforceRateLimit(
      user.uid,
      `fitness_${kind}_create`,
      60,
      3600000,
    );

    const { root, workspaceId } = await getUserFitnessRoot(user.uid);
    const collection = root.collection(kind);

    const body = await readBoundedJson(request, 64_000).catch((error) => {
      if (error instanceof RequestBodyTooLarge) throw new WorkspaceError("Fitness entry request is too large.", 413);
      return null;
    });

    const entry = await parseFitnessEntry(
      kind,
      body,
      user.uid,
      workspaceId,
    );

    const idempotencyKey = request.headers.get("x-idempotency-key");
    const deterministicId = kind === "workouts" && idempotencyKey
      ? workoutIdempotencyDocumentId(user.uid, idempotencyKey)
      : null;
    if (kind === "workouts" && idempotencyKey && !deterministicId) throw new WorkspaceError("Invalid idempotency key.", 400);
    const ref = deterministicId ? collection.doc(deterministicId) : collection.doc();

    try {
      await ref.create({
        ...entry,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ success: true, recordId: ref.id }, { status: 201 });
    } catch (error) {
      const code = (error as { code?: number | string }).code;
      if (code === 6 || code === "already-exists" || code === "ALREADY_EXISTS") {
        return NextResponse.json({ success: true, recordId: ref.id, alreadyCreated: true });
      }
      throw error;
    }
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
