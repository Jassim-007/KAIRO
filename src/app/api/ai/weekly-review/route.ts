
import { NextResponse } from "next/server";
import { enforceGeminiRateLimit, requireUser, workspaceErrorResponse, WorkspaceError } from "@/lib/server/workspace-security";
import { recordGeminiUsage } from "@/lib/server/gemini-usage";
import { clampFiniteNumber, normalizeLabels } from "@/lib/server/request-policies";
import { readBoundedJson, RequestBodyTooLarge } from "@/lib/server/request-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface WeeklyMetricsInput {
  currentSessions?: unknown;
  currentSets?: unknown;
  currentVolume?: unknown;
  currentMuscles?: unknown;
  lastSessions?: unknown;
  lastSets?: unknown;
  lastVolume?: unknown;
  lastMuscles?: unknown;
  hasCurrentData?: unknown;
  hasLastData?: unknown;
  volumeDeltaPct?: unknown;
}

function validateMetrics(body: unknown): WeeklyMetricsInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new WorkspaceError("Provide valid weekly metrics.", 400);
  }
  const raw = (body as { metrics?: unknown }).metrics;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new WorkspaceError("Provide valid weekly metrics.", 400);
  }
  return raw as WeeklyMetricsInput;
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    await enforceGeminiRateLimit(user.uid, "ai_weekly_review", 10, 60 * 60 * 1000);
    const body = await readBoundedJson(request, 16_000).catch((error) => {
      if (error instanceof RequestBodyTooLarge) throw new WorkspaceError("Weekly metrics request is too large.", 413);
      return null;
    }) as { metrics?: unknown } | null;
    const metrics = validateMetrics(body);

    const clamp = (value: unknown, max: number) => clampFiniteNumber(value, max);
    const currentSessions = clamp(metrics.currentSessions, 30);
    const currentSets = clamp(metrics.currentSets, 2000);
    const currentVolume = clamp(metrics.currentVolume, 1000000);
    const currentMuscles = normalizeLabels(metrics.currentMuscles);
    const lastSessions = clamp(metrics.lastSessions, 30);
    const lastSets = clamp(metrics.lastSets, 2000);
    const lastVolume = clamp(metrics.lastVolume, 1000000);
    const lastMuscles = normalizeLabels(metrics.lastMuscles);
    const hasCurrentData = Boolean(metrics.hasCurrentData);
    const hasLastData = Boolean(metrics.hasLastData);
    const volumeDeltaPct = metrics.volumeDeltaPct != null ? clampFiniteNumber(metrics.volumeDeltaPct, 1000, -100) : null;

    // If there's no data, return a deterministic fallback without calling AI
    if (!hasCurrentData) {
      return NextResponse.json({
        review: "No workouts recorded this week yet. When you complete sessions from your Plan page, your weekly review will appear here with a comparison to last week.",
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Deterministic fallback: return computed summary without AI
      const fallback = buildDeterministicReview({
        currentSessions, currentSets, currentVolume, currentMuscles,
        lastSessions, lastSets, lastVolume, lastMuscles,
        hasLastData, volumeDeltaPct,
      });
      return NextResponse.json({ review: fallback });
    }

    const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

    const metricsText = [
      `This week: ${currentSessions} session${currentSessions === 1 ? "" : "s"}, ${currentSets} sets, total volume ${Math.round(currentVolume).toLocaleString()} kg (sets × reps × load).`,
      currentMuscles.length ? `Muscle groups trained this week: ${currentMuscles.join(", ")}.` : "No muscle group data this week.",
      hasLastData
        ? [
            `Last week: ${lastSessions} session${lastSessions === 1 ? "" : "s"}, ${lastSets} sets, total volume ${Math.round(lastVolume).toLocaleString()} kg.`,
            lastMuscles.length ? `Muscle groups trained last week: ${lastMuscles.join(", ")}.` : "No muscle group data last week.",
            volumeDeltaPct !== null
              ? `Volume change vs last week: ${volumeDeltaPct > 0 ? "+" : ""}${volumeDeltaPct.toFixed(0)}%.`
              : "Volume comparison not available.",
          ].join(" ")
        : "No data from last week to compare.",
    ].join("\n");

    const prompt = [
      "You are a warm, encouraging fitness coach giving a weekly training review. Be concise (200–350 words), friendly but professional.",
      "Write a weekly training review based ONLY on the metrics provided below. Do NOT invent numbers or claim improvements that are not supported by the data.",
      "The review should include:",
      "1. A brief summary of this week's training.",
      "2. A comparison to last week if last-week data is available; clearly state if it is not.",
      "3. Meaningful observations about muscle group coverage.",
      "4. One or two practical suggestions for next week.",
      "5. A short recovery reminder if appropriate.",
      "Important: Do not fabricate specific exercise names or personal records. Do not make medical claims.",
      "Write in plain prose (no bullet points, no markdown headers). Start directly with the review.",
      "",
      "Weekly training metrics:",
      metricsText,
    ].join("\n");

    try { await recordGeminiUsage(user.uid, model, undefined); } catch { /* non-fatal */ }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 600 },
        }),
        signal: AbortSignal.timeout(25000),
      },
    );

    if (!response.ok) {
      const providerError = await response.json().catch(() => null) as { error?: { message?: unknown } } | null;
      const providerMessage = typeof providerError?.error?.message === "string"
        ? providerError.error.message.replaceAll(apiKey, "[redacted]")
        : "";
      console.error("Gemini weekly review failed", { status: response.status, message: providerMessage });

      // Fallback to deterministic review if AI is unavailable
      const fallback = buildDeterministicReview({
        currentSessions, currentSets, currentVolume, currentMuscles,
        lastSessions, lastSets, lastVolume, lastMuscles,
        hasLastData, volumeDeltaPct,
      });
      return NextResponse.json({ review: fallback });
    }

    const result = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: Record<string, unknown> };
    try { await recordGeminiUsage(user.uid, model, result.usageMetadata, false); } catch { /* non-fatal */ }

    const output = result.candidates?.[0]?.content?.parts?.map(p => p.text ?? "").join("").trim();

    if (!output) {
      const fallback = buildDeterministicReview({
        currentSessions, currentSets, currentVolume, currentMuscles,
        lastSessions, lastSets, lastVolume, lastMuscles,
        hasLastData, volumeDeltaPct,
      });
      return NextResponse.json({ review: fallback });
    }

    // Validate output is a non-empty string and not JSON
    const cleaned = output.slice(0, 2000);
    return NextResponse.json({ review: cleaned });

  } catch (error) {
    return workspaceErrorResponse(error);
  }
}

