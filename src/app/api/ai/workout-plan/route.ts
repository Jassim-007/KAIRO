import { NextResponse } from "next/server";
import { requireUser, workspaceErrorResponse, WorkspaceError } from "@/lib/server/workspace-security";
import { recordGeminiUsage } from "@/lib/server/gemini-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validatePlan(value: unknown) {
  if (!value || typeof value !== "object") throw new WorkspaceError("I couldn't shape that into a workout plan. Try asking me again.", 502);
  const plan = value as Record<string, unknown>;
  if (typeof plan.focus !== "string" || typeof plan.warmup !== "string" || typeof plan.coachTip !== "string" || !Array.isArray(plan.exercises)) {
    throw new WorkspaceError("I couldn't shape that into a workout plan. Try asking me again.", 502);
  }
  const exercises = plan.exercises.slice(0, 6).flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const exercise = raw as Record<string, unknown>;
    if (typeof exercise.name !== "string" || !exercise.name.trim() || typeof exercise.reps !== "string") return [];
    const weightKg = typeof exercise.weightKg === "number" && Number.isFinite(exercise.weightKg) && exercise.weightKg >= 0 && exercise.weightKg <= 500 ? exercise.weightKg : null;
    return [{
      name: exercise.name.slice(0, 80),
      sets: typeof exercise.sets === "number" && Number.isFinite(exercise.sets) ? Math.min(6, Math.max(1, Math.round(exercise.sets))) : 3,
      reps: exercise.reps.slice(0, 30),
      weightKg,
      restSeconds: typeof exercise.restSeconds === "number" && Number.isFinite(exercise.restSeconds) ? Math.min(300, Math.max(0, Math.round(exercise.restSeconds))) : 90,
      why: typeof exercise.why === "string" ? exercise.why.slice(0, 180) : "",
    }];
  });
  if (!exercises.length) throw new WorkspaceError("I couldn't shape that into a workout plan. Try asking me again.", 502);
  return { focus: plan.focus.slice(0, 100), warmup: plan.warmup.slice(0, 300), exercises, coachTip: plan.coachTip.slice(0, 300) };
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = await request.json().catch(() => null) as { text?: unknown; date?: unknown } | null;
    if (typeof body?.text !== "string" || !body.text.trim() || body.text.length > 2000) {
      throw new WorkspaceError("Tell me what kind of workout you're looking for.", 400);
    }
    if (!isDate(body.date)) throw new WorkspaceError("Choose a valid date.", 400);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new WorkspaceError("AI workout planning isn't configured yet. Add a Gemini API key on the server to turn it on.", 503);
    const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
    const prompt = [
      "You are the user's friendly workout buddy. Answer naturally and warmly, like a helpful friend, not a formal trainer.",
      "Create a practical workout plan for the requested date. Give a concise conversational reply and a structured session with 3 to 6 exercises, warm-up guidance, sets, rep ranges, and a short reason or cue for each movement. Include sensible rest times and one friendly coaching tip.",
      "You do not know the user's exercise history or available equipment. Ask for clarification only if the requested goal is impossible to answer; otherwise provide a balanced general plan. Use null for all weightKg values and tell the user to choose a comfortable load that leaves a few reps in reserve. Never imply that a suggested load is guaranteed safe or exact.",
      "Do not suggest more than 6 exercises. For rest or reported pain, recommend rest or a pain-free alternative without forcing a workout. Do not diagnose or prescribe treatment.",
      "Return one JSON object only with fields: reply (string), plan (object with focus string, warmup string, exercises array of objects with name string, sets number, reps string, weightKg number or null, restSeconds number, why string, and coachTip string).",
      "Requested date: " + body.date,
      "User's message: " + body.text.trim(),
    ].join("\n");
    const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent";
    try { await recordGeminiUsage(user.uid, model, undefined); } catch (usageError) { console.error("Gemini usage tracking failed", usageError); }
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.2 } }),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) {
      const provider = await response.json().catch(() => null) as { error?: { message?: unknown } } | null;
      const providerMessage = typeof provider?.error?.message === "string" ? provider.error.message.replaceAll(apiKey, "[redacted]").slice(0, 300) : "";
      console.error("Gemini workout plan failed", { status: response.status, message: providerMessage });
      if (response.status === 429) throw new WorkspaceError("Gemini's busy right now. Try me again in a bit.", 429);
      if (response.status === 402 || /prepay|no credits|credit balance|billing.*required/i.test(providerMessage.toLowerCase())) {
        throw new WorkspaceError("Gemini's project doesn't have active credits right now. Check the API key's project and try again.", 503);
      }
      throw new WorkspaceError("I couldn't put that workout together just now. Try again in a bit.", 502);
    }
    const result = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: Record<string, unknown> };
    try { await recordGeminiUsage(user.uid, model, result.usageMetadata, false); } catch (usageError) { console.error("Gemini usage tracking failed", usageError); }
    const output = result.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
    if (!output) throw new WorkspaceError("I lost that workout reply. Try asking me again?", 502);
    const parsed = JSON.parse(output) as { reply?: unknown; plan?: unknown };
    const reply = typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim().slice(0, 500) : "Got you — here's a plan to get you moving.";
    return NextResponse.json({ reply, plan: validatePlan(parsed.plan) });
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}



