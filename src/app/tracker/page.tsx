"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import NaturalLog from "@/app/components/natural-log";

type RecordItem = {
  id: string; date: string; foodName?: string; mealType?: string; servings?: number;
  calories?: number; protein?: number; carbs?: number; fat?: number; amountMl?: number;
  workoutType?: string; weightKg?: number; notes?: string; loggedBy?: string;
  exercises?: { name: string; sets: number; reps: number; weightKg: number }[];
};
type Goals = { calories: number | null; protein: number | null; carbs: number | null; fat: number | null; waterMl: number | null; weightKg: number | null };
type Summary = { userTotals: { calories: number; protein: number; carbs: number; fat: number; waterMl: number; workouts: number }; currentWeight: number | null; weightHistory: { id: string; date: string; weightKg: number }[]; goals: { waterMl?: number | null } | null };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const DEFAULT_GOALS: Goals = { calories: 2400, protein: 120, carbs: 300, fat: 70, waterMl: null, weightKg: null };
const field = "mt-1 w-full rounded-xl border border-line bg-field px-3 py-3 text-sm text-ink outline-none focus:border-periwinkle";
const button = "inline-flex items-center justify-center rounded-xl border border-line px-3 py-2 text-sm font-semibold text-ink-soft hover:border-periwinkle/50 disabled:opacity-50";
const primary = "inline-flex items-center justify-center rounded-xl bg-butter px-4 py-3 text-sm font-bold text-butter-ink disabled:opacity-50";
const pct = (value: number, target: number) => target > 0 ? Math.min(100, Math.max(0, value / target * 100)) : 0;

