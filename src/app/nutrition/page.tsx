

"use client";

import {

  useCallback,

  useEffect,

  useMemo,

  useState,

  type FormEvent,

} from "react";

import { onAuthStateChanged, type User } from "firebase/auth";

import { useRouter } from "next/navigation";

import { auth } from "@/lib/firebase";

import NaturalLog from "@/app/components/natural-log";

type NutritionRecord = {

  id: string;

  foodName: string;

  mealType: string;

  servings: number;

  calories: number;

  protein: number;

  carbs: number;

  fat: number;

  date: string;

  notes: string;

  loggedBy: string;

  loggedByName: string;

  aiEstimated?: boolean;

  createdAt: string | null;

  updatedAt: string | null;

};

type NutritionGoals = {

  calories: number | null;

  protein: number | null;

  carbs: number | null;

  fat: number | null;

  waterMl: number | null;

  weightKg: number | null;

};

type NutritionForm = {

  foodName: string;

  mealType: string;

  servings: string;

  calories: string;

  protein: string;

  carbs: string;

  fat: string;

  date: string;

  notes: string;

};

type ApiResult = {

  error?: string;

  records?: NutritionRecord[];

  hasMore?: boolean;

  nextCursor?: string | null;

  goals?: NutritionGoals | null;

  success?: boolean;

};

const DEFAULT_GOALS: NutritionGoals = {

  calories: 2400,

  protein: 120,

  carbs: 300,

  fat: 70,

  waterMl: null,

  weightKg: null,

};

const inputClass =

  "mt-1 w-full rounded-xl border border-line bg-field px-3 py-3 text-sm text-ink outline-none transition placeholder:text-ink-mute focus:border-periwinkle focus:ring-2 focus:ring-periwinkle/15";

const primaryButton =

  "inline-flex items-center justify-center rounded-xl bg-butter px-4 py-3 text-sm font-bold text-butter-ink transition hover:bg-butter-hover disabled:cursor-not-allowed disabled:opacity-50";

const secondaryButton =

  "inline-flex items-center justify-center rounded-xl border border-line px-3 py-2 text-sm font-medium text-ink-soft transition hover:border-periwinkle/50 hover:text-periwinkle disabled:opacity-50";

function getToday() {

  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

}

function emptyForm(date = getToday()): NutritionForm {

  return {

    foodName: "",

    mealType: "Snack",

    servings: "1",

    calories: "",

    protein: "",

    carbs: "",

    fat: "",

    date,

    notes: "",

  };

}

function formatNumber(value: number) {

  return Number.isInteger(value) ? String(value) : value.toFixed(1);

}

function clampPercent(value: number, target: number) {

  if (target <= 0) return 0;

  return Math.min(100, Math.max(0, (value / target) * 100));

}

function MacroProgress({

  label,

  value,

  target,

  unit = "g",

  tone = "bg-periwinkle",

}: {

  label: string;

  value: number;

  target: number | null;

  unit?: string;

  tone?: string;

}) {

  const percent = target && target > 0 ? clampPercent(value, target) : 0;

  return (

    <div className="rounded-2xl border border-line bg-surface p-4">

      <div className="flex items-start justify-between gap-2">

        <div>

          <p className="text-xs font-medium text-ink-mute">{label}</p>

          <p className="mt-1 text-xl font-bold tabular-nums text-ink">

            {formatNumber(value)}

            <span className="ml-1 text-xs font-medium text-ink-mute">

              {unit}

            </span>

          </p>

        </div>

        {target !== null && target > 0 && (

          <span className="text-right text-xs text-ink-mute">

            of {formatNumber(target)}

            {unit}

          </span>

        )}

      </div>

      <div

        className="mt-3 h-2 overflow-hidden rounded-full bg-sunken"

        role="progressbar"

        aria-label={`${label} progress`}

        aria-valuemin={0}

        aria-valuemax={target ?? 100}

        aria-valuenow={value}

      >

        <div

          className={`h-full rounded-full transition-all duration-500 ${tone}`}

          style={{ width: `${target && target > 0 ? percent : 0}%` }}

        />

      </div>

      <p className="mt-2 text-xs text-ink-mute">

        {target !== null && target > 0

          ? value > target

            ? `${formatNumber(value - target)}${unit} over target`

            : `${formatNumber(target - value)}${unit} remaining`

          : "Set a personal target"}

      </p>

    </div>

  );

}

