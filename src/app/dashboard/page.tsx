"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { Ring, PlantScene } from "@/app/components/illustrations";
import { Icon, type IconName } from "@/app/components/icons";
import { inferExerciseMuscle } from "@/lib/muscles";

type Summary = {
  date: string;
  userTotals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    waterMl: number;
    workouts: number;
  };
  totals: { workouts: number };
  currentWeight: number | null;
  hasWeightForDate: boolean;
  goals: { calories?: number | null; protein?: number | null } | null;
};

type Weight = { id: string; date: string; weightKg: number; createdAt?: string };

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

type Day = { day: string; routines: Routine[] };
type Workout = {
  id: string;
  date: string;
  planRoutineId?: string;
  planDay?: string;
  workoutType?: string;
  notes?: string;
  exercises?: Array<Pick<Exercise, "name" | "sets" | "reps" | "weightKg"> & { muscle?: string }>;
};

const key = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const fromKey = (value: string) => new Date(`${value}T12:00:00`);

const weekNames = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const indexFor = (date: string) => (fromKey(date).getDay() + 6) % 7;

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [weights, setWeights] = useState<Weight[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [plan, setPlan] = useState<Day[]>([]);
  const [selectedDate, setSelectedDate] = useState(key(new Date()));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [weightInput, setWeightInput] = useState("");
  const [savingWeight, setSavingWeight] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(
    () =>
      onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);
        if (!currentUser) router.replace("/login");
      }),
    [router],
  );

  const tokenRequest = useCallback(
    async (path: string, init?: RequestInit) => {
      if (!user) throw new Error("Please sign in again.");

      const token = await user.getIdToken();
      const response = await fetch(path, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init?.headers || {}),
        },
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load your fitness data.");
      }

      return data;
    },
    [user],
  );

  const load = useCallback(async () => {
    if (!user) return;

    setLoading(true);

    try {
      const overview = await tokenRequest(
        `/api/dashboard?date=${encodeURIComponent(selectedDate)}`,
      );
      setSummary(overview);
      setWeights(
        (overview.records.weights || [])
          .slice()
          .sort((a: Weight, b: Weight) => {
            // Primary: date string ascending
            const dateDiff = a.date.localeCompare(b.date);
            if (dateDiff !== 0) return dateDiff;
            // Secondary: createdAt timestamp ascending (same-day chronological order)
            const aCreated = (a as Weight & { createdAt?: string }).createdAt ?? "";
            const bCreated = (b as Weight & { createdAt?: string }).createdAt ?? "";
            return aCreated.localeCompare(bCreated);
          }),
      );
      setWorkouts(overview.records.workouts || []);
      setPlan(overview.days || []);
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load your overview.",
      );
    } finally {
      setLoading(false);
    }
  }, [user, selectedDate, tokenRequest]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("fitness-record-saved", refresh);

    return () =>
      window.removeEventListener("fitness-record-saved", refresh);
  }, [load]);

  const totals = summary?.userTotals;
  const chosenDay = weekNames[indexFor(selectedDate)];
  const routines =
    plan.find((day) => day.day === chosenDay)?.routines || [];
  const selectedDayWorkouts = workouts.filter((workout) => workout.date === selectedDate);
  const loggedRoutineIds = new Set(
    selectedDayWorkouts
      .filter((workout) => !workout.planDay || workout.planDay === chosenDay)
      .map((workout) => workout.planRoutineId)
      .filter((id): id is string => Boolean(id)),
  );
  const routinesToShow = routines.filter((routine) =>
    !loggedRoutineIds.has(routine.id) &&
    !selectedDayWorkouts.some((workout) =>
      (!workout.planDay || workout.planDay === chosenDay) && workout.notes === routine.name,
    ),
  );
  const hasLoggedWeight =
    weights.some((weight) => weight.date === selectedDate) ||
    (summary?.date === selectedDate && summary.hasWeightForDate);

  const thisWeek = useMemo(() => {
    const selected = fromKey(selectedDate);
    const offset = (selected.getDay() + 6) % 7;
    const monday = new Date(selected);
    monday.setDate(selected.getDate() - offset);

    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return key(date);
    });
  }, [selectedDate]);

  const weightsForChart = weights
    .filter((weight) => weight.date <= selectedDate)
    .slice(-24);

  const min = weightsForChart.length
    ? Math.min(...weightsForChart.map((weight) => weight.weightKg))
    : 0;

  const max = Math.max(
    ...weightsForChart.map((weight) => weight.weightKg),
    min + 1,
  );

  const points = weightsForChart
    .map(
      (weight, index) =>
        `${weightsForChart.length < 2 ? 250 : (index * 500) / (weightsForChart.length - 1)},${130 - ((weight.weightKg - min) / (max - min || 1)) * 110}`,
    )
    .join(" ");

  const streak = (() => {
    const dates = new Set(workouts.map((workout) => workout.date));
    const date = new Date();

    if (!dates.has(key(date))) date.setDate(date.getDate() - 1);

    let count = 0;

    while (dates.has(key(date)) && count < 365) {
      count++;
      date.setDate(date.getDate() - 1);
    }

    return count;
  })();

  const latestWeight =
    weights.filter((weight) => weight.date <= selectedDate).at(-1)
      ?.weightKg ?? null;

  async function saveWeight() {
    const value = Number(weightInput);

    if (!Number.isFinite(value) || value < 1 || value > 500) {
      setError("Enter a weight between 1 and 500 kg.");
      return;
    }

    setSavingWeight(true);

    try {
      await tokenRequest("/api/fitness/weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedDate,
          weightKg: value,
          notes: "",
        }),
      });

      setWeightInput("");
      setNotice("Weight check-in saved.");
      await load();
      window.setTimeout(() => setNotice(""), 2500);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save weight.",
      );
    } finally {
      setSavingWeight(false);
    }
  }

  async function moveRoutine(routine: Routine) {
    const destination = indexFor(selectedDate);

    const nextPlan = weekNames.map((day) => ({
      day,
      routines: (plan.find((entry) => entry.day === day)?.routines || [])
        .filter((entry) => entry.id !== routine.id),
    }));

    const exists = nextPlan[destination].routines.some(
      (entry) => entry.id === routine.id,
    );

    if (!exists) {
      nextPlan[destination].routines = [
        ...nextPlan[destination].routines,
        routine,
      ];
    }

    try {
      await tokenRequest("/api/fitness/plans", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: nextPlan }),
      });

      setPlan(nextPlan);
      setNotice(`Scheduled ${routine.name} for ${chosenDay}.`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not reschedule routine.",
      );
    }
  }

  const hour = new Date().getHours();
  const greeting =
    hour < 12
      ? "Good morning"
      : hour < 18
        ? "Good afternoon"
        : "Good evening";

  const ringGoal = summary?.goals?.calories
    ? {
        name: "calorie",
        unit: "kcal",
        goal: summary.goals.calories,
        value: totals?.calories ?? 0,
      }
    : summary?.goals?.protein
      ? {
          name: "protein",
          unit: "g",
          goal: summary.goals.protein,
          value: totals?.protein ?? 0,
        }
      : null;

  const ring = ringGoal
    ? (() => {
        const goal = Number(ringGoal.goal);
        const rawValue = Number(ringGoal.value);
        const value = Number.isFinite(rawValue) ? Math.max(0, rawValue) : 0;
        const ratio = Number.isFinite(goal) && goal > 0 ? value / goal : 0;

        return {
          name: ringGoal.name,
          unit: ringGoal.unit,
          value: Math.max(0, Math.min(1, ratio)),
          pct: Math.round(ratio * 100),
          left: goal - value,
        };
      })()
    : null;

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center text-ink-soft">
        Signing you in…
      </main>
    );
  }

  const selected = fromKey(selectedDate);

  const prev = () => {
    const date = fromKey(selectedDate);
    date.setDate(date.getDate() - 1);
    setSelectedDate(key(date));
  };

  const next = () => {
    const date = fromKey(selectedDate);
    date.setDate(date.getDate() + 1);
    setSelectedDate(key(date));
  };

  return (
    <main className="min-h-screen text-ink">
      {/* Main dashboard content — compact top spacing */}
      <div className="mx-auto max-w-6xl space-y-5 px-4 pt-3 pb-6 sm:px-8 sm:py-6">
        <section className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Your day, at a glance</p>
            <h1 className="mt-2 text-[2rem] font-bold leading-tight sm:text-4xl">
              {greeting}, {user.displayName?.split(/\s+/)[0] || "athlete"}.
            </h1>
            <p className="mt-2 text-sm text-ink-soft">
              Your personal food, hydration, weight and workout tracking.
              Join a workspace to share activity with a partner.
            </p>
          </div>

          <label className="text-xs font-semibold text-ink-mute">
            Choose date
            <input
              aria-label="Overview date"
              type="date"
              value={selectedDate}
              onChange={(event) => {
                if (event.target.value) setSelectedDate(event.target.value);
              }}
              className="mt-1 block rounded-2xl border border-line-strong bg-field px-3 py-2 text-sm text-ink"
            />
          </label>
        </section>

        <section className="card rounded-3xl border border-line p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <button
              onClick={prev}
              aria-label="Previous day"
              className="rounded-xl px-3 py-2 text-xl"
            >
              ‹
            </button>
            <p className="font-semibold">
              {selected.toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </p>
            <button
              onClick={next}
              aria-label="Next day"
              className="rounded-xl px-3 py-2 text-xl"
            >
              ›
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1">
            {thisWeek.map((date, index) => (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
                aria-pressed={date === selectedDate}
                className={`rounded-2xl px-1 py-2 text-center ${
                  date === selectedDate
                    ? "bg-butter text-butter-ink"
                    : "hover:bg-sunken"
                }`}
              >
                <span
                  className={`block text-[11px] ${
                    date === selectedDate
                      ? "text-butter-ink/60"
                      : "text-ink-mute"
                  }`}
                >
                  {weekNames[index].slice(0, 2)}
                </span>
                <span className="mt-1 block text-sm font-semibold">
                  {Number(date.slice(-2))}
                </span>
                <span
                  className={`mx-auto mt-1 block h-1.5 w-1.5 rounded-full ${
                    workouts.some((workout) => workout.date === date)
                      ? "bg-butter"
                      : plan.find(
                            (day) => day.day === weekNames[indexFor(date)],
                          )?.routines.length
                        ? "bg-warn"
                        : "bg-transparent"
                  }`}
                />
              </button>
            ))}
          </div>
        </section>

        {error && (
          <p
            role="alert"
            className="rounded-2xl border border-warn/30 bg-warn/10 p-3 text-sm text-warn"
          >
            {error}
          </p>
        )}

        {notice && (
          <p role="status" className="text-sm text-periwinkle">
            {notice}
          </p>
        )}

        {loading ? (
          <p className="card rounded-2xl p-6 text-sm text-ink-soft">
            Loading {selectedDate}…
          </p>
        ) : (
          <>
            {/* Daily Balance hero */}
            <section className="card relative overflow-hidden rounded-[2rem] border border-periwinkle/20 p-5 sm:p-7 lg:p-8">
              <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-periwinkle/10 blur-3xl" />

              <div className="relative grid items-center gap-6 sm:grid-cols-[auto_1fr_auto]">
                <div className="flex justify-center">
                  <Ring
                    value={ring ? ring.value : 0}
                    size={172}
                    stroke={15}
                    label={
                      ring
                        ? `${ring.pct}% of your daily ${ring.name} goal`
                        : "No daily goal set yet"
                    }
                  >
                    {ring ? (
                      <div>
                        <p className="num text-4xl font-bold">
                          {ring.pct}
                          <span className="text-xl">%</span>
                        </p>
                        <p className="mt-0.5 text-xs text-ink-mute">
                          of {ring.name} goal
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="num text-3xl font-bold">
                          {Math.round(totals?.calories ?? 0).toLocaleString()}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-mute">
                          kcal logged
                        </p>
                      </div>
                    )}
                  </Ring>
                </div>

                <div className="min-w-0 text-center sm:text-left">
                  <p className="eyebrow">Daily balance</p>
                  <h2 className="mt-2 text-xl font-bold leading-snug sm:text-2xl">
                    {ring
                      ? ring.left > 0
                        ? `${Math.round(ring.left).toLocaleString()} ${ring.unit} to your ${ring.name} goal.`
                        : `${ring.name[0].toUpperCase() + ring.name.slice(1)} goal reached.`
                      : "Your progress starts with one small step."}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                    {ring
                      ? `${Math.round(totals?.calories ?? 0).toLocaleString()} kcal logged today. Keep building your daily consistency.`
                      : "Log a meal to see your daily balance and keep your nutrition on track."}
                  </p>
                  <p className="note mt-4 text-xl">
                    {streak > 0
                      ? `${streak}-day training streak`
                      : "Every small rep counts"}
                  </p>
                </div>

                <div className="hidden justify-self-end sm:block">
                  <PlantScene className="h-36 w-auto lg:h-40" />
                </div>
              </div>

              <dl className="relative mt-7 grid grid-cols-2 gap-3 border-t border-line pt-5 sm:grid-cols-4 sm:gap-0 sm:divide-x sm:divide-line">
                {([
                  {
                    label: "Calories",
                    icon: "flame",
                    value: totals?.calories ?? 0,
                    unit: "kcal",
                    goal: summary?.goals?.calories ?? null,
                  },
                  {
                    label: "Protein",
                    icon: "bolt",
                    value: totals?.protein ?? 0,
                    unit: "g",
                    goal: summary?.goals?.protein ?? null,
                  },
                  {
                    label: "Water",
                    icon: "drop",
                    value: totals?.waterMl ?? 0,
                    unit: "ml",
                    goal: null,
                  },
                  {
                    label: "Workouts",
                    icon: "dumbbell",
                    value: summary?.totals.workouts ?? 0,
                    unit: "that day",
                    goal: null,
                  },
                ] as {
                  label: string;
                  icon: IconName;
                  value: number;
                  unit: string;
                  goal: number | null;
                }[]).map((item) => (
                  <div
                    key={item.label}
                    className="min-w-0 rounded-2xl bg-sunken/50 p-3 text-center sm:rounded-none sm:bg-transparent sm:px-2 sm:py-1"
                  >
                    <dt className="flex flex-col items-center gap-1.5 text-xs font-semibold text-ink-mute">
                      <Icon
                        name={item.icon}
                        size={20}
                        className="text-periwinkle"
                      />
                      {item.label}
                    </dt>
                    <dd className="num mt-2 text-xl font-bold sm:text-2xl">
                      {Math.round(item.value).toLocaleString()}
                    </dd>
                    <dd className="mt-0.5 text-xs text-ink-mute">
                      {item.unit}
                    </dd>
                    {item.goal != null && (
                      <dd className="mt-1 text-[11px] text-ink-mute">
                        {Math.max(0, item.goal - item.value).toLocaleString()}{" "}
                        to go
                      </dd>
                    )}
                  </div>
                ))}
              </dl>
            </section>

            <section className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
              <article className="card rounded-3xl border border-line p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold">
                      {selectedDate === key(new Date())
                        ? "Today’s plan"
                        : `${chosenDay} plan`}
                    </h2>
                    <p className="mt-1 text-xs text-ink-mute">
                      Choose a routine to begin or move it to this day
                    </p>
                  </div>
                  <button
                    onClick={() => router.push("/plan")}
                    className="text-sm text-periwinkle"
                  >
                    Edit week
                  </button>
                </div>

                {routinesToShow.length ? (
                  <div className="mt-4 space-y-3">
                    {routinesToShow.map((routine) => (
                      <div
                        key={routine.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-sunken p-4"
                      >
                        <div>
                          <p className="font-semibold">{routine.name}</p>
                          <p className="mt-1 text-xs text-ink-mute">
                            {routine.exercises.length} exercises ·{" "}
                            {routine.workoutType}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => void moveRoutine(routine)}
                            className="rounded-xl border border-line px-3 py-2 text-xs"
                          >
                            Reschedule here
                          </button>
                          <button
                            onClick={() =>
                              router.push(
                                `/workout?day=${encodeURIComponent(chosenDay)}&date=${encodeURIComponent(selectedDate)}&routine=${encodeURIComponent(routine.id)}`,
                              )
                            }
                            className="rounded-xl bg-butter px-4 py-2 text-sm font-bold text-butter-ink"
                          >
                            Start
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : selectedDayWorkouts.length > 0 ? (
                  <p className="mt-4 rounded-2xl bg-sunken p-5 text-sm text-ink-soft">
                    Today’s planned routine is complete. You can still log another workout from Quick start.
                  </p>
                ) : (
                  <div className="mt-4 rounded-2xl bg-sunken p-5 text-sm text-ink-soft">
                    No routine scheduled for {chosenDay}. Add one in Plan, or
                    start a quick session.
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => router.push("/plan")}
                        className="rounded-xl border border-line px-3 py-2 text-xs"
                      >
                        Open Plan
                      </button>
                      <button
                        onClick={() => router.push("/workout")}
                        className="rounded-xl bg-butter px-3 py-2 text-xs font-bold text-butter-ink"
                      >
                        Quick start
                      </button>
                    </div>
                  </div>
                )}

                {selectedDayWorkouts.length > 0 && (
                  <div className="mt-5 border-t border-line pt-4">
                    <h3 className="text-sm font-semibold">Logged workouts · {selectedDate}</h3>
                    <div className="mt-3 space-y-3">
                      {selectedDayWorkouts.map((workout) => {
                        const muscles = [...new Set((workout.exercises || [])
                          .map((item) => inferExerciseMuscle(item.name, item.muscle))
                          .filter((muscle): muscle is string => Boolean(muscle)))];
                        return (
                          <div key={workout.id} className="rounded-2xl bg-sunken p-4">
                            <p className="font-medium">{workout.notes || workout.workoutType || "Workout"}</p>
                            {workout.exercises?.map((item, index) => (
                              <p key={`${workout.id}-${index}`} className="mt-1 text-xs text-ink-soft">
                                {item.name} · {item.sets} sets × {item.reps} reps
                              </p>
                            ))}
                            <p className="mt-2 text-xs text-periwinkle">Muscles worked: {muscles.length ? muscles.join(", ") : "Not tagged"}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </article>

              <article className="card rounded-3xl border border-periwinkle/20 bg-lavender/35 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold">Body weight</h2>
                    <p className="mt-1 text-xs text-ink-mute">
                      Latest on or before {selectedDate}
                    </p>
                  </div>
                  <p className="text-xl font-bold text-periwinkle">
                    {latestWeight === null ? "—" : `${latestWeight} kg`}
                  </p>
                </div>

                {weightsForChart.length > 1 ? (
                  <svg
                    viewBox="0 0 500 150"
                    role="img"
                    aria-label="Weight trend from saved weigh-ins"
                    className="mt-4 h-32 w-full"
                  >
                    <polyline
                      points={points}
                      fill="none"
                      stroke="var(--c-periwinkle)"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {weightsForChart.map((weight, index) => (
                      <circle
                        key={weight.id}
                        cx={
                          weightsForChart.length < 2
                            ? 250
                            : (index * 500) / (weightsForChart.length - 1)
                        }
                        cy={
                          130 -
                          ((weight.weightKg - min) / (max - min || 1)) * 110
                        }
                        r="4"
                        fill="var(--c-periwinkle)"
                      />
                    ))}
                  </svg>
                ) : (
                  <p className="py-6 text-center text-sm text-ink-mute">
                    Your trend appears after a few weigh-ins.
                  </p>
                )}

                {!hasLoggedWeight ? <div className="mt-3 flex gap-2">
                  <input
                    aria-label="Weight in kilograms"
                    value={weightInput}
                    onChange={(event) => setWeightInput(event.target.value)}
                    type="number"
                    min="1"
                    max="500"
                    step="0.1"
                    placeholder="kg"
                    className="min-w-0 flex-1 rounded-xl bg-field px-3 py-2 text-sm"
                  />
                  <button
                    disabled={savingWeight || !weightInput}
                    onClick={() => void saveWeight()}
                    className="rounded-xl bg-butter px-4 py-2 text-sm font-bold text-butter-ink disabled:opacity-50"
                  >
                    {savingWeight ? "Saving…" : "＋ Log"}
                  </button>
                </div> : <p className="mt-3 rounded-xl bg-field px-3 py-2 text-sm text-ink-soft">Weight logged for {selectedDate}.</p>}

                <button
                  onClick={() => router.push("/tracker")}
                  className="mt-3 text-xs text-ink-soft"
                >
                  Open full tracker
                </button>
              </article>
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
              <article className="card rounded-3xl border border-line p-5">
                <h2 className="font-semibold">At the gym · check in</h2>
                <p className="mt-2 text-sm text-ink-soft">
                  Log a meal, water, weight, or movement with your fitness
                  buddy. Entries save to your private or shared tracker
                  automatically.
                </p>
                <button
                  onClick={() => router.push("/tracker")}
                  className="mt-4 rounded-xl border border-line px-4 py-2 text-sm"
                >
                  Open Tracker
                </button>
              </article>

              <article className="card rounded-3xl border border-line p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold">Training streak</h2>
                    <p className="mt-2 text-sm text-ink-soft">
                      {streak} consecutive days · {workouts.length} saved
                      workouts
                    </p>
                  </div>
                  <span className="text-3xl text-warn" aria-hidden="true">
                    ♨
                  </span>
                </div>
                <button
                  onClick={() => router.push("/stats")}
                  className="mt-4 text-sm text-periwinkle"
                >
                  Explore Stats →
                </button>
              </article>
            </section>
          </>
        )}

        <footer className="border-t border-line pt-4 text-xs text-ink-mute">
          {user.email} · Viewing {summary?.date ?? selectedDate}
        </footer>
      </div>
    </main>
  );
}