export default function TrackerPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [foods, setFoods] = useState<RecordItem[]>([]);
  const [water, setWater] = useState<RecordItem[]>([]);
  const [workouts, setWorkouts] = useState<RecordItem[]>([]);
  const [selectedDate, setSelectedDate] = useState(today());
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [goals, setGoals] = useState<Goals>(DEFAULT_GOALS);
  const [savedGoals, setSavedGoals] = useState<Goals>(DEFAULT_GOALS);
  const [goalDrafts, setGoalDrafts] = useState({ calories: "2400", protein: "120", carbs: "300", fat: "70", waterMl: "2000" });
  const [goalsLoaded, setGoalsLoaded] = useState(false);
  const [showGoalSettings, setShowGoalSettings] = useState(false);
  const [savingGoals, setSavingGoals] = useState(false);
  
  const [savingWater, setSavingWater] = useState(false);
  const [editing, setEditing] = useState<RecordItem | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => onAuthStateChanged(auth, current => { setUser(current); if (!current) router.replace("/login"); }), [router]);

  const api = useCallback(async (path: string, method = "GET", body?: unknown) => {
    if (!user) throw new Error("Please sign in again.");
    const token = await user.getIdToken();
    const response = await fetch(path, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }, [user]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const date = encodeURIComponent(selectedDate);
      const [progress, nutrition, waterLog, workoutLog, goalResult] = await Promise.all([
        api(`/api/progress?date=${date}`), api(`/api/nutrition?date=${date}`),
        api(`/api/fitness/water?date=${date}`), api(`/api/fitness/workouts?date=${date}`), api("/api/goals")
      ]);
      setSummary(progress); setFoods(nutrition.records || []); setWater(waterLog.records || []); setWorkouts(workoutLog.records || []);
      const stored = goalResult.goals;
      const loaded: Goals = stored ? {
        calories: stored.calories ?? DEFAULT_GOALS.calories, protein: stored.protein ?? DEFAULT_GOALS.protein,
        carbs: stored.carbs ?? DEFAULT_GOALS.carbs, fat: stored.fat ?? DEFAULT_GOALS.fat,
        waterMl: stored.waterMl ?? null, weightKg: stored.weightKg ?? null
      } : { ...DEFAULT_GOALS, waterMl: progress.goals?.waterMl ?? null };
      setGoals(loaded); setSavedGoals(loaded);
      setGoalDrafts({
        calories: String(loaded.calories ?? ""), protein: String(loaded.protein ?? ""),
        carbs: String(loaded.carbs ?? ""), fat: String(loaded.fat ?? ""),
        waterMl: String(loaded.waterMl ?? progress.goals?.waterMl ?? 2000),
      });
      setGoalsLoaded(true); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load your tracker."); }
    finally { setLoading(false); }
  }, [api, selectedDate, user]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => { const refresh = () => void load(); window.addEventListener("fitness-record-saved", refresh); return () => window.removeEventListener("fitness-record-saved", refresh); }, [load]);

  const totals = summary?.userTotals;
  const calorieTarget = goals.calories ?? 2400;
  const calorieConsumed = totals?.calories ?? 0;
  const calorieRemaining = calorieTarget - calorieConsumed;
  const waterTotal = useMemo(() => water.reduce((sum, item) => sum + (item.amountMl ?? 0), 0), [water]);
  const waterGoal = goals.waterMl ?? summary?.goals?.waterMl ?? 2000;

  function updateGoal(key: "calories" | "protein" | "carbs" | "fat" | "waterMl", value: string) {
    setGoalDrafts(current => ({ ...current, [key]: value }));
  }
  async function saveGoals(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSavingGoals(true); setError(""); setMessage("");
    try {
      const payload = {
        calories: goalDrafts.calories === "" ? null : Number(goalDrafts.calories),
        protein: goalDrafts.protein === "" ? null : Number(goalDrafts.protein),
        carbs: goalDrafts.carbs === "" ? null : Number(goalDrafts.carbs),
        fat: goalDrafts.fat === "" ? null : Number(goalDrafts.fat),
        waterMl: goalDrafts.waterMl === "" ? null : Number(goalDrafts.waterMl),
        weightKg: goals.weightKg,
      };
      const result = await api("/api/goals", "PUT", payload);
      const stored = result.goals ?? payload;
      const updated: Goals = { calories: stored.calories ?? null, protein: stored.protein ?? null, carbs: stored.carbs ?? null, fat: stored.fat ?? null, waterMl: stored.waterMl ?? null, weightKg: stored.weightKg ?? null };
      setGoals(updated); setSavedGoals(updated);
      setGoalDrafts({ calories: String(updated.calories ?? ""), protein: String(updated.protein ?? ""), carbs: String(updated.carbs ?? ""), fat: String(updated.fat ?? ""), waterMl: String(updated.waterMl ?? 2000) });
      setShowGoalSettings(false); setMessage("Your daily targets are saved.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save targets."); }
    finally { setSavingGoals(false); }
  }
  async function logWater(amount: number) {
    setSavingWater(true); setError(""); setMessage("");
    try { await api("/api/fitness/water", "POST", { date: selectedDate, amountMl: amount }); await load(); setMessage(`${amount} ml of water logged.`); window.dispatchEvent(new CustomEvent("fitness-record-saved")); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not log water."); }
    finally { setSavingWater(false); }
  }
  if (!user) return <main className="min-h-screen" />;

  return <main className="min-h-screen text-ink"><header className="px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8"><p className="text-xs text-ink-mute">KAIRO · YOUR MOMENT . YOUR MOMENTUM</p></header>
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:space-y-8 sm:px-8 sm:py-8">
      <section className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-periwinkle">Your daily dashboard</p><h1 className="mt-2 text-3xl font-bold sm:text-4xl">Tracker<span className="text-periwinkle">.</span></h1><p className="mt-2 text-sm text-ink-soft">Food, calories, hydration, training and progress in one place.</p></div><label className="block text-sm text-ink-soft">Log date<input type="date" value={selectedDate} max={today()} onChange={e => setSelectedDate(e.target.value)} className={`${field} min-w-44`}/></label></section>
      {error && <p role="alert" className="rounded-2xl border border-danger/25 bg-danger/10 p-3 text-sm text-danger">{error}</p>}{message && <p role="status" className="rounded-2xl border border-periwinkle/25 bg-periwinkle/10 p-3 text-sm text-periwinkle">{message}</p>}
      <section className="overflow-hidden rounded-3xl border border-line card"><div className="grid gap-6 p-5 sm:p-7 md:grid-cols-[1fr_0.8fr] md:items-center"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-periwinkle/25 bg-periwinkle/10 px-3 py-1 text-xs font-semibold text-periwinkle">DAILY CALORIE BALANCE</span><span className="text-xs text-ink-mute">{selectedDate === today() ? "Today" : selectedDate}</span></div><h2 className="mt-4 text-2xl font-bold sm:text-3xl">{calorieRemaining >= 0 ? "Keep building your day." : "You've passed your target."}</h2><p className="mt-2 text-sm leading-6 text-ink-soft">Your target is personal. Log food naturally and your daily balance updates automatically.</p><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl border border-line bg-field p-4"><p className="text-xs text-ink-mute">Consumed</p><p className="mt-1 text-2xl font-bold">{Math.round(calorieConsumed).toLocaleString()}</p><p className="text-xs text-ink-mute">kcal</p></div><div className="rounded-2xl border border-line bg-field p-4"><p className="text-xs text-ink-mute">{calorieRemaining >= 0 ? "Remaining" : "Over target"}</p><p className="mt-1 text-2xl font-bold">{Math.abs(Math.round(calorieRemaining)).toLocaleString()}</p><p className="text-xs text-ink-mute">kcal</p></div></div><button className={`${button} mt-4`} onClick={() => setShowGoalSettings(v => !v)}>{showGoalSettings ? "Close target settings" : "⚙ Set calorie & water targets"}</button></div><div className="flex flex-col items-center justify-center rounded-3xl border border-line bg-field p-6"><div className="relative flex h-48 w-48 items-center justify-center rounded-full" style={{ background: `conic-gradient(var(--color-periwinkle, #9185df) ${pct(calorieConsumed, calorieTarget) * 3.6}deg, rgba(145,133,223,0.13) 0deg)` }}><div className="flex h-40 w-40 flex-col items-center justify-center rounded-full border border-line bg-surface text-center"><span className="text-3xl font-bold">{Math.round(pct(calorieConsumed, calorieTarget))}%</span><span className="mt-1 text-xs text-ink-mute">of daily target</span></div></div><p className="mt-4 text-sm font-semibold">Target: {calorieTarget.toLocaleString()} kcal</p>{!goalsLoaded && <p className="mt-1 text-xs text-ink-mute">Loading saved target…</p>}</div></div></section>
      {showGoalSettings && <section className="rounded-3xl border border-periwinkle/25 card p-5 sm:p-6"><h2 className="text-xl font-bold">Your daily targets</h2><p className="mt-1 text-sm text-ink-mute">Choose your calorie and water goals. Macro targets are optional supporting stats.</p><form onSubmit={saveGoals} className="mt-4"><div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><label className="text-sm text-ink-soft">Calories (kcal)<input required type="number" min="500" max="10000" step="1" value={goalDrafts.calories} onChange={e => updateGoal("calories", e.target.value)} className={field}/></label><label className="text-sm text-ink-soft">Water (ml)<input required type="number" min="250" max="10000" step="250" value={goalDrafts.waterMl} onChange={e => updateGoal("waterMl", e.target.value)} className={field}/></label><label className="text-sm text-ink-soft">Protein (g)<input required type="number" min="0" max="1000" value={goalDrafts.protein} onChange={e => updateGoal("protein", e.target.value)} className={field}/></label><label className="text-sm text-ink-soft">Carbs (g)<input required type="number" min="0" max="1500" value={goalDrafts.carbs} onChange={e => updateGoal("carbs", e.target.value)} className={field}/></label><label className="text-sm text-ink-soft">Fat (g)<input required type="number" min="0" max="1000" value={goalDrafts.fat} onChange={e => updateGoal("fat", e.target.value)} className={field}/></label></div><div className="mt-4 flex gap-2"><button className={primary} disabled={savingGoals || !goalsLoaded}>{savingGoals ? "Saving…" : "Save targets"}</button><button type="button" className={button} onClick={() => { setGoals(savedGoals); setGoalDrafts({ calories: String(savedGoals.calories ?? ""), protein: String(savedGoals.protein ?? ""), carbs: String(savedGoals.carbs ?? ""), fat: String(savedGoals.fat ?? ""), waterMl: String(savedGoals.waterMl ?? 2000) }); setShowGoalSettings(false); }}>Cancel</button></div></form></section>}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><article className="rounded-3xl border border-line card p-4"><p className="text-xs text-ink-mute">Protein · secondary</p><p className="mt-2 text-2xl font-semibold">{Math.round(totals?.protein ?? 0)} <span className="text-xs font-normal text-ink-mute">/ {goals.protein ?? "—"} g</span></p></article><article className="rounded-3xl border border-line card p-4"><p className="text-xs text-ink-mute">Carbohydrates</p><p className="mt-2 text-2xl font-semibold">{Math.round(totals?.carbs ?? 0)} <span className="text-xs font-normal text-ink-mute">g</span></p></article><article className="rounded-3xl border border-line card p-4"><p className="text-xs text-ink-mute">Fat</p><p className="mt-2 text-2xl font-semibold">{Math.round(totals?.fat ?? 0)} <span className="text-xs font-normal text-ink-mute">g</span></p></article><article className="rounded-3xl border border-line card p-4"><p className="text-xs text-ink-mute">Latest weight</p><p className="mt-2 text-2xl font-semibold">{summary?.currentWeight ?? "—"} <span className="text-xs font-normal text-ink-mute">kg</span></p></article></section>
      <section className="rounded-3xl border border-line card p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-periwinkle">Hydration</p><h2 className="mt-1 text-xl font-bold">Water balance</h2><p className="mt-1 text-sm text-ink-mute">{waterTotal.toLocaleString()} ml of {waterGoal.toLocaleString()} ml</p></div><button className={button} onClick={() => router.push("/trackers?kind=water")}>Open water log ↗</button></div><div className="mt-4 h-3 overflow-hidden rounded-full bg-lavender/55"><div className="h-full rounded-full bg-periwinkle transition-all" style={{ width: `${pct(waterTotal, waterGoal)}%` }}/></div><div className="mt-4 flex flex-wrap gap-2"><button disabled={savingWater} onClick={() => void logWater(250)} className={button}>+250 ml</button><button disabled={savingWater} onClick={() => void logWater(500)} className={button}>+500 ml</button><button disabled={savingWater} onClick={() => router.push("/trackers?kind=water")} className={primary}>Log custom amount</button></div></section>
      <section className="rounded-3xl border border-line card p-4 sm:p-6"><p className="text-xs font-semibold uppercase tracking-wider text-periwinkle">AI nutrition buddy</p><h2 className="mt-1 text-xl font-bold">What did you eat?</h2><p className="mt-1 mb-4 text-sm text-ink-mute">Describe food naturally. No need to choose a meal category first.</p><div className="rounded-2xl border border-line bg-field p-3 sm:p-4"><NaturalLog inline initialOpen /></div></section>
      <section className="grid gap-4 lg:grid-cols-2"><article className="rounded-3xl border border-line card p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">Food history</h2><span className="text-xs text-ink-mute">{foods.length} entries</span></div>{foods.length === 0 ? <p className="mt-4 text-sm text-ink-mute">No meals logged for this date.</p> : <div className="mt-3 space-y-2">{foods.map(item => <div key={item.id} className="rounded-2xl bg-field p-3"><p className="font-medium">{item.foodName}</p><p className="mt-1 text-xs text-ink-mute">{item.mealType || "Food"} · {Math.round(item.calories ?? 0)} kcal · P {Math.round(item.protein ?? 0)} g</p></div>)}</div>}<button className={`${button} mt-4`} onClick={() => router.push("/nutrition")}>Manage food history ↗</button></article><article className="rounded-3xl border border-line card p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">Water log</h2><span className="text-xs text-ink-mute">{water.length} entries</span></div>{water.length === 0 ? <p className="mt-4 text-sm text-ink-mute">No water logged for this date.</p> : <div className="mt-3 space-y-2">{water.map(item => <div key={item.id} className="rounded-2xl bg-field p-3 text-sm">{item.amountMl} ml water</div>)}</div>}<button className={`${button} mt-4`} onClick={() => router.push("/trackers?kind=water")}>Manage water log ↗</button></article><article className="rounded-3xl border border-line card p-5 lg:col-span-2"><div className="flex items-center justify-between"><h2 className="font-semibold">Workouts</h2><span className="text-xs text-ink-mute">{workouts.length} entries</span></div>{workouts.length === 0 ? <p className="mt-4 text-sm text-ink-mute">No workout recorded for this date.</p> : <div className="mt-3 grid gap-2 sm:grid-cols-2">{workouts.map(item => <div key={item.id} className="rounded-2xl bg-field p-3"><p className="font-medium">{item.workoutType || "Workout"}</p>{item.exercises?.map((ex,i) => <p key={i} className="mt-1 text-xs text-ink-soft">{ex.name}: {ex.sets} × {ex.reps}{ex.weightKg ? ` · ${ex.weightKg} kg` : ""}</p>)}</div>)}</div>}<button className={`${button} mt-4`} onClick={() => router.push("/trackers?kind=workouts")}>Manage workouts ↗</button></article><article className="rounded-3xl border border-line card p-5 lg:col-span-2"><div className="flex items-center justify-between"><h2 className="font-semibold">Recent weigh-ins</h2><button className={button} onClick={() => router.push("/trackers?kind=weight")}>Manage weight ↗</button></div>{summary?.weightHistory?.filter(item => item.date === selectedDate).length ? <div className="mt-3 space-y-2">{summary.weightHistory.filter(item => item.date === selectedDate).map(item => <div key={item.id} className="flex justify-between rounded-2xl bg-field px-3 py-3 text-sm"><span className="text-ink-mute">{item.date}</span><span className="font-semibold">{item.weightKg} kg</span></div>)}</div> : <p className="mt-3 text-sm text-ink-mute">No weight entries for this date.</p>}</article></section>
      {loading && <p className="text-center text-xs text-ink-mute">Refreshing your daily data…</p>}
      <p className="pb-4 text-center text-xs text-ink-mute">Nutrition estimates are approximate. Your detailed water, weight, and workout logs remain available in the Tracker tools.</p>
    </div>
    {editing && <EditEntry item={editing} user={user} saving={savingEdit} onClose={() => setEditing(null)} onSaving={setSavingEdit} onSaved={() => { setEditing(null); void load(); }} onError={setError}/>}
  </main>;
}

