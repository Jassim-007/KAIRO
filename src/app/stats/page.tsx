
"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import MuscleMaps from "@/app/components/muscle-maps";
import { inferExerciseMuscle } from "@/lib/muscles";

type Ex = { name: string; sets: number; reps: number; weightKg: number; muscle?: string; equipment?: string; setDetails?: { weightKg: number; reps: number; rir: number | null; completed: boolean }[] };
type Workout = { id: string; date: string; subjectUid: string; workoutType: string; durationMinutes?: number; exercises: Ex[]; planDay?: string; planRoutineId?: string; notes?: string };
type Weight = { id: string; date: string; weightKg: number; createdAt?: string };
type Range = "Week" | "30d" | "90d" | "All";
type View = "Muscle balance" | "Fatigue" | "Strength";

const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shift = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// Week starts Monday (ISO)
const weekStart = (d: Date) => {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Mon=0
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
};

export default function StatsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [weights, setWeights] = useState<Weight[]>([]);
  const [range, setRange] = useState<Range>("30d");
  const [view, setView] = useState<View>("Muscle balance");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Weekly review state
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewText, setReviewText] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [reviewMetrics, setReviewMetrics] = useState<WeeklyMetrics | null>(null);

  useEffect(() => onAuthStateChanged(auth, u => { setUser(u); if (!u) router.replace("/login"); }), [router]);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const req = async (path: string) => {
        const r = await fetch(path, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not load training history.");
        return d;
      };
      const all = async <T,>(path: string): Promise<T[]> => {
        const records: T[] = [];
        let cursor: string | null = null;
        do {
          const page = await req(`${path}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
          records.push(...((page.records || []) as T[]));
          cursor = page.hasMore ? page.nextCursor : null;
          if (page.hasMore && !cursor) throw new Error("Training history pagination stopped unexpectedly.");
        } while (cursor);
        return records;
      };
      const [a, b] = await Promise.all([all<Workout>("/api/fitness/workouts"), all<Weight>("/api/fitness/weight")]);
      setWorkouts(a.filter(w => w.subjectUid === user.uid));
      setWeights(b.slice().sort((x, y) => {
        const dateDiff = x.date.localeCompare(y.date);
        if (dateDiff !== 0) return dateDiff;
        // Same day: sort by createdAt timestamp for correct chronological order
        return (x.createdAt ?? "").localeCompare(y.createdAt ?? "");
      }));
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load training history."); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => { const f = () => void load(); window.addEventListener("fitness-record-saved", f); return () => window.removeEventListener("fitness-record-saved", f); }, [load]);

  const now = new Date();
  const today = dateKey(now);
  const days = range === "Week" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : 3650;
  const start = dateKey(shift(now, -days + 1));
  const datedWorkouts = workouts.filter(w => w.date <= today);
  const filtered = datedWorkouts.filter(w => range === "All" || w.date >= start);
  const monthStart = dateKey(new Date(now.getFullYear(), now.getMonth(), 1));
  const weightFiltered = weights.filter(w => w.date <= today && (range === "All" || w.date >= start));
  const weightDelta = weightFiltered.length > 1 ? weightFiltered.at(-1)!.weightKg - weightFiltered[0].weightKg : null;

  const streak = (() => {
    const set = new Set(datedWorkouts.map(w => w.date));
    let count = 0;
    let cursor = new Date();
    if (!set.has(dateKey(cursor))) cursor = shift(cursor, -1);
    while (set.has(dateKey(cursor)) && count < 365) { count++; cursor = shift(cursor, -1); }
    return count;
  })();

  const muscle = (() => {
    const sums = new Map<string, number>();
    for (const w of filtered) for (const e of w.exercises || []) sums.set(e.muscle || "Uncategorized", (sums.get(e.muscle || "Uncategorized") || 0) + e.sets);
    return [...sums].sort((a, b) => b[1] - a[1]);
  })();

  const records = (() => {
    const best = new Map<string, { weight: number; volume: number; date: string }>();
    for (const w of datedWorkouts) for (const e of w.exercises || []) {
      const prev = best.get(e.name) || { weight: 0, volume: 0, date: w.date };
      const wt = Number(e.weightKg) || 0;
      best.set(e.name, { weight: Math.max(prev.weight, wt), volume: Math.max(prev.volume, wt * e.reps * e.sets), date: wt > prev.weight ? w.date : prev.date });
    }
    return [...best].sort((a, b) => b[1].weight - a[1].weight).slice(0, 8);
  })();

  const heat = Array.from({ length: 365 }, (_, i) => {
    const d = shift(now, -364 + i);
    const key = dateKey(d);
    const n = datedWorkouts.filter(w => w.date === key).length;
    return { key, n };
  });

  const weightPoints = weightFiltered.map((w, i) =>
    `${weightFiltered.length < 2 ? 250 : i * 500 / (weightFiltered.length - 1)},${130 - (w.weightKg - (Math.min(...weightFiltered.map(x => x.weightKg)))) / (Math.max(...weightFiltered.map(x => x.weightKg)) - Math.min(...weightFiltered.map(x => x.weightKg)) || 1) * 110}`
  ).join(" ");

  // ── Weekly comparison metrics ─────────────────────────────────────────────

  const weeklyMetrics = computeWeeklyMetrics(datedWorkouts, weights, now);

  async function requestWeeklyReview() {
    if (!user || reviewLoading) return;
    setReviewLoading(true);
    setReviewError("");
    setReviewText("");
    setReviewMetrics(weeklyMetrics);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/ai/weekly-review", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          metrics: {
            ...weeklyMetrics,
            currentMuscles: [...weeklyMetrics.currentMuscles],
            lastMuscles: [...weeklyMetrics.lastMuscles],
          },
        }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not generate review.");
      setReviewText(data.review || "No review available.");
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : "Could not generate review.");
    } finally {
      setReviewLoading(false);
    }
  }

  // ── Today's muscle map from today's workouts ──────────────────────────────
  const todayWorkouts = datedWorkouts.filter(w => w.date === today);
  const todayMuscleVolumes = (() => {
    const sums = new Map<string, number>();
    for (const w of todayWorkouts) {
      for (const e of w.exercises || []) {
        const muscle = inferExerciseMuscle(e.name, e.muscle) || "Uncategorized";
        sums.set(muscle, (sums.get(muscle) || 0) + e.sets);
      }
    }
    return Object.fromEntries(sums);
  })();

  if (!user || loading) return <main className="min-h-screen p-8 text-ink-soft">Loading your stats…</main>;

  return (
    <main className="min-h-screen text-ink">
      <header className="px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8">
        <p className="text-xs text-ink-mute">KAIRO · YOUR MOMENT . YOUR MOMENTUM</p>
      </header>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-7 sm:px-8 sm:py-10">
        <section>
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-periwinkle">Progress &amp; history</p>
          <h1 className="mt-2 text-4xl font-bold">Your training, in context.</h1>
          <p className="mt-2 text-sm text-ink-soft">Metrics are calculated from the workout and weigh-in records saved to your account.</p>
        </section>
        {error && <p role="alert" className="rounded-2xl border border-warn/30 p-3 text-sm text-warn">{error}</p>}

        {/* Summary stats */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Workouts", value: datedWorkouts.length },
            { label: "This month", value: datedWorkouts.filter(w => w.date >= monthStart).length },
            { label: "Current streak", value: `${streak} day${streak === 1 ? "" : "s"}` },
            { label: "Weight change", value: weightDelta === null ? "—" : `${weightDelta > 0 ? "+" : ""}${weightDelta.toFixed(1)} kg` },
          ].map(x => (
            <article key={x.label} className="rounded-3xl border border-line card p-5">
              <p className="text-sm text-ink-soft">{x.label}</p>
              <p className="mt-3 text-3xl font-bold">{x.value}</p>
            </article>
          ))}
        </div>

        {/* Activity heatmap */}
        <section className="rounded-3xl border border-line card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Activity · last 12 months</h2>
              <p className="mt-1 text-xs text-ink-mute">Each square reflects saved sessions on that date</p>
            </div>
            <p className="text-xs text-ink-mute">{datedWorkouts.length ? `${datedWorkouts.length} saved sessions` : "No saved sessions yet"}</p>
          </div>
          <div className="mt-5 grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto">
            {heat.map(x => <span key={x.key} title={`${x.key}: ${x.n} workouts`} className={`h-3 w-3 rounded-[3px] ${x.n === 0 ? "bg-sunken" : x.n === 1 ? "bg-lavender" : "bg-periwinkle"}`} />)}
          </div>
        </section>

        {/* Weight trend */}
        <section className="rounded-3xl border border-line card p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-semibold">Body weight trend</h2>
              <p className="mt-1 text-xs text-ink-mute">Saved weigh-ins · {range} · chronological order</p>
            </div>
            <p className="text-sm font-semibold text-periwinkle">{weightFiltered.at(-1)?.weightKg ?? "—"} kg</p>
          </div>
          {weightFiltered.length > 1 ? (
            <svg viewBox="0 0 500 150" role="img" aria-label={`Weight trend, ${range}`} className="mt-5 h-36 w-full">
              <line x1="0" y1="140" x2="500" y2="140" stroke="var(--c-line)" />
              <polyline points={weightPoints} fill="none" stroke="var(--c-periwinkle)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              {weightFiltered.map((w, i) => (
                <circle key={w.id} cx={weightFiltered.length < 2 ? 250 : i * 500 / (weightFiltered.length - 1)} cy={130 - (w.weightKg - Math.min(...weightFiltered.map(x => x.weightKg))) / (Math.max(...weightFiltered.map(x => x.weightKg)) - Math.min(...weightFiltered.map(x => x.weightKg)) || 1) * 110} r="4" fill="var(--c-periwinkle)">
                  <title>{w.date}: {w.weightKg} kg{w.createdAt ? ` (${new Date(w.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})` : ""}</title>
                </circle>
              ))}
            </svg>
          ) : <p className="py-8 text-center text-sm text-ink-mute">Add a few weigh-ins to see your trend.</p>}
          {weightFiltered.length >= 2 && (
            <p className="mt-2 text-xs text-ink-mute">
              Change ({range}): {weightDelta !== null ? `${weightDelta > 0 ? "+" : ""}${weightDelta.toFixed(1)} kg` : "—"} ·
              Same-day entries sorted by recording time for accuracy.
            </p>
          )}
        </section>

        {/* Muscle / Fatigue / Strength tabs */}
        <section className="rounded-3xl border border-line card p-5">
          <div className="flex flex-wrap justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {(["Muscle balance", "Fatigue", "Strength"] as View[]).map(x => (
                <button key={x} onClick={() => setView(x)} aria-pressed={view === x} className={`rounded-xl px-3 py-2 text-sm ${view === x ? "bg-butter font-semibold text-butter-ink" : "bg-sunken text-ink-soft"}`}>{x}</button>
              ))}
            </div>
            <div className="flex gap-1">
              {(["Week", "30d", "90d", "All"] as Range[]).map(x => (
                <button key={x} onClick={() => setRange(x)} aria-pressed={range === x} className={`rounded-xl px-3 py-2 text-xs ${range === x ? "bg-lavender text-ink" : "text-ink-mute"}`}>{x}</button>
              ))}
            </div>
          </div>

          {view === "Muscle balance" && (
            <div className="mt-5 space-y-5">
              <MuscleMaps volumes={Object.fromEntries(muscle)} />
              {muscle.length ? muscle.map(([name, n]) => (
                <div key={name}>
                  <div className="mb-1 flex justify-between text-sm"><span>{name}</span><span className="text-ink-mute">{n} sets</span></div>
                  <div className="h-2 rounded-full bg-sunken"><div className="h-2 rounded-full bg-butter" style={{ width: `${Math.max(4, n / Math.max(...muscle.map(x => x[1])) * 100)}%` }} /></div>
                </div>
              )) : <p className="py-4 text-center text-sm text-ink-mute">Muscle maps light up from your saved exercise tags in this date range.</p>}
            </div>
          )}

          {view === "Fatigue" && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <article className="rounded-2xl bg-sunken p-4"><p className="text-sm text-ink-soft">Recent training days</p><p className="mt-2 text-2xl font-bold">{filtered.length}</p><p className="mt-1 text-xs text-ink-mute">Within the selected window</p></article>
              <article className="rounded-2xl bg-sunken p-4"><p className="text-sm text-ink-soft">Recovery spacing</p><p className="mt-2 text-sm text-ink-soft">{filtered.length < 2 ? "Log another session to see your training rhythm." : `${new Set(filtered.map(w => w.date)).size} active days · consider a recovery day when you feel run down.`}</p></article>
              <p className="sm:col-span-2 text-xs text-ink-mute">This is a simple training-frequency view, not a medical or recovery assessment.</p>
            </div>
          )}

          {view === "Strength" && (
            <div className="mt-5">
              {records.length ? (
                <div className="space-y-2">
                  {records.map(([name, r]) => (
                    <article key={name} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-sunken p-4">
                      <div><p className="font-semibold">{name}</p><p className="mt-1 text-xs text-ink-mute">Best logged load · {r.date}</p></div>
                      <p className="text-lg font-bold text-periwinkle">{r.weight} kg</p>
                    </article>
                  ))}
                </div>
              ) : <p className="py-7 text-center text-sm text-ink-mute">Personal records appear as you log weighted exercises.</p>}
            </div>
          )}
        </section>

        {/* Today's muscles trained */}
        {todayWorkouts.length > 0 && (
          <section className="rounded-3xl border border-periwinkle/20 card p-5">
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-periwinkle">Today · estimated muscles trained</p>
            <h2 className="mt-1 text-xl font-bold">Muscles Trained Today</h2>
            <p className="mt-1 text-sm text-ink-mute">Based on {todayWorkouts.length} completed workout{todayWorkouts.length > 1 ? "s" : ""}. Results are estimated from exercise muscle tags.</p>
            <div className="mt-4">
              <MuscleMaps volumes={todayMuscleVolumes} />
            </div>
            <div className="mt-4 space-y-1">
              {todayWorkouts.flatMap(w => w.exercises || []).reduce((acc, e) => {
                const muscle = inferExerciseMuscle(e.name, e.muscle) || "Uncategorized";
                const existing = acc.find(x => x.muscle === muscle);
                if (existing) {
                  existing.exercises.push(e.name);
                  existing.sets += e.sets;
                } else {
                  acc.push({ muscle, exercises: [e.name], sets: e.sets });
                }
                return acc;
              }, [] as { muscle: string; exercises: string[]; sets: number }[])
                .sort((a, b) => b.sets - a.sets)
                .map(item => (
                  <div key={item.muscle} className="flex items-start gap-3 rounded-xl bg-sunken px-3 py-2.5 text-sm">
                    <span className="min-w-24 font-semibold text-ink">{item.muscle}</span>
                    <span className="text-ink-mute">{[...new Set(item.exercises)].join(", ")} · {item.sets} sets</span>
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* Weekly comparison + AI review */}
        <section className="rounded-3xl border border-line card p-5">
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-periwinkle">Week-over-week</p>
          <h2 className="mt-1 text-xl font-bold">Training comparison</h2>
          <p className="mt-1 text-sm text-ink-mute">Comparing this week (Mon–today) to last week. Metrics computed from your saved sessions.</p>

          {weeklyMetrics.hasCurrentData ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <WeekStatCard label="Sessions this week" value={`${weeklyMetrics.currentSessions}`} prev={weeklyMetrics.hasLastData ? `${weeklyMetrics.lastSessions} last week` : undefined} />
              <WeekStatCard label="Sets this week" value={`${weeklyMetrics.currentSets}`} prev={weeklyMetrics.hasLastData ? `${weeklyMetrics.lastSets} last week` : undefined} />
              <WeekStatCard label="Total volume (sets × reps × kg)" value={weeklyMetrics.currentVolume > 0 ? `${Math.round(weeklyMetrics.currentVolume).toLocaleString()} kg` : "0 kg"} prev={weeklyMetrics.hasLastData && weeklyMetrics.lastVolume > 0 ? `${Math.round(weeklyMetrics.lastVolume).toLocaleString()} kg last week` : weeklyMetrics.hasLastData ? "0 kg last week" : undefined} />
              <WeekStatCard label="Muscle groups hit" value={`${weeklyMetrics.currentMuscles.size}`} prev={weeklyMetrics.hasLastData ? `${weeklyMetrics.lastMuscles.size} last week` : undefined} />
              {weeklyMetrics.hasLastData && weeklyMetrics.volumeDeltaPct !== null && (
                <WeekStatCard
                  label="Volume change"
                  value={weeklyMetrics.volumeDeltaPct === 0 ? "Same" : `${weeklyMetrics.volumeDeltaPct > 0 ? "+" : ""}${weeklyMetrics.volumeDeltaPct.toFixed(0)}%`}
                  highlight={weeklyMetrics.volumeDeltaPct > 0 ? "up" : weeklyMetrics.volumeDeltaPct < 0 ? "down" : "neutral"}
                />
              )}
            </div>
          ) : (
            <p className="mt-4 text-sm text-ink-mute">No workouts recorded this week yet. Start a session from the Plan page.</p>
          )}

          <div className="mt-5 border-t border-line pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">AI weekly review</p>
                <p className="text-xs text-ink-mute">An AI summary of your training week. Uses only your anonymised metrics — no personal details sent.</p>
              </div>
              <button
                disabled={reviewLoading || !weeklyMetrics.hasCurrentData}
                onClick={() => void requestWeeklyReview()}
                className="rounded-xl bg-butter px-4 py-2 text-sm font-bold text-butter-ink disabled:opacity-50"
              >
                {reviewLoading ? "Generating…" : "Generate review"}
              </button>
            </div>
            {reviewError && <p className="mt-3 text-sm text-warn">{reviewError}</p>}
            {reviewText && (
              <div className="mt-4 rounded-2xl bg-sunken p-4 text-sm leading-relaxed text-ink-soft whitespace-pre-wrap">
                {reviewText}
              </div>
            )}
            {reviewMetrics && reviewText && (
              <p className="mt-2 text-xs text-ink-mute">Review based on: {reviewMetrics.currentSessions} sessions, {reviewMetrics.currentSets} sets, {Math.round(reviewMetrics.currentVolume).toLocaleString()} kg total volume this week.</p>
            )}
          </div>
        </section>

        {/* Recent sessions */}
        <section className="rounded-3xl border border-line card p-5">
          <div className="flex justify-between"><h2 className="font-semibold">Recent sessions</h2><button onClick={() => router.push("/tracker")} className="text-sm text-periwinkle">Open Tracker</button></div>
          {datedWorkouts.length ? (
            <div className="mt-3 space-y-2">
              {datedWorkouts.slice(0, 6).map(w => (
                <p key={w.id} className="flex justify-between rounded-xl bg-sunken px-3 py-3 text-sm">
                  <span>{w.workoutType} · {w.exercises?.length || 0} exercises{w.notes ? ` · ${w.notes}` : ""}</span>
                  <span className="text-ink-mute">{w.date}</span>
                </p>
              ))}
            </div>
          ) : <p className="mt-3 text-sm text-ink-mute">No workouts saved yet. Start a guided session when you&apos;re ready.</p>}
        </section>

        <div className="rounded-2xl border border-line bg-sunken p-3 text-xs text-ink-mute">
          Totals include all saved workout and weigh-in pages through today. Muscle estimates are based on exercise tags and are for guidance only.
        </div>
      </div>
    </main>
  );
}

// --------------------------------------------------------------------------
// Weekly metrics computation
// --------------------------------------------------------------------------

interface WeeklyMetrics {
  currentSessions: number;
  currentSets: number;
  currentVolume: number;
  currentMuscles: Set<string>;
  lastSessions: number;
  lastSets: number;
  lastVolume: number;
  lastMuscles: Set<string>;
  hasCurrentData: boolean;
  hasLastData: boolean;
  volumeDeltaPct: number | null;
}

function computeWeeklyMetrics(workouts: Workout[], _weights: Weight[], now: Date): WeeklyMetrics {
  const thisWeekStart = weekStart(now);
  const lastWeekStart = shift(thisWeekStart, -7);
  const thisWeekStartKey = dateKey(thisWeekStart);
  const lastWeekStartKey = dateKey(lastWeekStart);
  const thisWeekEndKey = dateKey(now);
  const lastWeekEndKey = dateKey(shift(thisWeekStart, -1));

  const thisWeek = workouts.filter(w => w.date >= thisWeekStartKey && w.date <= thisWeekEndKey);
  const lastWeek = workouts.filter(w => w.date >= lastWeekStartKey && w.date <= lastWeekEndKey);

  const sessionSets = (sessions: Workout[]) => sessions.reduce((n, w) => n + (w.exercises || []).reduce((s, e) => s + (e.sets || 0), 0), 0);
  const sessionVolume = (sessions: Workout[]) => sessions.reduce((total, w) =>
    total + (w.exercises || []).reduce((s, e) => {
      // Use setDetails for accurate volume if available
      if (e.setDetails?.length) {
        return s + e.setDetails.filter(sd => sd.completed).reduce((sv, sd) => sv + (sd.weightKg || 0) * (sd.reps || 0), 0);
      }
      return s + (e.weightKg || 0) * (e.reps || 0) * (e.sets || 0);
    }, 0), 0);
  const sessionMuscles = (sessions: Workout[]) => new Set(sessions.flatMap(w => (w.exercises || []).map(e => inferExerciseMuscle(e.name, e.muscle) || "Uncategorized")).filter(m => m !== "Uncategorized"));

  const currentSets = sessionSets(thisWeek);
  const lastSets = sessionSets(lastWeek);
  const currentVolume = sessionVolume(thisWeek);
  const lastVolume = sessionVolume(lastWeek);
  const currentMuscles = sessionMuscles(thisWeek);
  const lastMuscles = sessionMuscles(lastWeek);

  const volumeDeltaPct = lastVolume > 0 ? ((currentVolume - lastVolume) / lastVolume) * 100 : null;

  return {
    currentSessions: thisWeek.length,
    currentSets,
    currentVolume,
    currentMuscles,
    lastSessions: lastWeek.length,
    lastSets,
    lastVolume,
    lastMuscles,
    hasCurrentData: thisWeek.length > 0,
    hasLastData: lastWeek.length > 0,
    volumeDeltaPct,
  };
}

// --------------------------------------------------------------------------
// Weekly stat card sub-component
// --------------------------------------------------------------------------

function WeekStatCard({
  label,
  value,
  prev,
  highlight,
}: {
  label: string;
  value: string;
  prev?: string;
  highlight?: "up" | "down" | "neutral";
}) {
  return (
    <article className="rounded-2xl bg-sunken p-4">
      <p className="text-xs text-ink-mute">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${highlight === "up" ? "text-success" : highlight === "down" ? "text-warn" : ""}`}>{value}</p>
      {prev && <p className="mt-1 text-xs text-ink-mute">{prev}</p>}
    </article>
  );
}
