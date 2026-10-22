
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { auth } from "@/lib/firebase";
import { imageForExercise } from "@/app/exercises/catalog";

type Exercise = {
  name: string;
  sets: number;
  reps: number;
  weightKg: number;
  muscle: string;
  equipment: string;
};

type Routine = {
  id: string;
  name: string;
  workoutType: string;
  exercises: Exercise[];
};

type Day = {
  day: string;
  routines: Routine[];
};

/** Per-set state uses strings so numeric inputs can be cleared naturally. */
type SetRow = {
  weightKgStr: string;
  repsStr: string;
  rir: number | null;
  done: boolean;
};

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

const todayKey = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

/** Map any routine workoutType string to the server-accepted enum. */
function toWorkoutTypeEnum(raw: string): "Push" | "Pull" | "Legs" | "Custom" {
  const lower = raw.toLowerCase();
  if (lower.includes("push")) return "Push";
  if (lower.includes("pull")) return "Pull";
  if (lower.includes("leg")) return "Legs";
  return "Custom";
}

function makeSet(weightKg = 0, reps = 10): SetRow {
  return {
    weightKgStr: weightKg === 0 ? "" : String(weightKg),
    repsStr: String(reps),
    rir: null,
    done: false,
  };
}

/** Coerce a string field to a valid weight number (>= 0). Returns NaN if empty. */
function parseWeight(str: string): number {
  if (str.trim() === "") return 0;
  const n = Number(str);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Coerce a string field to a valid reps integer (>= 1). Returns 1 if invalid. */
function parseReps(str: string): number {
  if (str.trim() === "") return 1;
  const n = Math.round(Number(str));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

// --------------------------------------------------------------------------
// Session persistence via localStorage (crash recovery)
// --------------------------------------------------------------------------

const SESSION_KEY_PREFIX = "kairo_session_";

interface PersistedSession {
  routineId: string;
  planDay: string;
  scheduledDate: string;
  rows: SetRow[][];
  exerciseIndex: number;
  savedAt: number;
}

function sessionKey(routineId: string, uid: string) {
  return `${SESSION_KEY_PREFIX}${uid}_${routineId}`;
}

function saveSession(uid: string, routine: Routine, planDay: string, scheduledDate: string, rows: SetRow[][], exerciseIndex: number) {
  try {
    const payload: PersistedSession = {
      routineId: routine.id,
      planDay,
      scheduledDate,
      rows,
      exerciseIndex,
      savedAt: Date.now(),
    };
    localStorage.setItem(sessionKey(routine.id, uid), JSON.stringify(payload));
  } catch {
    // storage may be unavailable in private mode
  }
}

function loadSession(uid: string, routineId: string): PersistedSession | null {
  try {
    const raw = localStorage.getItem(sessionKey(routineId, uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSession;
    // Discard sessions older than 6 hours
    if (Date.now() - parsed.savedAt > 6 * 60 * 60 * 1000) {
      localStorage.removeItem(sessionKey(routineId, uid));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function clearSession(uid: string, routineId: string) {
  try {
    localStorage.removeItem(sessionKey(routineId, uid));
  } catch {
    // ignore
  }
}

// --------------------------------------------------------------------------
// Component
// --------------------------------------------------------------------------

export default function WorkoutPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [rows, setRows] = useState<SetRow[][]>([]);
  const [exercise, setExercise] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [finished, setFinished] = useState(false);
  const [addingExercise, setAddingExercise] = useState(false);
  const [newExercise, setNewExercise] = useState("");
  const [scheduledDate, setScheduledDate] = useState(todayKey());
  const [planDay, setPlanDay] = useState("");
  const [restoredNotice, setRestoredNotice] = useState(false);

  // Idempotency: track a session token so double-clicks or retries don't duplicate.
  const sessionTokenRef = useRef(crypto.randomUUID());

  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        router.replace("/login");
      }
    });
  }, [router]);

  // Load plan and restore session if available
  useEffect(() => {
    let alive = true;

    async function load() {
      if (!user) return;

      try {
        const token = await user.getIdToken();

        const response = await fetch("/api/fitness/plans", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Could not load plan");
        }

        const params = new URLSearchParams(window.location.search);

        const dayParam =
          params.get("day") ||
          new Intl.DateTimeFormat("en-US", {
            weekday: "long",
          }).format(new Date());

        const routineId = params.get("routine");
        const days = data.days as Day[];

        const selected =
          days
            .find((item) => item.day === dayParam)
            ?.routines.find((item) => item.id === routineId) ||
          days.find((item) => item.day === dayParam)?.routines[0];

        const fallback: Routine = {
          id: "quick-start",
          name: "Full Body · Quick Start",
          workoutType: "Custom",
          exercises: [
            { name: "Goblet Squat", sets: 3, reps: 10, weightKg: 0, muscle: "Quads", equipment: "Dumbbell" },
            { name: "Push-up", sets: 3, reps: 10, weightKg: 0, muscle: "Chest", equipment: "Bodyweight" },
            { name: "Dumbbell Row", sets: 3, reps: 10, weightKg: 0, muscle: "Back", equipment: "Dumbbell" },
          ],
        };

        if (alive) {
          const chosenRoutine = selected || fallback;

          // Derive the scheduled date from the day name
          let derivedDate = todayKey();
          if (params.get("date")) {
            derivedDate = params.get("date")!;
          } else if (dayParam) {
            // Find the date for this day name in the current week
            const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
            const targetIndex = dayNames.indexOf(dayParam);
            if (targetIndex !== -1) {
              const now = new Date();
              const currentDay = now.getDay();
              const diff = targetIndex - currentDay;
              // A plan day belongs to that weekday in the current calendar week.
              const target = new Date(now);
              target.setDate(now.getDate() + diff);
              derivedDate = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
            }
          }

          setScheduledDate(derivedDate);
          setPlanDay(dayParam);

          // Try to restore a previous session for this routine
          const saved = loadSession(user.uid, chosenRoutine.id);
          if (saved && saved.rows.length === chosenRoutine.exercises.length) {
            setRoutine(chosenRoutine);
            setRows(saved.rows);
            setExercise(Math.min(saved.exerciseIndex, chosenRoutine.exercises.length - 1));
            setRestoredNotice(true);
          } else {
            setRoutine(chosenRoutine);
            setRows(
              chosenRoutine.exercises.map((item) =>
                Array.from({ length: item.sets }, () =>
                  makeSet(item.weightKg, item.reps),
                ),
              ),
            );
          }
        }
      } catch (err) {
        if (alive) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load workout",
          );
        }
      }
    }

    void load();

    return () => {
      alive = false;
    };
  }, [user]);

  // Persist session to localStorage whenever rows or exercise index change
  useEffect(() => {
    if (!user || !routine || finished) return;
    saveSession(user.uid, routine, planDay, scheduledDate, rows, exercise);
  }, [user, routine, planDay, scheduledDate, rows, exercise, finished]);

  const completed = useMemo(
    () => rows.flat().filter((set) => set.done).length,
    [rows],
  );

  const total = useMemo(
    () => rows.reduce((count, group) => count + group.length, 0),
    [rows],
  );

  const current = rows[exercise] || [];
  const currentExercise = routine?.exercises[exercise];
  const exerciseCount = routine?.exercises.length ?? 0;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  function updateSet(index: number, patch: Partial<SetRow>) {
    setRows((allRows) =>
      allRows.map((group, groupIndex) =>
        groupIndex === exercise
          ? group.map((set, setIndex) =>
              setIndex === index ? { ...set, ...patch } : set,
            )
          : group,
      ),
    );
  }

  function addSet() {
    setRows((allRows) =>
      allRows.map((group, index) =>
        index === exercise
          ? [
              ...group,
              makeSet(
                parseWeight(group.at(-1)?.weightKgStr ?? ""),
                parseReps(group.at(-1)?.repsStr ?? "10"),
              ),
            ]
          : group,
      ),
    );
  }

  function removeSet(setIndex: number) {
    setRows((allRows) =>
      allRows.map((group, groupIndex) =>
        groupIndex === exercise
          ? group.filter((_, i) => i !== setIndex)
          : group,
      ),
    );
  }

  function addExercise(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = newExercise.trim();

    if (!name || !routine) return;

    const customExercise: Exercise = {
      name,
      sets: 3,
      reps: 10,
      weightKg: 0,
      muscle: "Full body",
      equipment: "Custom",
    };

    setRoutine((previous) =>
      previous
        ? {
            ...previous,
            exercises: [...previous.exercises, customExercise],
          }
        : previous,
    );

    setRows((previous) => [
      ...previous,
      Array.from({ length: 3 }, () => makeSet()),
    ]);

    setExercise(routine.exercises.length);
    setNewExercise("");
    setAddingExercise(false);
  }

  async function finish() {
    if (!user || !routine || completed === 0 || saving) return;

    setSaving(true);
    setError("");

    try {
      const token = await user.getIdToken();

      // Map workoutType to valid enum value
      const workoutTypeEnum = toWorkoutTypeEnum(routine.workoutType);

      const response = await fetch("/api/fitness/workouts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          // Idempotency: same session token = same record (server ignores subsequent)
          "X-Idempotency-Key": sessionTokenRef.current,
        },
        body: JSON.stringify({
          date: scheduledDate,
          workoutType: workoutTypeEnum,
          notes: routine.name,
          planRoutineId: routine.id,
          planDay,
          exercises: routine.exercises.flatMap((item, index) => {
            const doneSets = (rows[index] || []).filter(
              (set) => set.done,
            );

            if (doneSets.length === 0) return [];

            const weightValues = doneSets.map((set) => parseWeight(set.weightKgStr));
            const repsValues = doneSets.map((set) => parseReps(set.repsStr));

            return [
              {
                ...item,
                sets: doneSets.length,
                reps: Math.round(
                  repsValues.reduce((sum, r) => sum + r, 0) / doneSets.length,
                ),
                weightKg: Math.max(0, ...weightValues),
                setDetails: doneSets.map((set, i) => ({
                  weightKg: weightValues[i],
                  reps: repsValues[i],
                  rir: set.rir,
                  completed: set.done,
                })),
              },
            ];
          }),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not save this session.");
      }

      // Clear persisted session on successful save
      clearSession(user.uid, routine.id);
      setFinished(true);
      window.dispatchEvent(new CustomEvent("fitness-record-saved"));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save session",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!user || !routine) {
    return (
      <main className="min-h-screen p-8 text-ink-soft">
        {error || "Preparing your session…"}
      </main>
    );
  }

  return (
    <main className="min-h-screen text-ink">
      <header className="px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8">
        <p className="text-xs text-ink-mute">
          KAIRO · guided session
        </p>
      </header>

      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-8 sm:py-8">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => router.push("/plan")}
            className="rounded-2xl border border-line px-4 py-2 text-sm"
          >
            Exit
          </button>

          <div className="min-w-0 text-center">
            <h1 className="font-bold">{routine.name}</h1>
            <p className="text-sm text-ink-soft">
              {completed}/{total} sets completed · {scheduledDate}
            </p>
          </div>

          <button
            onClick={() => setAddingExercise((value) => !value)}
            className="shrink-0 rounded-2xl border border-line px-3 py-2 text-sm sm:px-4"
          >
            + Exercise
          </button>
        </div>

        {restoredNotice && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-periwinkle/30 bg-periwinkle/10 px-4 py-2.5 text-sm">
            <p className="text-periwinkle">Session restored — your progress is still here.</p>
            <button
              onClick={() => setRestoredNotice(false)}
              className="text-xs text-ink-mute"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        <div
          className="h-2 overflow-hidden rounded-full bg-lavender/55"
          role="progressbar"
          aria-label="Workout progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <div
            className="h-full rounded-full bg-butter transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        {addingExercise && (
          <form
            className="flex flex-wrap gap-2 rounded-2xl border border-line card p-4"
            onSubmit={addExercise}
          >
            <label className="min-w-0 flex-1 text-xs text-ink-soft">
              Exercise name
              <input
                autoFocus
                value={newExercise}
                onChange={(event) => setNewExercise(event.target.value)}
                placeholder="Add a movement to this session"
                className="mt-1 w-full rounded-xl bg-field px-3 py-2.5"
              />
            </label>

            <button
              type="submit"
              className="self-end rounded-xl bg-butter px-4 py-2.5 text-sm font-bold text-butter-ink"
            >
              Add exercise
            </button>

            <button
              type="button"
              onClick={() => {
                setAddingExercise(false);
                setNewExercise("");
              }}
              className="self-end rounded-xl border border-line px-4 py-2.5 text-sm"
            >
              Cancel
            </button>
          </form>
        )}

        <section className="rounded-3xl border border-line card p-5 sm:p-7">
          <p className="text-xs uppercase tracking-widest text-periwinkle">
            Exercise {exercise + 1} of {exerciseCount}
          </p>

          {currentExercise && (
            <>
              <div className="mt-3 flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-line-strong bg-gradient-to-br from-lavender/40 to-sunken p-5 text-center">
                <div className="w-full">
                  <MovementVisual
                    name={currentExercise.name}
                    equipment={currentExercise.equipment}
                  />

                  <p className="text-4xl" aria-hidden="true">
                    {currentExercise.equipment.includes("Body")
                      ? "◎"
                      : "◉"}
                  </p>

                  <p className="mt-3 text-sm text-ink-soft">
                    Movement guide
                  </p>

                  <p className="mt-1 text-xs text-ink-mute">
                    Keep a steady tempo, move through a comfortable range,
                    and stop if you feel sharp pain.
                  </p>
                </div>
              </div>

              <h2 className="mt-5 text-2xl font-bold">
                {currentExercise.name}
              </h2>

              <div className="mt-2 flex flex-wrap gap-2">
                {[currentExercise.muscle, currentExercise.equipment].map(
                  (label) => (
                    <span
                      key={label}
                      className="rounded-full bg-lavender/55 px-3 py-1 text-xs text-ink-soft"
                    >
                      {label}
                    </span>
                  ),
                )}
              </div>

              <p className="mt-3 text-sm text-ink-soft">
                Log each set at your own pace. Targets are editable, and
                your completed sets save with the workout.
              </p>
            </>
          )}

          <div className="mt-6 hidden grid-cols-[2rem_1fr_1fr_5rem_2.5rem_2rem] gap-2 text-center text-[11px] uppercase tracking-wider text-ink-mute sm:grid">
            <span>Set</span>
            <span>Weight kg</span>
            <span>Reps</span>
            <span>RIR</span>
            <span>Done</span>
            <span></span>
          </div>

          {current.map((set, index) => (
            <div
              key={index}
              className={`mt-3 rounded-2xl border p-3 ${
                set.done
                  ? "border-periwinkle/50 bg-periwinkle/10"
                  : "border-line"
              }`}
            >
              <div className="mb-2 flex items-center justify-between sm:hidden">
                <span className="text-sm font-semibold">
                  Set {index + 1}
                </span>

                <button
                  type="button"
                  aria-label={`Complete set ${index + 1}`}
                  aria-pressed={set.done}
                  onClick={() => updateSet(index, { done: !set.done })}
                  className={`h-9 min-w-9 rounded-full border px-2 text-sm font-bold ${
                    set.done
                      ? "border-periwinkle bg-butter text-butter-ink"
                      : "border-line-strong"
                  }`}
                >
                  {set.done ? "✓" : "○"}
                </button>
              </div>

              <div className="grid grid-cols-[1fr_1fr] items-end gap-3 sm:grid-cols-[2rem_1fr_1fr_5rem_2.5rem_2rem] sm:items-center sm:gap-2">
                <span className="hidden text-center text-sm text-ink-mute sm:block">
                  {index + 1}
                </span>

                <label className="min-w-0 text-xs text-ink-soft">
                  <span className="mb-1 block sm:hidden">Weight (kg)</span>
                  <input
                    aria-label={`Set ${index + 1} weight in kg`}
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    min="0"
                    value={set.weightKgStr}
                    placeholder="0"
                    onChange={(event) =>
                      updateSet(index, {
                        weightKgStr: event.target.value,
                      })
                    }
                    onBlur={(event) => {
                      // Normalize on blur: empty → keep as "" (bodyweight), negative → 0
                      const raw = event.target.value;
                      if (raw === "") return; // allow empty (treated as 0 on save)
                      const n = Number(raw);
                      if (!Number.isFinite(n) || n < 0) {
                        updateSet(index, { weightKgStr: "0" });
                      }
                    }}
                    className="w-full min-w-0 rounded-xl bg-field p-2.5 text-center text-sm"
                  />
                </label>

                <label className="min-w-0 text-xs text-ink-soft">
                  <span className="mb-1 block sm:hidden">Reps</span>
                  <input
                    aria-label={`Set ${index + 1} reps`}
                    type="number"
                    inputMode="numeric"
                    min="1"
                    value={set.repsStr}
                    placeholder="10"
                    onChange={(event) =>
                      updateSet(index, {
                        repsStr: event.target.value,
                      })
                    }
                    onBlur={(event) => {
                      const raw = event.target.value;
                      if (raw === "") {
                        updateSet(index, { repsStr: "1" });
                        return;
                      }
                      const n = Math.round(Number(raw));
                      if (!Number.isFinite(n) || n < 1) {
                        updateSet(index, { repsStr: "1" });
                      }
                    }}
                    className="w-full min-w-0 rounded-xl bg-field p-2.5 text-center text-sm"
                  />
                </label>

                <label className="min-w-0 text-xs text-ink-soft">
                  <span className="mb-1 block sm:hidden">RIR</span>
                  <select
                    aria-label={`Set ${index + 1} reps in reserve`}
                    value={set.rir ?? ""}
                    onChange={(event) =>
                      updateSet(index, {
                        rir:
                          event.target.value === ""
                            ? null
                            : Number(event.target.value),
                      })
                    }
                    className="w-full rounded-xl bg-field p-2.5 text-center text-sm"
                  >
                    <option value="">RIR</option>
                    {[0, 1, 2, 3, 4, 5].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  aria-label={`Complete set ${index + 1}`}
                  aria-pressed={set.done}
                  onClick={() => updateSet(index, { done: !set.done })}
                  className={`hidden h-9 w-9 justify-self-center rounded-full border text-sm font-bold sm:block ${
                    set.done
                      ? "border-periwinkle bg-butter text-butter-ink"
                      : "border-line-strong"
                  }`}
                >
                  {set.done ? "✓" : ""}
                </button>

                <button
                  type="button"
                  aria-label={`Remove set ${index + 1}`}
                  onClick={() => removeSet(index)}
                  className="hidden justify-self-center text-xs text-ink-mute hover:text-ink sm:block"
                  title="Remove this set"
                >
                  ×
                </button>
              </div>
            </div>
          ))}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={addSet}
              className="rounded-2xl border border-line px-4 py-2 text-sm"
            >
              + Add set
            </button>

            <p className="text-sm text-ink-mute">
              Rest when you need it.
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={exercise === 0}
                onClick={() => setExercise((value) => value - 1)}
                className="rounded-xl border border-line px-3 py-2 text-sm disabled:opacity-40"
              >
                Previous
              </button>

              <button
                type="button"
                disabled={exercise === exerciseCount - 1}
                onClick={() => setExercise((value) => value + 1)}
                className="rounded-xl border border-line px-3 py-2 text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </section>

        {error && (
          <p
            role="alert"
            className="rounded-2xl border border-warn/30 p-3 text-sm text-warn"
          >
            {error}
          </p>
        )}

        {finished ? (
          <section
            role="status"
            className="rounded-3xl border border-periwinkle/35 bg-periwinkle/10 p-5"
          >
            <h2 className="text-xl font-bold">
              Session saved · nice work!
            </h2>

            <p className="mt-2 text-sm text-ink-soft">
              {completed} sets completed for {scheduledDate}. Your workout is in your training history.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={() => router.push("/stats")}
                className="rounded-xl bg-butter px-4 py-2 text-sm font-bold text-butter-ink"
              >
                See your stats
              </button>
              <button
                onClick={() => router.push("/plan")}
                className="rounded-xl border border-line px-4 py-2 text-sm"
              >
                Back to plan
              </button>
            </div>
          </section>
        ) : (
          <button
            disabled={saving || completed === 0}
            onClick={() => void finish()}
            className="w-full rounded-2xl bg-butter px-5 py-4 font-bold text-butter-ink disabled:opacity-50"
          >
            {saving
              ? "Saving session…"
              : completed === 0
                ? "Complete a set to save"
                : `Finish & save — ${completed} set${completed === 1 ? "" : "s"} done`}
          </button>
        )}

        <p className="text-center text-xs text-ink-mute">
          Movement illustrations are supplied by Free Exercise DB;
          unavailable images fall back to the written cue.
        </p>
      </div>
    </main>
  );
}

function MovementVisual({
  name,
  equipment,
}: {
  name: string;
  equipment: string;
}) {
  const src = imageForExercise(name);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const alt = `${name} demonstration${
    equipment ? ` using ${equipment}` : ""
  }`;

  if (!src || failedSrc === src) return null;

  return (
    <Image
      src={src}
      alt={alt}
      width={900}
      height={620}
      sizes="(max-width: 768px) 100vw, 700px"
      onError={() => setFailedSrc(src)}
      className="mx-auto mb-3 max-h-[22rem] w-full max-w-2xl rounded-3xl bg-white object-contain"
    />
  );
}
