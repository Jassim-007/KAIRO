"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";

type Kind = "water" | "weight" | "workouts";
type Member = { uid: string; displayName: string; email: string | null };
type ExerciseDraft = { name: string; sets: string; reps: string; weightKg: string };
type Entry = { id: string; date: string; amountMl?: number; weightKg?: number; workoutType?: string; exercises?: { name: string; sets: number; reps: number; weightKg: number }[]; notes?: string; subjectUid?: string; subjectName?: string; loggedBy?: string };
const kinds: { key: Kind; label: string }[] = [{ key: "water", label: "Water" }, { key: "weight", label: "Weight" }, { key: "workouts", label: "Workouts" }];
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const field = "mt-1 w-full rounded-xl border border-white/10 bg-[#10110f] px-3 py-3 text-sm text-white outline-none focus:border-lime-300";

export default function TrackersPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [kind, setKind] = useState<Kind>("water");
  const [date, setDate] = useState(today());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [goalMl, setGoalMl] = useState(2000);
  const [goalDraft, setGoalDraft] = useState("2000");
  const [form, setForm] = useState({ amountMl: "500", weightKg: "", workoutType: "Push", subjectUid: "", notes: "" });
  const [exerciseRows, setExerciseRows] = useState<ExerciseDraft[]>([{ name: "Bench press", sets: "3", reps: "10", weightKg: "0" }]);

  useEffect(() => onAuthStateChanged(auth, (current) => { setUser(current); setAuthLoading(false); if (!current) router.replace("/login"); }), [router]);

  const api = useCallback(async (url: string, method = "GET", body?: unknown) => {
    if (!user) throw new Error("Please sign in again.");
    const token = await user.getIdToken();
    const response = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }, [user]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError("");
    try {
      const [list, workspace] = await Promise.all([
        api(`/api/fitness/${kind}?date=${encodeURIComponent(date)}`),
        kind === "workouts" ? api("/api/workspace/members") : Promise.resolve(null),
      ]);
      setEntries(list.records ?? []);
      if (workspace) setMembers(workspace.members ?? []);
      if (kind === "water") {
        const goal = await api("/api/fitness/water-goal"); setGoalMl(goal.goalMl); setGoalDraft(String(goal.goalMl));
      }
    } catch (e) { setEntries([]); setError(e instanceof Error ? e.message : "Could not load records."); }
    finally { setLoading(false); }
  }, [api, date, kind, user]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => { const requested = new URLSearchParams(window.location.search).get("kind"); if (requested !== "water" && requested !== "weight" && requested !== "workouts") return; const timer = window.setTimeout(() => setKind(requested), 0); return () => window.clearTimeout(timer); }, []);

  const waterTotal = useMemo(() => entries.reduce((sum, item) => sum + (item.amountMl ?? 0), 0), [entries]);
  function clearForm() { setEditing(null); setForm({ amountMl: "500", weightKg: "", workoutType: "Push", subjectUid: user?.uid ?? "", notes: "" }); setExerciseRows([{ name: "Bench press", sets: "3", reps: "10", weightKg: "0" }]); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      let body: Record<string, unknown>;
      if (kind === "water") body = { date, amountMl: Number(form.amountMl), notes: form.notes };
      else if (kind === "weight") body = { date, weightKg: Number(form.weightKg), notes: form.notes, subjectUid: user?.uid };
      else body = { date, workoutType: form.workoutType, subjectUid: form.subjectUid || user?.uid, notes: form.notes, exercises: exerciseRows.map((exercise) => ({ name: exercise.name.trim(), sets: Number(exercise.sets), reps: Number(exercise.reps), weightKg: Number(exercise.weightKg) })) };
      await api(editing ? `/api/fitness/${kind}/${encodeURIComponent(editing)}` : `/api/fitness/${kind}`, editing ? "PATCH" : "POST", body);
      setMessage(editing ? "Entry updated." : "Entry saved."); clearForm(); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save this entry."); }
    finally { setSaving(false); }
  }
  function editEntry(entry: Entry) {
    setEditing(entry.id);
    setExerciseRows((entry.exercises ?? []).map((exercise) => ({ name: exercise.name, sets: String(exercise.sets), reps: String(exercise.reps), weightKg: String(exercise.weightKg) })));
    setForm((old) => ({ ...old, amountMl: String(entry.amountMl ?? 500), weightKg: String(entry.weightKg ?? ""), workoutType: entry.workoutType ?? "Push", subjectUid: entry.subjectUid ?? user?.uid ?? "", notes: entry.notes ?? "" }));
  }
  async function remove(entry: Entry) {
    if (!window.confirm(`Delete this ${kind === "workouts" ? "shared workout" : "entry"}?`)) return;
    try { await api(`/api/fitness/${kind}/${encodeURIComponent(entry.id)}`, "DELETE"); setMessage("Entry deleted."); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not delete this entry."); }
  }
  async function saveGoal() {
    try { const result = await api("/api/fitness/water-goal", "PUT", { goalMl: Number(goalDraft) }); setGoalMl(result.goalMl); setMessage("Daily water goal saved."); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save water goal."); }
  }

  if (authLoading || !user) return <main className="flex min-h-screen items-center justify-center bg-[#10110f] text-zinc-400">Checking your account...</main>;
  return <main className="min-h-screen bg-[#10110f] px-4 py-6 text-white sm:px-8 sm:py-9"><div className="mx-auto max-w-5xl">
    <button onClick={() => router.push("/dashboard")} className="mb-5 text-sm text-zinc-500 hover:text-lime-300">← Back to dashboard</button>
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-lime-300">Fitness tracker</p><h1 className="mt-2 text-3xl font-bold sm:text-4xl">Track your <span className="text-lime-300">progress.</span></h1><p className="mt-2 text-sm text-zinc-400">Meals, water, and weight are private to you. Workouts are shared with your partner.</p></div><label className="text-sm text-zinc-400">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="ml-2 rounded-lg border border-white/10 bg-[#171915] px-3 py-2 text-white" /></label></header>
    <div className="mb-6 grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-[#171915] p-2">{kinds.map((item) => <button key={item.key} onClick={() => { setKind(item.key); clearForm(); setError(""); setMessage(""); }} className={`rounded-xl px-3 py-3 text-sm font-semibold ${kind === item.key ? "bg-lime-300 text-black" : "text-zinc-400 hover:text-white"}`}>{item.label}</button>)}</div>
    {error && <p role="alert" className="mb-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-300">{error}</p>}{message && <p role="status" className="mb-4 rounded-xl border border-lime-300/20 bg-lime-300/10 p-3 text-sm text-lime-200">{message}</p>}
    {kind === "water" && <section className="mb-5 rounded-2xl border border-white/10 bg-[#171915] p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm text-zinc-400">Today’s personal water</p><p className="mt-1 text-2xl font-bold">{waterTotal.toLocaleString()} <span className="text-sm text-zinc-500">/ {goalMl.toLocaleString()} ml</span></p></div><div className="flex items-center gap-2"><input aria-label="Daily water goal in millilitres" type="number" min="250" max="10000" value={goalDraft} onChange={(e) => setGoalDraft(e.target.value)} className="w-28 rounded-lg border border-white/10 bg-[#10110f] px-3 py-2 text-sm"/><button onClick={() => void saveGoal()} className="rounded-lg bg-lime-300 px-3 py-2 text-xs font-bold text-black">Save goal</button></div></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-lime-300" style={{ width: `${Math.min(100, goalMl ? waterTotal / goalMl * 100 : 0)}%` }}/></div></section>}
    <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
      <section className="rounded-2xl border border-lime-300/20 bg-[#171915] p-5"><h2 className="mb-4 text-lg font-semibold">{editing ? "Edit entry" : `Log ${kind === "water" ? "water" : kind === "weight" ? "weight" : "workout"}`}</h2><form onSubmit={submit} className="space-y-4">
        {kind === "water" && <label className="block text-sm text-zinc-400">Water (ml)<input required type="number" min="1" max="5000" value={form.amountMl} onChange={(e) => setForm({ ...form, amountMl: e.target.value })} className={field}/></label>}
        {kind === "weight" && <><label className="block text-sm text-zinc-400">Weight (kg)<input required type="number" min="1" max="500" step="0.1" value={form.weightKg} onChange={(e) => setForm({ ...form, weightKg: e.target.value })} className={field}/></label></>}
        {kind === "workouts" && <><label className="block text-sm text-zinc-400">Workout type<select value={form.workoutType} onChange={(e) => setForm({ ...form, workoutType: e.target.value })} className={field}>{["Push","Pull","Legs","Custom"].map((x) => <option key={x}>{x}</option>)}</select></label><label className="block text-sm text-zinc-400">Workout for<select value={form.subjectUid || user.uid} onChange={(e) => setForm({ ...form, subjectUid: e.target.value })} className={field}>{members.map((m) => <option key={m.uid} value={m.uid}>{m.displayName || m.email || "Member"}{m.uid === user.uid ? " (you)" : ""}</option>)}</select></label><div className="space-y-3"><div className="flex items-center justify-between"><p className="text-sm text-zinc-400">Exercises</p><button type="button" onClick={() => setExerciseRows((rows) => [...rows, { name: "", sets: "3", reps: "10", weightKg: "0" }])} className="rounded-lg border border-lime-300/20 px-3 py-2 text-xs text-lime-200">Add exercise</button></div>{exerciseRows.map((exercise, index) => <div key={index} className="rounded-xl border border-white/10 p-3"><label className="block text-xs text-zinc-500">Exercise<input required maxLength={80} value={exercise.name} onChange={(event) => setExerciseRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row))} placeholder="e.g. Bench press" className={field}/></label><div className="mt-2 grid grid-cols-3 gap-2">{([["Sets", "sets"], ["Reps", "reps"], ["Load kg", "weightKg"]] as const).map(([label, key]) => <label key={key} className="text-xs text-zinc-500">{label}<input required type="number" min={key === "weightKg" ? "0" : "1"} max="1000" step={key === "weightKg" ? "0.5" : "1"} value={exercise[key]} onChange={(event) => setExerciseRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: event.target.value } : row))} className={field}/></label>)}</div>{exerciseRows.length > 1 && <button type="button" onClick={() => setExerciseRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))} className="mt-2 text-xs text-zinc-500 underline">Remove exercise</button>}</div>)}</div></>}
        <label className="block text-sm text-zinc-400">Notes (optional)<textarea maxLength={500} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={field}/></label><div className="flex gap-2"><button disabled={saving} className="rounded-xl bg-lime-300 px-5 py-3 text-sm font-bold text-black disabled:opacity-50">{saving ? "Saving..." : editing ? "Save changes" : "Save entry"}</button>{editing && <button type="button" onClick={clearForm} className="rounded-xl border border-white/10 px-4 text-sm text-zinc-300">Cancel</button>}</div>
      </form></section>
      <section className="rounded-2xl border border-white/10 bg-[#171915] p-5"><h2 className="mb-4 text-lg font-semibold">{kind === "water" ? "Water log" : kind === "weight" ? "Weight history" : "Workout history"}</h2>{loading ? <p className="py-8 text-center text-sm text-zinc-500">Loading entries...</p> : entries.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">No entries for this date yet.</div> : <div className="space-y-3">{entries.map((entry) => <article key={entry.id} className="rounded-xl border border-white/5 bg-[#10110f] p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{kind === "water" ? `${entry.amountMl} ml` : kind === "weight" ? `${entry.weightKg} kg` : `${entry.workoutType} workout`}</p><p className="mt-1 text-xs text-zinc-500">{entry.date}{entry.subjectName ? ` · ${entry.subjectName}` : ""}</p>{entry.exercises?.map((x,i) => <p key={i} className="mt-2 text-sm text-zinc-400">{x.name}: {x.sets} × {x.reps}{x.weightKg ? ` · ${x.weightKg} kg` : ""}</p>)}{entry.notes && <p className="mt-2 text-sm text-zinc-400">{entry.notes}</p>}</div>{(kind !== "workouts" || entry.loggedBy === user?.uid) && <div className="flex gap-2"><button onClick={() => editEntry(entry)} className="rounded-lg border border-white/10 px-3 py-2 text-xs">Edit</button><button onClick={() => void remove(entry)} className="rounded-lg border border-red-400/20 px-3 py-2 text-xs text-red-300">Delete</button></div>}</div></article>)}</div>}</section>
    </div>
    <p className="mt-6 text-center text-xs text-zinc-600">Nutrition, water, and weight entries are private to each account. Workouts are visible to both couple-workspace members.</p>
  </div></main>;
}