export default function NutritionPage() {

  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);

  const [authLoading, setAuthLoading] = useState(true);

  const [records, setRecords] = useState<NutritionRecord[]>([]);

  const [selectedDate, setSelectedDate] = useState(getToday());

  const [goals, setGoals] = useState<NutritionGoals>(DEFAULT_GOALS);

  const [savedGoals, setSavedGoals] =

    useState<NutritionGoals>(DEFAULT_GOALS);

  const [goalsLoaded, setGoalsLoaded] = useState(false);

  const [showGoalSettings, setShowGoalSettings] = useState(false);

  const [savingGoals, setSavingGoals] = useState(false);

  const [form, setForm] = useState<NutritionForm>(emptyForm());

  const [editingId, setEditingId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);

  const [loading, setLoading] = useState(false);

  const [loadingRecords, setLoadingRecords] = useState(false);

  const [loadingMore, setLoadingMore] = useState(false);

  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [error, setError] = useState("");

  const [message, setMessage] = useState("");

  useEffect(() => {

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {

      setUser(currentUser);

      setAuthLoading(false);

      if (!currentUser) {

        router.replace("/login");

      }

    });

    return () => unsubscribe();

  }, [router]);

  const apiRequest = useCallback(

    async (

      path: string,

      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET",

      body?: object,

    ): Promise<ApiResult> => {

      if (!user) {

        throw new Error("Please sign in again.");

      }

      const token = await user.getIdToken();

      const response = await fetch(path, {

        method,

        headers: {

          Authorization: `Bearer ${token}`,

          ...(body ? { "Content-Type": "application/json" } : {}),

        },

        ...(body ? { body: JSON.stringify(body) } : {}),

        cache: "no-store",

      });

      const data = (await response.json().catch(() => ({}))) as ApiResult;

      if (!response.ok) {

        throw new Error(data.error || "Something went wrong.");

      }

      return data;

    },

    [user],

  );

  const loadRecords = useCallback(async () => {

    if (!user) return;

    setLoadingRecords(true);

    setError("");

    try {

      const params = new URLSearchParams({ date: selectedDate });

      const data = await apiRequest(`/api/nutrition?${params.toString()}`);

      setRecords(data.records ?? []);

      setNextCursor(data.hasMore ? data.nextCursor ?? null : null);

    } catch (err) {

      setRecords([]);

      setNextCursor(null);

      setError(

        err instanceof Error

          ? err.message

          : "Could not load nutrition records.",

      );

    } finally {

      setLoadingRecords(false);

    }

  }, [apiRequest, selectedDate, user]);

  const loadGoals = useCallback(async () => {

    if (!user) return;

    try {

      const data = await apiRequest("/api/goals");

      const stored = data.goals;

      if (stored) {

        const loaded: NutritionGoals = {

          calories: stored.calories ?? DEFAULT_GOALS.calories,

          protein: stored.protein ?? DEFAULT_GOALS.protein,

          carbs: stored.carbs ?? DEFAULT_GOALS.carbs,

          fat: stored.fat ?? DEFAULT_GOALS.fat,

          waterMl: stored.waterMl ?? null,

          weightKg: stored.weightKg ?? null,

        };

        setGoals(loaded);

        setSavedGoals(loaded);

      } else {

        setGoals(DEFAULT_GOALS);

        setSavedGoals(DEFAULT_GOALS);

      }

    } catch (err) {

      setError(

        err instanceof Error

          ? `Could not load your goals: ${err.message}`

          : "Could not load your goals.",

      );

    } finally {

      setGoalsLoaded(true);

    }

  }, [apiRequest, user]);

  // Defer initial data loads so effects don't synchronously trigger

  // state updates during their own execution.

  useEffect(() => {

    if (!user) return;

    const timer = window.setTimeout(() => {

      void loadRecords();

    }, 0);

    return () => window.clearTimeout(timer);

  }, [user, loadRecords]);

  useEffect(() => {

    if (!user) return;

    const timer = window.setTimeout(() => {

      void loadGoals();

    }, 0);

    return () => window.clearTimeout(timer);

  }, [user, loadGoals]);

  useEffect(() => {

    const handleSavedRecord = () => {

      void loadRecords();

    };

    window.addEventListener("fitness-record-saved", handleSavedRecord);

    return () => {

      window.removeEventListener("fitness-record-saved", handleSavedRecord);

    };

  }, [loadRecords]);

  const loadMoreRecords = useCallback(async () => {

    if (!user || !nextCursor) return;

    setLoadingMore(true);

    setError("");

    try {

      const params = new URLSearchParams({

        date: selectedDate,

        cursor: nextCursor,

      });

      const data = await apiRequest(`/api/nutrition?${params.toString()}`);

      setRecords((previous) => {

        const known = new Set(previous.map((record) => record.id));

        return [

          ...previous,

          ...(data.records ?? []).filter((record) => !known.has(record.id)),

        ];

      });

      setNextCursor(data.hasMore ? data.nextCursor ?? null : null);

    } catch (err) {

      setError(

        err instanceof Error

          ? err.message

          : "Could not load more entries.",

      );

    } finally {

      setLoadingMore(false);

    }

  }, [apiRequest, nextCursor, selectedDate, user]);

  const totals = useMemo(

    () =>

      records.reduce(

        (result, record) => ({

          calories: result.calories + record.calories,

          protein: result.protein + record.protein,

          carbs: result.carbs + record.carbs,

          fat: result.fat + record.fat,

        }),

        { calories: 0, protein: 0, carbs: 0, fat: 0 },

      ),

    [records],

  );

  const caloriesTarget = goals.calories ?? 2400;

  const caloriesRemaining = caloriesTarget - totals.calories;

  const caloriePercent = clampPercent(totals.calories, caloriesTarget);

  const chronologicalRecords = useMemo(

    () =>

      [...records].sort((a, b) => {

        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;

        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;

        return timeB - timeA;

      }),

    [records],

  );

  function startNewEntry() {

    setEditingId(null);

    setForm(emptyForm(selectedDate));

    setShowForm(true);

    setError("");

    setMessage("");

  }

  function startEditing(record: NutritionRecord) {

    setEditingId(record.id);

    setForm({

      foodName: record.foodName,

      mealType: record.mealType || "Snack",

      servings: String(record.servings),

      calories: String(record.calories),

      protein: String(record.protein),

      carbs: String(record.carbs),

      fat: String(record.fat),

      date: record.date,

      notes: record.notes ?? "",

    });

    setShowForm(true);

    setError("");

    setMessage("");

  }

  function updateForm<K extends keyof NutritionForm>(

    key: K,

    value: NutritionForm[K],

  ) {

    setForm((previous) => ({ ...previous, [key]: value }));

  }

  function updateGoal(
  key: "calories" | "protein" | "carbs" | "fat" | "waterMl",
  value: string,
) {

    setGoals((previous) => ({

      ...previous,

      [key]: value === "" ? null : Number(value),

    }));

  }

  async function saveGoals(event: FormEvent<HTMLFormElement>) {

    event.preventDefault();

    if (!user) return;

    setSavingGoals(true);

    setError("");

    setMessage("");

    try {

      const payload: NutritionGoals = {

        calories: goals.calories,

        protein: goals.protein,

        carbs: goals.carbs,

        fat: goals.fat,

        waterMl: goals.waterMl,

        weightKg: savedGoals.weightKg,

      };

      const data = await apiRequest("/api/goals", "PUT", payload);

      const returned = data.goals ?? payload;

      const updated: NutritionGoals = {

        calories: returned.calories ?? null,

        protein: returned.protein ?? null,

        carbs: returned.carbs ?? null,

        fat: returned.fat ?? null,

        waterMl: returned.waterMl ?? null,

        weightKg: returned.weightKg ?? null,

      };

      setGoals(updated);

      setSavedGoals(updated);

      setShowGoalSettings(false);

      setMessage("Your nutrition targets have been saved.");

    } catch (err) {

      setError(

        err instanceof Error

          ? err.message

          : "Could not save your targets.",

      );

    } finally {

      setSavingGoals(false);

    }

  }

  async function saveEntry(event: FormEvent<HTMLFormElement>) {

    event.preventDefault();

    if (!form.foodName.trim()) return;

    setLoading(true);

    setError("");

    setMessage("");

    const payload = {

      foodName: form.foodName.trim(),

      mealType: form.mealType,

      servings: Number(form.servings),

      calories: Number(form.calories),

      protein: Number(form.protein),

      carbs: Number(form.carbs),

      fat: Number(form.fat),

      date: form.date,

      notes: form.notes.trim(),

    };

    try {

      if (editingId) {

        await apiRequest(

          `/api/nutrition/${encodeURIComponent(editingId)}`,

          "PATCH",

          payload,

        );

        setMessage("Food entry updated.");

      } else {

        await apiRequest("/api/nutrition", "POST", payload);

        setMessage("Food entry added.");

      }

      setShowForm(false);

      setEditingId(null);

      await loadRecords();

      window.dispatchEvent(new CustomEvent("fitness-record-saved"));

    } catch (err) {

      setError(

        err instanceof Error

          ? err.message

          : "Could not save the entry.",

      );

    } finally {

      setLoading(false);

    }

  }

  async function deleteEntry(record: NutritionRecord) {

    if (!window.confirm(`Delete "${record.foodName}" from your food log?`)) {

      return;

    }

    setLoading(true);

    setError("");

    setMessage("");

    try {

      await apiRequest(

        `/api/nutrition/${encodeURIComponent(record.id)}`,

        "DELETE",

      );

      setMessage("Food entry deleted.");

      if (editingId === record.id) {

        setShowForm(false);

        setEditingId(null);

      }

      await loadRecords();

      window.dispatchEvent(new CustomEvent("fitness-record-saved"));

    } catch (err) {

      setError(

        err instanceof Error

          ? err.message

          : "Could not delete the entry.",

      );

    } finally {

      setLoading(false);

    }

  }

  if (authLoading || !user) {

    return (

      <main className="flex min-h-screen items-center justify-center text-ink-soft">

        <div className="text-center">

          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-periwinkle/25 border-t-periwinkle" />

          Checking your account...

        </div>

      </main>

    );

  }

  return (

    <main className="min-h-screen px-4 py-5 text-ink sm:px-8 sm:py-8">

      <div className="mx-auto max-w-6xl">

        <header className="mb-7 flex flex-wrap items-center justify-between gap-4">

          <div>

            <button

              type="button"

              onClick={() => router.push("/dashboard")}

              className="mb-4 text-sm text-ink-mute transition hover:text-periwinkle"

            >

              ← Back to dashboard

            </button>

            <p className="text-xs font-bold uppercase tracking-[0.22em] text-periwinkle">

              Eat well. Get stronger.

            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">

              Your nutrition<span className="text-periwinkle">.</span>

            </h1>

            <p className="mt-2 max-w-xl text-sm leading-6 text-ink-soft">

              Tell KAIRO what you ate. Keep your targets personal, your

              tracking simple, and your progress visible.

            </p>

          </div>

          <button

            type="button"

            onClick={() => setShowGoalSettings((value) => !value)}

            className={secondaryButton}

          >

            <span aria-hidden="true" className="mr-2">⚙</span>

            {showGoalSettings ? "Close targets" : "My targets"}

          </button>

        </header>

        {error && (

          <div

            role="alert"

            className="mb-5 rounded-2xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger"

          >

            {error}

          </div>

        )}

        {message && (

          <div

            role="status"

            className="mb-5 rounded-2xl border border-periwinkle/25 bg-periwinkle/10 px-4 py-3 text-sm text-periwinkle"

          >

            {message}

          </div>

        )}

        {showGoalSettings && (

          <section className="mb-5 rounded-3xl border border-periwinkle/25 bg-surface p-5 sm:p-6">

            <div className="mb-5">

              <p className="text-xs font-bold uppercase tracking-wider text-periwinkle">

                Personal settings

              </p>

              <h2 className="mt-1 text-xl font-bold">Your daily targets</h2>

              <p className="mt-2 text-sm leading-6 text-ink-mute">

                Choose the numbers that fit your goal. These targets are saved

                to your account and used to calculate your daily progress.

              </p>

            </div>

            <form onSubmit={saveGoals}>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">

                {(

                  [

                    ["calories", "Calories", "kcal", 500, 10000],
                    ["waterMl", "Water", "ml", 250, 10000],
                    ["protein", "Protein", "g", 0, 1000],
                    ["carbs", "Carbs", "g", 0, 1500],
                    ["fat", "Fat", "g", 0, 1000],

                  ] as const

                ).map(([key, label, unit, min, max]) => (

                  <label

                    key={key}

                    className="rounded-2xl border border-line bg-field p-3 text-sm text-ink-soft"

                  >

                    <span className="block font-semibold text-ink">

                      {label}

                    </span>

                    <span className="mt-1 block text-xs text-ink-mute">

                      Daily target ({unit})

                    </span>

                    <input

                      required={key !== "waterMl"}

                      type="number"

                      min={min}

                      max={max}

                      step="1"

                      value={goals[key] ?? ""}

                      onChange={(event) =>

                        updateGoal(key, event.target.value)

                      }

                      className={inputClass}

                    />

                  </label>

                ))}

              </div>

              <div className="mt-5 flex flex-wrap gap-3">

                <button

                  type="submit"

                  disabled={savingGoals || !goalsLoaded}

                  className={primaryButton}

                >

                  {savingGoals ? "Saving targets..." : "Save my targets"}

                </button>

                <button

                  type="button"

                  onClick={() => {

                    setGoals(savedGoals);

                    setShowGoalSettings(false);

                  }}

                  className={secondaryButton}

                >

                  Cancel

                </button>

              </div>

            </form>

          </section>

        )}

        <section className="mb-5 overflow-hidden rounded-3xl border border-line bg-surface">

          <div className="grid gap-6 p-5 sm:p-7 md:grid-cols-[1fr_0.85fr] md:items-center">

            <div>

              <div className="flex flex-wrap items-center gap-2">

                <span className="rounded-full border border-periwinkle/25 bg-periwinkle/10 px-3 py-1 text-xs font-semibold text-periwinkle">

                  DAILY BALANCE

                </span>

                <span className="text-xs text-ink-mute">

                  {selectedDate === getToday() ? "Today" : selectedDate}

                </span>

              </div>

              <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">

                {caloriesRemaining >= 0

                  ? "You're making progress."

                  : "You've reached your target."}

              </h2>

              <p className="mt-2 max-w-md text-sm leading-6 text-ink-soft">

                {caloriesRemaining >= 0

                  ? "Every meal counts. Keep logging naturally and let your daily numbers take shape."

                  : "Your logged intake is above your calorie target today. One day doesn't define your progress."}

              </p>

              <div className="mt-6 grid grid-cols-2 gap-3">

                <div className="rounded-2xl border border-line bg-field p-4">

                  <p className="text-xs text-ink-mute">Consumed</p>

                  <p className="mt-1 text-2xl font-bold tabular-nums">

                    {formatNumber(totals.calories)}

                  </p>

                  <p className="text-xs text-ink-mute">kcal</p>

                </div>

                <div className="rounded-2xl border border-line bg-field p-4">

                  <p className="text-xs text-ink-mute">

                    {caloriesRemaining >= 0 ? "Remaining" : "Over target"}

                  </p>

                  <p className="mt-1 text-2xl font-bold tabular-nums">

                    {formatNumber(Math.abs(caloriesRemaining))}

                  </p>

                  <p className="text-xs text-ink-mute">kcal</p>

                </div>

              </div>

            </div>

            <div className="flex flex-col items-center justify-center rounded-3xl border border-line bg-field p-6">

              <div

                className="relative flex h-48 w-48 items-center justify-center rounded-full"

                style={{

                  background: `conic-gradient(var(--color-periwinkle, #9185df) ${caloriePercent * 3.6}deg, rgba(145,133,223,0.13) 0deg)`,

                }}

                role="img"

                aria-label={`${Math.round(caloriePercent)} percent of daily calorie target`}

              >

                <div className="flex h-40 w-40 flex-col items-center justify-center rounded-full border border-line bg-surface text-center">

                  <span className="text-3xl font-bold tabular-nums">

                    {Math.round(caloriePercent)}%

                  </span>

                  <span className="mt-1 text-xs text-ink-mute">

                    of daily goal

                  </span>

                </div>

              </div>

              <p className="mt-4 text-sm font-semibold">

                Target: {formatNumber(caloriesTarget)} kcal

              </p>

              {!goalsLoaded && (

                <p className="mt-1 text-xs text-ink-mute">

                  Loading saved targets...

                </p>

              )}

            </div>

          </div>

        </section>

        <section className="mb-5">

          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">

            <div>

              <p className="text-xs font-bold uppercase tracking-wider text-periwinkle">

                Supporting nutrition

              </p>

              <h2 className="mt-1 text-xl font-bold">Macros at a glance</h2>

            </div>

            <button

              type="button"

              onClick={() => setShowGoalSettings(true)}

              className="text-sm font-semibold text-periwinkle hover:underline"

            >

              Edit targets →

            </button>

          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">

            <MacroProgress

              label="Protein"

              value={totals.protein}

              target={goals.protein}

              tone="bg-periwinkle"

            />

            <MacroProgress

              label="Carbohydrates"

              value={totals.carbs}

              target={goals.carbs}

              tone="bg-butter"

            />

            <MacroProgress

              label="Fat"

              value={totals.fat}

              target={goals.fat}

              tone="bg-[#85b9a5]"

            />

          </div>

        </section>

        <section className="mb-5 rounded-3xl border border-line bg-surface p-4 sm:p-6">

          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">

            <div>

              <p className="text-xs font-bold uppercase tracking-wider text-periwinkle">

                Your AI nutrition buddy

              </p>

              <h2 className="mt-1 text-xl font-bold">What did you eat?</h2>

              <p className="mt-1 max-w-xl text-sm leading-6 text-ink-mute">

                Just describe your food in your own words. No need to sort

                everything into a meal category first.

              </p>

            </div>

          </div>

          <div className="rounded-2xl border border-line bg-field p-3 sm:p-4">

            <NaturalLog inline initialOpen />

          </div>

          <div className="mt-3 flex flex-wrap gap-2">

            {[

              "I had 3 eggs and 2 appams",

              "I drank 500 ml milk",

              "I ate rice, chicken and vegetables",

            ].map((example) => (

              <span

                key={example}

                className="rounded-full border border-line bg-surface px-3 py-2 text-xs text-ink-mute"

              >

                “{example}”

              </span>

            ))}

          </div>

        </section>

        <section className="mb-5 rounded-3xl border border-line bg-surface p-4 sm:p-6">

          <div className="flex flex-wrap items-center justify-between gap-3">

            <div>

              <p className="text-xs font-bold uppercase tracking-wider text-periwinkle">

                Food history

              </p>

              <h2 className="mt-1 text-xl font-bold">Your food timeline</h2>

              <p className="mt-1 text-sm text-ink-mute">

                Review, edit or remove anything you have logged.

              </p>

            </div>

            <button

              type="button"

              onClick={startNewEntry}

              className={primaryButton}

            >

              + Add manually

            </button>

          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-field p-3">

            <label className="text-sm font-medium text-ink-soft">

              Choose a date

              <input

                type="date"

                value={selectedDate}

                onChange={(event) => {

                  setSelectedDate(event.target.value);

                  setForm((previous) => ({

                    ...previous,

                    date: event.target.value,

                  }));

                }}

                className="ml-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink"

              />

            </label>

            <p className="text-xs text-ink-mute">

              {records.length} {records.length === 1 ? "entry" : "entries"} loaded

            </p>

          </div>

          {showForm && (

            <div className="mt-5 rounded-2xl border border-periwinkle/25 bg-field p-4 sm:p-5">

              <div className="mb-4 flex items-center justify-between gap-3">

                <h3 className="font-bold">

                  {editingId ? "Edit food entry" : "Add food entry"}

                </h3>

                <button

                  type="button"

                  onClick={() => {

                    setShowForm(false);

                    setEditingId(null);

                  }}

                  className="text-sm text-ink-mute hover:text-ink"

                >

                  Cancel

                </button>

              </div>

              <form onSubmit={saveEntry} className="space-y-4">

                <div className="grid gap-4 sm:grid-cols-2">

                  <label className="text-sm text-ink-soft">

                    Food name *

                    <input

                      required

                      maxLength={120}

                      value={form.foodName}

                      onChange={(event) =>

                        updateForm("foodName", event.target.value)

                      }

                      placeholder="e.g. Oats and milk"

                      className={inputClass}

                    />

                  </label>

                  <label className="text-sm text-ink-soft">

                    Category (optional)

                    <select

                      value={form.mealType}

                      onChange={(event) =>

                        updateForm("mealType", event.target.value)

                      }

                      className={inputClass}

                    >

                      {[

                        "Breakfast",

                        "Lunch",

                        "Dinner",

                        "Snack",

                        "Pre-workout",

                        "Post-workout",

                      ].map((meal) => (

                        <option key={meal} value={meal}>

                          {meal}

                        </option>

                      ))}

                    </select>

                  </label>

                  <label className="text-sm text-ink-soft">

                    Date *

                    <input

                      required

                      type="date"

                      value={form.date}

                      onChange={(event) =>

                        updateForm("date", event.target.value)

                      }

                      className={inputClass}

                    />

                  </label>

                  <label className="text-sm text-ink-soft">

                    Servings *

                    <input

                      required

                      type="number"

                      min="0.01"

                      max="100"

                      step="0.01"

                      value={form.servings}

                      onChange={(event) =>

                        updateForm("servings", event.target.value)

                      }

                      className={inputClass}

                    />

                  </label>

                </div>

                <div>

                  <p className="mb-3 text-sm font-semibold text-ink-soft">

                    Nutrition values for the whole entry

                  </p>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">

                    {(

                      [

                        ["calories", "Calories (kcal)", 10000],

                        ["protein", "Protein (g)", 1000],

                        ["carbs", "Carbs (g)", 1500],

                        ["fat", "Fat (g)", 1000],

                      ] as const

                    ).map(([key, label, max]) => (

                      <label key={key} className="text-sm text-ink-soft">

                        {label} *

                        <input

                          required

                          type="number"

                          min="0"

                          max={max}

                          step="0.1"

                          value={form[key]}

                          onChange={(event) =>

                            updateForm(key, event.target.value)

                          }

                          className={inputClass}

                        />

                      </label>

                    ))}

                  </div>

                </div>

                <label className="block text-sm text-ink-soft">

                  Notes (optional)

                  <textarea

                    maxLength={500}

                    rows={2}

                    value={form.notes}

                    onChange={(event) =>

                      updateForm("notes", event.target.value)

                    }

                    placeholder="Brand, preparation, or anything worth noting..."

                    className={inputClass}

                  />

                </label>

                <button

                  type="submit"

                  disabled={loading}

                  className={primaryButton}

                >

                  {loading

                    ? "Saving..."

                    : editingId

                      ? "Save changes"

                      : "Add food"}

                </button>

              </form>

            </div>

          )}

          <div className="mt-5">

            {loadingRecords ? (

              <div className="py-12 text-center text-sm text-ink-mute">

                Loading your food timeline...

              </div>

            ) : chronologicalRecords.length === 0 ? (

              <div className="rounded-2xl border border-dashed border-line px-5 py-12 text-center">

                <div className="text-3xl" aria-hidden="true">

                  🥗

                </div>

                <h3 className="mt-3 font-bold">

                  Nothing logged for this date

                </h3>

                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-ink-mute">

                  Use the AI chat above or add a food entry manually. Your

                  nutrition totals will update when entries are saved.

                </p>

                <button

                  type="button"

                  onClick={startNewEntry}

                  className={`${primaryButton} mt-5`}

                >

                  Add food manually

                </button>

              </div>

            ) : (

              <div className="space-y-3">

                {chronologicalRecords.map((record) => (

                  <article

                    key={record.id}

                    className="rounded-2xl border border-line bg-field p-4 transition hover:border-periwinkle/40"

                  >

                    <div className="flex flex-wrap items-start justify-between gap-3">

                      <div className="min-w-0 flex-1">

                        <div className="flex flex-wrap items-center gap-2">

                          <h3 className="break-words font-bold text-ink">

                            {record.foodName}

                          </h3>

                          {record.aiEstimated && (

                            <span className="rounded-full bg-warn/10 px-2 py-1 text-[10px] font-semibold text-warn">

                              AI estimate

                            </span>

                          )}

                        </div>

                        <p className="mt-1 text-xs text-ink-mute">

                          {record.servings} serving

                          {record.servings === 1 ? "" : "s"}

                          {record.mealType ? ` · ${record.mealType}` : ""}

                          {record.loggedByName

                            ? ` · Logged by ${record.loggedByName}`

                            : ""}

                        </p>

                        {record.notes && (

                          <p className="mt-2 break-words text-sm leading-5 text-ink-soft">

                            {record.notes}

                          </p>

                        )}

                      </div>

                      <div className="flex shrink-0 gap-2">

                        <button

                          type="button"

                          onClick={() => startEditing(record)}

                          disabled={loading}

                          className={secondaryButton}

                        >

                          Edit

                        </button>

                        <button

                          type="button"

                          onClick={() => void deleteEntry(record)}

                          disabled={loading}

                          className="rounded-xl border border-danger/25 px-3 py-2 text-sm text-danger transition hover:bg-danger/10 disabled:opacity-50"

                        >

                          Delete

                        </button>

                      </div>

                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">

                      {[

                        ["Calories", `${formatNumber(record.calories)} kcal`],

                        ["Protein", `${formatNumber(record.protein)} g`],

                        ["Carbs", `${formatNumber(record.carbs)} g`],

                        ["Fat", `${formatNumber(record.fat)} g`],

                      ].map(([label, value]) => (

                        <div

                          key={label}

                          className="rounded-xl border border-line bg-surface px-3 py-2"

                        >

                          <p className="text-[11px] text-ink-mute">{label}</p>

                          <p className="mt-1 text-sm font-bold">{value}</p>

                        </div>

                      ))}

                    </div>

                  </article>

                ))}

              </div>

            )}

            {nextCursor && !loadingRecords && (

              <button

                type="button"

                onClick={() => void loadMoreRecords()}

                disabled={loadingMore}

                className="mt-4 w-full rounded-xl border border-line px-4 py-3 text-sm font-semibold text-ink-soft transition hover:border-periwinkle/50 hover:text-periwinkle disabled:opacity-50"

              >

                {loadingMore ? "Loading more..." : "Load more entries"}

              </button>

            )}

          </div>

        </section>

        <p className="pb-4 text-center text-xs leading-5 text-ink-mute">

          Nutrition estimates are approximate, especially for home-cooked meals.

          Use food labels or reliable nutrition information when accuracy matters.

        </p>

      </div>

    </main>

  );

}