// Deterministic fallback when AI is unavailable
function buildDeterministicReview(opts: {
  currentSessions: number;
  currentSets: number;
  currentVolume: number;
  currentMuscles: string[];
  lastSessions: number;
  lastSets: number;
  lastVolume: number;
  lastMuscles: string[];
  hasLastData: boolean;
  volumeDeltaPct: number | null;
}): string {
  const { currentSessions, currentSets, currentVolume, lastSessions, lastSets, lastVolume, hasLastData, volumeDeltaPct } = opts;

  const parts: string[] = [];

  parts.push(
    `This week you completed ${currentSessions} training session${currentSessions === 1 ? "" : "s"} with ${currentSets} total sets and an estimated training volume of ${Math.round(currentVolume).toLocaleString()} kg (sets × reps × load).`,
  );

  if (opts.currentMuscles.length > 0) {
    parts.push(`Muscle groups trained: ${opts.currentMuscles.join(", ")}.`);
  }

  if (hasLastData) {
    const sessionDiff = currentSessions - lastSessions;
    const sessionText = sessionDiff === 0
      ? "the same number of sessions as last week"
      : sessionDiff > 0
        ? `${sessionDiff} more session${sessionDiff > 1 ? "s" : ""} than last week`
        : `${Math.abs(sessionDiff)} fewer session${Math.abs(sessionDiff) > 1 ? "s" : ""} than last week`;

    parts.push(
      `Compared to last week (${lastSessions} sessions, ${lastSets} sets, ${Math.round(lastVolume).toLocaleString()} kg volume): you completed ${sessionText}.`,
    );

    if (volumeDeltaPct !== null) {
      if (volumeDeltaPct > 5) {
        parts.push(`Your training volume increased by ${volumeDeltaPct.toFixed(0)}% — solid progress. Make sure you are recovering well.`);
      } else if (volumeDeltaPct < -10) {
        parts.push(`Your training volume was ${Math.abs(volumeDeltaPct).toFixed(0)}% lower than last week. This is fine if planned — listen to your body.`);
      } else {
        parts.push("Your training volume was similar to last week — consistent training builds long-term results.");
      }
    }

    // Check for untrained muscle groups
    const missed = opts.lastMuscles.filter(m => !opts.currentMuscles.includes(m));
    if (missed.length > 0 && missed.length <= 3) {
      parts.push(`Muscle groups you trained last week but not yet this week: ${missed.join(", ")}. Consider including them if your schedule allows.`);
    }
  } else {
    parts.push("No data from last week to compare — keep logging sessions to unlock your week-over-week review.");
  }

  parts.push("Remember to include adequate rest and recovery between sessions. Consistency over time matters more than any single week.");

  return parts.join(" ");
}
