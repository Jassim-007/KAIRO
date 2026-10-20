import { NextResponse } from "next/server";
import { adminDb } from "@/lib/server/firebase-admin";
import { requireUser, workspaceErrorResponse } from "@/lib/server/workspace-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const snapshot = await adminDb.collection("users").doc(user.uid).collection("privateUsage").doc("gemini").get();
    const data = snapshot.data();
    return NextResponse.json({ usage: data ? {
      requestCount: Number(data.requestCount ?? 0),
      inputTokens: typeof data.inputTokens === "number" ? data.inputTokens : null,
      outputTokens: typeof data.outputTokens === "number" ? data.outputTokens : null,
      estimatedCostUsd: typeof data.estimatedCostUsd === "number" ? data.estimatedCostUsd : null,
      model: typeof data.model === "string" ? data.model : null,
      lastRequestAt: data.lastRequestAt?.toDate?.().toISOString?.() ?? null,
    } : { requestCount: 0, inputTokens: null, outputTokens: null, estimatedCostUsd: null, model: null, lastRequestAt: null } });
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
