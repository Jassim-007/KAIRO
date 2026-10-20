import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/firebase-admin";

function finiteCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}
function configuredRate(name: string): number | null {
  const value = process.env[name];
  if (!value) return null;
  const rate = Number(value);
  return Number.isFinite(rate) && rate >= 0 ? rate : null;
}

/** Records aggregate Gemini usage only; prompts and generated content are never stored. */
export async function recordGeminiUsage(uid: string, model: string, usageMetadata: Record<string, unknown> | undefined, incrementRequest = true) {
  const inputTokens = finiteCount(usageMetadata?.promptTokenCount);
  const outputTokens = finiteCount(usageMetadata?.candidatesTokenCount);
  const inputRate = configuredRate("GEMINI_INPUT_USD_PER_MILLION_TOKENS");
  const outputRate = configuredRate("GEMINI_OUTPUT_USD_PER_MILLION_TOKENS");
  const estimatedCostUsd = inputTokens !== null && outputTokens !== null && inputRate !== null && outputRate !== null
    ? (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000
    : null;
  const ref = adminDb.collection("users").doc(uid).collection("privateUsage").doc("gemini");
  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const old = snapshot.data() ?? {};
    transaction.set(ref, {
      requestCount: Number(old.requestCount ?? 0) + (incrementRequest ? 1 : 0),
      inputTokens: inputTokens === null ? old.inputTokens ?? null : Number(old.inputTokens ?? 0) + inputTokens,
      outputTokens: outputTokens === null ? old.outputTokens ?? null : Number(old.outputTokens ?? 0) + outputTokens,
      estimatedCostUsd: estimatedCostUsd === null ? old.estimatedCostUsd ?? null : Number(old.estimatedCostUsd ?? 0) + estimatedCostUsd,
      model,
      lastRequestAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

