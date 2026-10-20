"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";

type Draft = {
  kind: "nutrition" | "water" | "weight" | "workouts";
  date: string;
  name: string;
  mealType: string;
  servings: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  amountMl: number;
  weightKg: number;
  workoutType: string;
  exercises: { name: string; sets: number; reps: number; weightKg: number }[];
  notes: string;
  estimatedNutrition: boolean;
  confidence: number;
};
type WorkoutHistory = { date: string; workoutType: string; exercises: { name: string; sets: number; reps: number; weightKg: number }[] };
type WorkoutPlan = { focus: string; warmup: string; exercises: { name: string; sets: number; reps: string; weightKg: number | null; restSeconds: number; why: string }[]; coachTip: string };
type ChatMessage = { role: "user" | "assistant"; content: string; workoutPlan?: WorkoutPlan };

const field = "mt-1 w-full rounded-lg border border-white/10 bg-[#10110f] px-3 py-2 text-sm text-white";
function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function NaturalLog({ inline = false, initialOpen = false, workoutCoach = false, workoutHistory = [] }: { inline?: boolean; initialOpen?: boolean; workoutCoach?: boolean; workoutHistory?: WorkoutHistory[] }) {
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(initialOpen);
  const [text, setText] = useState("");
  const [chat, setChat] = useState<ChatMessage[]>([{ role: "assistant", content: workoutCoach ? "Hey! Ask me what to train today or tell me what you want to work on. I’ll help shape it into a clear plan." : "Hey! Tell me about your workout, food, goals, or anything fitness-related. If you tell me what you actually did, I’ll log it too." }]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [memoryReady, setMemoryReady] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const request = useCallback(async function request<T>(url: string, method = "GET", body?: unknown): Promise<T> {
    const token = await user!.getIdToken();
    const response = await fetch(url, { method, headers: { Authorization: "Bearer " + token, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Something went wrong.");
    return result as T;
  }, [user]);
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => setUser(currentUser));
    return () => unsubscribe();
  }, []);
  useEffect(() => {
    if (!user) return;
    let active = true;
    void request<{ messages?: ChatMessage[] }>("/api/ai/memory").then((data) => {
      if (active && data.messages?.length) setChat(data.messages.slice(-80));
    }).catch(() => {
      if (active) setMessage("Chat history is temporarily unavailable; this session will still work.");
    }).finally(() => { if (active) setMemoryReady(true); });
    return () => { active = false; };
  }, [user, request]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat, busy]);
  if (!user) return null;

  async function parse() {
    const userText = text.trim();
    const history = chat.slice(-12).filter((entry) => !entry.content.startsWith("On ") && !entry.content.includes("saved food, water, weight, or workout entries for")).slice(-8);
    setBusy(true); setMessage("");
    setChat((messages) => [...messages, { role: "user", content: userText }]);
    setText("");
    try {
      let result: { items: Draft[]; reply: string; workoutPlan?: WorkoutPlan | null };
      const asksForPlan = /\b(what should i (do|train)|what can i do|what to train|plan (me )?(a )?workout|suggest (a )?workout|give me (a )?(workout|routine)|workout for today|train today)\b/i.test(userText);
      if (workoutCoach && asksForPlan) {
        const generated = await request<{ reply: string; plan: WorkoutPlan }>("/api/ai/workout-plan", "POST", { text: userText, date: today() });
        const localLoads = workoutHistory.flatMap((session) => session.exercises.map((exercise) => ({ ...exercise, date: session.date }))).filter((exercise) => exercise.weightKg > 0).sort((a, b) => b.date.localeCompare(a.date));
        const exercises = generated.plan.exercises.map((exercise) => {
          const key = exercise.name.toLowerCase().replace(/[^a-z0-9]/g, "");
          const previous = localLoads.find((item) => item.name.toLowerCase().replace(/[^a-z0-9]/g, "") === key);
          const suggested = previous ? Math.max(0, Math.round((previous.weightKg * 0.9) / 2.5) * 2.5) : null;
          return { ...exercise, weightKg: suggested ?? exercise.weightKg };
        });
        result = { items: [], reply: generated.reply, workoutPlan: { ...generated.plan, exercises } };
      } else {
        result = await request<{ items: Draft[]; reply: string }>("/api/ai/parse", "POST", { text: userText, date: today(), history });
      }
      setChat((messages) => [...messages, { role: "assistant", content: result.reply, ...(result.workoutPlan ? { workoutPlan: result.workoutPlan } : {}) }]);
      void request("/api/ai/memory", "POST", { messages: [{ role: "user", content: userText }, { role: "assistant", content: result.reply, ...(result.workoutPlan ? { workoutPlan: result.workoutPlan } : {}) }] }).catch(() => setMessage("Reply received, but chat history could not be saved."));
      let saved = 0;
      const failures: string[] = [];
      for (const draft of result.items) {
        try {
          await saveDraft(draft);
          saved += 1;
        } catch (reason) {
          failures.push(reason instanceof Error ? reason.message : "One entry could not be saved.");
        }
      }
      if (saved > 0) window.dispatchEvent(new CustomEvent("fitness-record-saved"));
      if (failures.length === 0) setMessage("");
      else {
        setMessage(`${saved} ${saved === 1 ? "entry" : "entries"} added; ${failures.length} ${failures.length === 1 ? "entry needs" : "entries need"} a retry.`);
        setChat((messages) => [...messages, { role: "assistant", content: `I got ${saved} saved, but ${failures.length} ${failures.length === 1 ? "entry didn't" : "entries didn't"} go through: ${failures[0]}` }]);
      }
    } catch (reason) {
      const reply = reason instanceof Error ? reason.message : "I couldn't reach my AI brain just now. Nothing was logged—try me again in a bit.";
      setChat((messages) => [...messages, { role: "assistant", content: reply }]);
      void request("/api/ai/memory", "POST", { messages: [{ role: "user", content: userText }, { role: "assistant", content: reply }] }).catch(() => undefined);
    }
    finally { setBusy(false); }
  }

  async function saveDraft(draft: Draft) {
    if (draft.kind === "nutrition") {
      await request("/api/nutrition", "POST", { foodName: draft.name, mealType: draft.mealType, servings: draft.servings, calories: draft.calories, protein: draft.protein, carbs: draft.carbs, fat: draft.fat, date: draft.date, notes: draft.notes, aiEstimated: draft.estimatedNutrition });
    } else if (draft.kind === "water") {
      await request("/api/fitness/water", "POST", { date: draft.date, amountMl: draft.amountMl, notes: draft.notes });
    } else if (draft.kind === "weight") {
      await request("/api/fitness/weight", "POST", { date: draft.date, weightKg: draft.weightKg, notes: draft.notes });
    } else {
      await request("/api/fitness/workouts", "POST", { date: draft.date, workoutType: draft.workoutType, notes: draft.notes, exercises: draft.exercises });
    }
  }

  const button = "rounded-lg bg-lime-300 px-3 py-2 text-xs font-bold text-black disabled:opacity-50";
  return <div className={inline ? "w-full" : "fixed bottom-4 right-4 z-50 w-[min(25rem,calc(100vw-2rem))] sm:bottom-6 sm:right-6"}>
    {!open ? <button onClick={() => setOpen(true)} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-lime-300/30 bg-[#171915] px-4 py-3 text-left shadow-2xl shadow-black/50"><span><span className="block text-xs font-semibold uppercase tracking-wider text-lime-300">FORM/AI chat</span><span className="mt-1 block text-sm text-white">Talk with your fitness buddy</span></span><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lime-300 text-xl font-bold text-black">+</span></button> : <section className={`${inline ? "rounded-2xl border border-lime-300/25 bg-[#171915] p-4 sm:p-5" : "max-h-[78vh] overflow-y-auto rounded-2xl border border-lime-300/25 bg-[#171915] p-4 shadow-2xl shadow-black/60"}`}>
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-lime-300">FORM/AI chat</p><h2 className="mt-1 font-semibold">Your fitness buddy</h2></div><button aria-label="Close chat" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-zinc-400 hover:bg-white/5">×</button></div>
      <p className="mt-2 text-xs leading-5 text-zinc-500">Just dump your notes how you have them—even a bunch of days at once, spelling and all. I’ll sort it out and add the entries to your log.</p>
      <div aria-live="polite" className="mt-4 max-h-[34rem] space-y-3 overflow-y-auto">{chat.slice(-10).map((entry, index) => <div key={`${index}-${entry.role}`} className={`rounded-xl px-3 py-3 text-sm leading-6 ${entry.role === "user" ? "ml-6 bg-lime-300/10 text-zinc-200" : "mr-6 bg-white/5 text-zinc-300"}`}><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-lime-300">{entry.role === "user" ? "You" : "Your buddy"}</span><p className="whitespace-pre-wrap">{entry.content}</p>{entry.workoutPlan && <div className="mt-4 space-y-3"><div className="rounded-lg border border-lime-300/15 bg-black/15 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-lime-300">Today’s focus</p><p className="mt-1 font-semibold text-white">{entry.workoutPlan.focus}</p><p className="mt-2 text-xs leading-5 text-zinc-400">{entry.workoutPlan.warmup}</p></div><div className="space-y-2">{entry.workoutPlan.exercises.map((exercise, exerciseIndex) => <article key={`${exerciseIndex}-${exercise.name}`} className="rounded-lg bg-black/20 p-3"><div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><h3 className="font-semibold text-white">{exerciseIndex + 1}. {exercise.name}</h3><span className="text-xs text-lime-200">{exercise.sets} sets · {exercise.reps} reps · {exercise.weightKg === null ? "comfortable weight" : `${exercise.weightKg} kg`}</span></div><p className="mt-1 text-xs leading-5 text-zinc-400">{exercise.why}{exercise.restSeconds ? ` Rest ${exercise.restSeconds}s between sets.` : ""}</p></article>)}</div><p className="rounded-lg border border-white/5 px-3 py-2 text-xs leading-5 text-zinc-400">{entry.workoutPlan.coachTip}</p></div>}</div>)}{busy && <p className="mr-6 rounded-xl bg-white/5 px-3 py-2 text-xs text-zinc-400">Your buddy is typing…</p>}<div ref={bottomRef}/></div>
      <textarea value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !busy && text.trim()) { event.preventDefault(); void parse(); } }} rows={3} placeholder="Chat with me… tell me what you trained and I’ll log it, or ask me anything fitness-related." className={`${field} mt-4 resize-y`} />
      <div className="mt-2 flex justify-end"><button disabled={busy || !memoryReady || !text.trim()} onClick={() => void parse()} className={button}>{!memoryReady ? "Loading memory…" : busy ? "Thinking..." : "Send"}</button></div>
      {message && <p role="status" className="mt-3 text-xs text-lime-300">{message}</p>}
    </section>}
  </div>;
}




