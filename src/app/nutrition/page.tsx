
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

const MEAL_TYPES = [
  "Breakfast",
  "Lunch",
  "Dinner",
  "Snack",
  "Pre-workout",
  "Post-workout",
] as const;

type MealType = (typeof MEAL_TYPES)[number];

type NutritionRecord = {
  id: string;
  foodName: string;
  mealType: MealType;
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

type NutritionForm = {
  foodName: string;
  mealType: MealType;
  servings: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  date: string;
  notes: string;
};

const inputClass =
  "mt-1 w-full rounded-2xl border border-line card px-3 py-3 text-sm text-ink outline-none transition placeholder:text-ink-mute focus:border-periwinkle";

function getToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function emptyForm(date = getToday()): NutritionForm {
  return {
    foodName: "",
    mealType: "Breakfast",
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

export default function NutritionPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [records, setRecords] = useState<NutritionRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState(getToday());
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
      method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
      body?: object,
    ) => {
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

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        records?: NutritionRecord[];
        hasMore?: boolean;
        nextCursor?: string | null;
      };

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
      const data = await apiRequest(
        `/api/nutrition?date=${encodeURIComponent(selectedDate)}`,
      );

      setRecords(data.records ?? []);
      setNextCursor(data.hasMore ? data.nextCursor ?? null : null);
    } catch (err) {
      setRecords([]);

      setError(
        err instanceof Error
          ? err.message
          : "Could not load nutrition records.",
      );
    } finally {
      setLoadingRecords(false);
    }
  }, [apiRequest, selectedDate, user]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => void loadRecords(), 0);
    return () => window.clearTimeout(timer);
  }, [user, loadRecords]);

  const loadMoreRecords = useCallback(async () => {
    if (!user || !nextCursor) return;
    setLoadingMore(true);
    setError("");
    try {
      const params = new URLSearchParams({ date: selectedDate, cursor: nextCursor });
      const data = await apiRequest(`/api/nutrition?${params.toString()}`);
      setRecords((previous) => [...previous, ...(data.records ?? [])]);
      setNextCursor(data.hasMore ? data.nextCursor ?? null : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load more entries.");
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
      mealType: record.mealType,
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
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

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

        setMessage("Nutrition entry updated.");
      } else {
        await apiRequest("/api/nutrition", "POST", payload);

        setMessage("Food added to your private nutrition log.");
      }

      setShowForm(false);
      setEditingId(null);

      await loadRecords();
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
    const confirmed = window.confirm(
      `Delete "${record.foodName}" from your private nutrition log?`,
    );

    if (!confirmed) return;

    setLoading(true);
    setError("");
    setMessage("");

    try {
      await apiRequest(
        `/api/nutrition/${encodeURIComponent(record.id)}`,
        "DELETE",
      );

      setMessage("Nutrition entry deleted.");

      if (editingId === record.id) {
        setShowForm(false);
        setEditingId(null);
      }

      await loadRecords();
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

  const mealGroups = MEAL_TYPES.map((mealType) => ({
    mealType,
    records: records.filter((record) => record.mealType === mealType),
  })).filter((group) => group.records.length > 0);

  return (
    <main className="min-h-screen px-4 py-6 text-ink sm:px-8 sm:py-9">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <button
              onClick={() => router.push("/dashboard")}
              className="mb-3 text-sm text-ink-mute transition hover:text-periwinkle"
            >
              ← Back to dashboard
            </button>

            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-periwinkle">
              Fuel your progress
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Nutrition <span className="text-periwinkle">tracker.</span>
            </h1>

            <p className="mt-2 text-sm text-ink-soft">
              Your shared food diary, in one place.
            </p>
          </div>

          <button
            onClick={startNewEntry}
            className="rounded-2xl bg-butter px-5 py-3 text-sm font-bold text-butter-ink transition hover:bg-butter-hover"
          >
            + Add food
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

        <section className="mb-5 rounded-3xl border border-line card p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-ink-soft">Daily intake</p>
              <h2 className="mt-1 text-xl font-semibold">
                Your nutrition totals
              </h2>
            </div>

            <label className="text-sm text-ink-soft">
              Date
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
                className="ml-2 rounded-xl border border-line bg-field px-3 py-2 text-ink"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              {
                label: "Calories",
                value: formatNumber(totals.calories),
                unit: "kcal",
              },
              {
                label: "Protein",
                value: formatNumber(totals.protein),
                unit: "g",
              },
              {
                label: "Carbs",
                value: formatNumber(totals.carbs),
                unit: "g",
              },
              {
                label: "Fat",
                value: formatNumber(totals.fat),
                unit: "g",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-line bg-field p-4"
              >
                <p className="text-xs text-ink-mute">{stat.label}</p>
                <p className="mt-2 text-2xl font-bold tabular-nums">
                  {stat.value}
                  <span className="ml-1 text-xs font-medium text-ink-mute">
                    {stat.unit}
                  </span>
                </p>
              </div>
            ))}
          </div>
        </section>

        {showForm && (
          <section className="mb-5 rounded-3xl border border-periwinkle/25 card p-5 sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">
                {editingId ? "Edit food entry" : "Add food entry"}
              </h2>

              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
                className="text-sm text-ink-soft hover:text-ink"
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
                  Meal *
                  <select
                    value={form.mealType}
                    onChange={(event) =>
                      updateForm("mealType", event.target.value as MealType)
                    }
                    className={inputClass}
                  >
                    {MEAL_TYPES.map((meal) => (
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
                <p className="mb-3 text-sm font-medium text-ink-soft">
                  Nutrition values for this entry
                </p>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {(
                    [
                      ["calories", "Calories (kcal)", 10000],
                      ["protein", "Protein (g)", 1000],
                      ["carbs", "Carbs (g)", 1000],
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
                className="w-full rounded-2xl bg-butter px-5 py-3 font-bold text-butter-ink transition hover:bg-butter-hover disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {loading
                  ? "Saving..."
                  : editingId
                    ? "Save changes"
                    : "Add to food diary"}
              </button>
            </form>
          </section>
        )}

        <section className="rounded-3xl border border-line card p-5 sm:p-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold">Food diary</h2>
            <p className="mt-1 text-sm text-ink-mute">
              Only you can see your nutrition entries.
            </p>
          </div>

          {loadingRecords ? (
            <div className="py-12 text-center text-sm text-ink-mute">
              Loading your food diary...
            </div>
          ) : records.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line px-5 py-12 text-center">
              <div className="text-3xl">🥗</div>
              <h3 className="mt-3 font-semibold">No meals logged yet</h3>
              <p className="mt-2 text-sm text-ink-mute">
                Add your first entry for this date. Your shared totals will
                update automatically.
              </p>

              <button
                onClick={startNewEntry}
                className="mt-5 rounded-2xl bg-butter px-4 py-2.5 text-sm font-bold text-butter-ink hover:bg-butter-hover"
              >
                Add your first food
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {mealGroups.map((group) => (
                <div key={group.mealType}>
                  <h3 className="mb-3 text-sm font-semibold text-periwinkle">
                    {group.mealType}
                  </h3>

                  <div className="space-y-3">
                    {group.records.map((record) => (
                      <article
                        key={record.id}
                        className="rounded-2xl border border-line bg-field p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <h4 className="break-words font-semibold">
                              {record.foodName}{record.aiEstimated && <span className="ml-2 rounded-md bg-warn/10 px-2 py-1 text-[11px] font-medium text-warn">AI estimate</span>}
                            </h4>

                            <p className="mt-1 text-xs text-ink-mute">
                              {record.servings} serving
                              {record.servings === 1 ? "" : "s"} · Logged by{" "}
                              {record.loggedByName}
                            </p>

                            {record.notes && (
                              <p className="mt-2 break-words text-sm text-ink-soft">
                                {record.notes}
                              </p>
                            )}
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={() => startEditing(record)}
                              disabled={loading}
                              className="rounded-xl border border-line px-3 py-2 text-xs text-ink-soft hover:border-periwinkle/50 hover:text-periwinkle disabled:opacity-50"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() => void deleteEntry(record)}
                              disabled={loading}
                              className="rounded-xl border border-danger/25 px-3 py-2 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {[
                            [
                              "Calories",
                              `${formatNumber(record.calories)} kcal`,
                            ],
                            [
                              "Protein",
                              `${formatNumber(record.protein)} g`,
                            ],
                            ["Carbs", `${formatNumber(record.carbs)} g`],
                            ["Fat", `${formatNumber(record.fat)} g`],
                          ].map(([label, value]) => (
                            <div
                              key={label}
                              className="rounded-xl bg-sunken px-3 py-2"
                            >
                              <p className="text-[11px] text-ink-mute">
                                {label}
                              </p>
                              <p className="mt-1 text-sm font-semibold">
                                {value}
                              </p>
                            </div>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {nextCursor && !loadingRecords && (
            <button
              type="button"
              onClick={() => void loadMoreRecords()}
              disabled={loadingMore}
              className="mt-6 w-full rounded-2xl border border-line px-4 py-3 text-sm font-medium text-ink-soft hover:border-periwinkle/50 hover:text-periwinkle disabled:opacity-50"
            >
              {loadingMore ? "Loading..." : "Load more entries"}
            </button>
          )}
        </section>

        <p className="mt-5 text-center text-xs leading-5 text-ink-mute">
          Nutrition values are estimates when entered from memory. Check food
          labels or a reliable nutrition source for more accurate tracking.
        </p>
      </div>
    </main>
  );
}