function EditEntry({ item, user, saving, onClose, onSaving, onSaved, onError }: { item: RecordItem; user: User; saving: boolean; onClose: () => void; onSaving: (v: boolean) => void; onSaved: () => void; onError: (v: string) => void }) {
  const [draft, setDraft] = useState({ date: item.date, name: item.foodName || "", mealType: item.mealType || "Snack", servings: String(item.servings ?? 1), calories: String(item.calories ?? 0), protein: String(item.protein ?? 0), carbs: String(item.carbs ?? 0), fat: String(item.fat ?? 0), amountMl: String(item.amountMl ?? 0), weightKg: String(item.weightKg ?? 0), workoutType: item.workoutType || "Custom", notes: item.notes || "" });
  const kind = item.foodName ? "nutrition" : item.amountMl ? "water" : item.weightKg ? "weight" : "workouts";
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); onSaving(true); onError("");
    try {
      const token = await user.getIdToken();
      const body = kind === "nutrition" ? { foodName: draft.name, mealType: draft.mealType, servings: Number(draft.servings), calories: Number(draft.calories), protein: Number(draft.protein), carbs: Number(draft.carbs), fat: Number(draft.fat), date: draft.date, notes: draft.notes } : kind === "water" ? { date: draft.date, amountMl: Number(draft.amountMl), notes: draft.notes } : kind === "weight" ? { date: draft.date, weightKg: Number(draft.weightKg), notes: draft.notes } : { date: draft.date, workoutType: draft.workoutType, notes: draft.notes, exercises: item.exercises || [] };
      const path = kind === "nutrition" ? `/api/nutrition/${encodeURIComponent(item.id)}` : `/api/fitness/${kind}/${encodeURIComponent(item.id)}`;
      const response = await fetch(path, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not update this entry."); onSaved();
    } catch (reason) { onError(reason instanceof Error ? reason.message : "Could not update this entry."); }
    finally { onSaving(false); }
  }
  const input = (key: keyof typeof draft, label: string, type = "text") => <label className="block text-sm text-ink-soft">{label}<input required type={type} value={draft[key]} onChange={e => setDraft(current => ({ ...current, [key]: e.target.value }))} className={field}/></label>;
  return <div className="fixed inset-0 z-[70] flex items-end justify-center bg-scrim backdrop-blur-sm sm:items-center sm:p-4"><form onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="edit-entry-title" className="card max-h-[90dvh] w-full max-w-xl space-y-4 overflow-y-auto rounded-t-[2rem] p-5 sm:rounded-[2rem] sm:p-6" style={{ backgroundColor: "var(--c-surface-solid)" }}><div className="flex items-center justify-between"><h2 id="edit-entry-title" className="text-xl font-bold">Edit {kind} entry</h2><button type="button" onClick={onClose} className={button}>Close</button></div><div className="grid gap-3 sm:grid-cols-2">{input("date", "Log date", "date")}{kind === "nutrition" && <>{input("name", "Food or drink")}{input("mealType", "Meal type")}{input("servings", "Servings", "number")}{input("calories", "Calories · kcal", "number")}{input("protein", "Protein · g", "number")}{input("carbs", "Carbs · g", "number")}{input("fat", "Fat · g", "number")}</>}{kind === "water" && input("amountMl", "Water · ml", "number")}{kind === "weight" && input("weightKg", "Weight · kg", "number")}{kind === "workouts" && input("workoutType", "Workout type")}</div><label className="block text-sm text-ink-soft">Notes<textarea rows={3} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} className={field}/></label><div className="flex justify-end gap-2"><button type="button" onClick={onClose} className={button}>Cancel</button><button disabled={saving} className={primary}>{saving ? "Saving…" : "Save changes"}</button></div></form></div>;
}
