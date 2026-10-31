"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import Image from "next/image";
import { imageForExercise } from "@/app/exercises/catalog";

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

type WorkoutHistory = {
  date: string;
  workoutType: string;
  exercises: {
    name: string;
    sets: number;
    reps: number;
    weightKg: number;
  }[];
};

type WorkoutPlan = {
  id?: string;
  plannedFor?: string;
  focus: string;
  warmup: string;
  exercises: {
    name: string;
    sets: number;
    reps: string;
    weightKg: number | null;
    restSeconds: number;
    why: string;
    muscle?: string;
    equipment?: string;
    alternatives?: string[];
  }[];
  coachTip: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  workoutPlan?: WorkoutPlan;
};

const field =
  "mt-1 w-full rounded-xl border border-line bg-field px-3 py-3 text-sm text-ink placeholder:text-ink-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/40";

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function NaturalLog({
  inline = false,
  initialOpen = false,
  workoutCoach = false,
}: {
  inline?: boolean;
  initialOpen?: boolean;
  workoutCoach?: boolean;
  workoutHistory?: WorkoutHistory[];
}) {
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(initialOpen);
  const [text, setText] = useState("");
  const [photoData, setPhotoData] = useState("");
  const [pendingMeals, setPendingMeals] = useState<Draft[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [workoutDate, setWorkoutDate] = useState(today());
  const [chat, setChat] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: workoutCoach
        ? "Hey! Ask me what to train today or tell me what you want to work on. I’ll help shape it into a clear plan."
        : "Hey! Tell me about your workout, food, goals, or anything fitness-related. If you tell me what you actually did, I’ll log it too.",
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [memoryReady, setMemoryReady] = useState(false);
  const [confirmedPlans, setConfirmedPlans] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const memoryUrl = workoutCoach ? "/api/ai/memory?scope=workout" : "/api/ai/memory";

  const request = useCallback(
    async function request<T>(
      url: string,
      method = "GET",
      body?: unknown,
    ): Promise<T> {
      const token = await user!.getIdToken();
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: "Bearer " + token,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Something went wrong.");
      return result as T;
    },
    [user],
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) =>
      setUser(currentUser),
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;

    void request<{ messages?: ChatMessage[] }>(memoryUrl)
      .then((data) => {
        if (active && data.messages?.length) {
          const visibleMessages = workoutCoach
            ? data.messages.filter((entry, index, messages) => {
                const failedReply = "I couldn't shape that into a workout plan. Try asking me again.";
                return entry.content !== failedReply && !(
                  entry.role === "user" &&
                  messages[index + 1]?.role === "assistant" &&
                  messages[index + 1]?.content === failedReply
                );
              })
            : data.messages;
          if (visibleMessages.length) setChat(visibleMessages.slice(-80));
        }
      })
      .catch(() => {
        if (active) {
          setMessage(
            "Chat history is temporarily unavailable; this session will still work.",
          );
        }
      })
      .finally(() => {
        if (active) setMemoryReady(true);
      });

    return () => {
      active = false;
    };
  }, [user, request, memoryUrl, workoutCoach]);

  useEffect(() => {
    if (!user || !workoutCoach) return;
    let active = true;
    const refreshPlans = () => request<{ days?: { day: string; routines?: { id: string }[] }[] }>("/api/fitness/plans")
      .then((data) => {
        if (!active) return;
        const savedIds = new Set((data.days || []).flatMap((day) => (day.routines || []).map((routine) => routine.id)));
        setConfirmedPlans(() => {
          const next: Record<string, string> = {};
          for (const entry of chat) {
            const plan = entry.workoutPlan;
            if (plan?.id && plan.plannedFor && savedIds.has(plan.id)) next[plan.id] = plan.plannedFor;
          }
          return next;
        });
      })
      .catch(() => undefined);
    refreshPlans();
    window.addEventListener("fitness-plan-updated", refreshPlans);
    return () => { active = false; window.removeEventListener("fitness-plan-updated", refreshPlans); };
  }, [user, workoutCoach, request, chat]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [chat, busy]);

  if (!user) return null;

  async function parse() {
    const userText = text.trim();
    const photo = photoData;
    if (!userText && !photo) return;
    const history = chat
      .slice(-12)
      .filter(
        (entry) =>
          !entry.content.startsWith("On ") &&
          !entry.content.includes(
            "saved food, water, weight, or workout entries for",
          ),
      )
      .slice(-8);

    setBusy(true);
    setMessage("");
    setChat((messages) => [...messages, { role: "user", content: userText || "Food photo attached for an estimate." }]);
    if (!workoutCoach) setText("");

    try {
      if (photo && !workoutCoach) {
        const result = await request<{ reply: string; draft: Omit<Draft, "kind" | "amountMl" | "weightKg" | "workoutType" | "exercises" | "confidence"> | null }>("/api/ai/food-image", "POST", { image: photo, text: userText, date: today() });
        setChat((messages) => [...messages, { role: "assistant", content: result.reply }]);
        if (result.draft) {
          setPendingMeals((meals) => [...meals, { ...result.draft!, kind: "nutrition", amountMl: 0, weightKg: 0, workoutType: "Custom", exercises: [], confidence: 50 }]);
          setPhotoData("");
          if (photoInputRef.current) photoInputRef.current.value = "";
        }
        void request(memoryUrl, "POST", { messages: [{ role: "user", content: userText || "Food photo submitted for estimate." }, { role: "assistant", content: result.reply }] }).catch(() => undefined);
        return;
      }
      const pendingPlan = workoutCoach && /\b(confirm|save|add)\b.*\b(workout|plan|session)\b/i.test(userText)
        ? [...chat].reverse().find((entry) => entry.role === "assistant" && entry.workoutPlan?.id)?.workoutPlan
        : undefined;
      if (pendingPlan?.id) {
        const planDate = pendingPlan.plannedFor || workoutDate;
        await request("/api/fitness/plans/confirm", "POST", { date: planDate, plan: pendingPlan });
        setText("");
        setConfirmedPlans((current) => ({ ...current, [pendingPlan.id!]: planDate }));
        window.dispatchEvent(new Event("fitness-plan-updated"));
        setChat((messages) => [...messages, { role: "assistant", content: `Saved ${pendingPlan.focus} for ${planDate}. This is scheduled for that date only.` }]);
        setMessage(`Scheduled for ${planDate}.`);
        return;
      }
      let result: {
        items: Draft[];
        reply: string;
        workoutPlan?: WorkoutPlan | null;
      };

      if (workoutCoach) {
        const explicitPlanRequest = /\b(?:create|make|build|design|plan|give|show|suggest|recommend)\b.{0,50}\b(?:workout|session|routine|split|training plan)\b|\bwhat should i (?:work|train)\b/i.test(userText);
        const planFollowUp = /\b(?:bui(?:l)?d|make|create|generate|show|where|display|give|gimme|see|open|find)\b.{0,35}\b(?:it|that|this|one|plan|workout|session)\b|\bwhere\s+(?:is|did)\s+(?:you\s+)?(?:set\s+)?(?:it|that|my workout|the workout)\b/i.test(userText);
        const planEditRequest = /\b(?:add|remove|replace|swap|change|more|less|another|one more)\b.{0,40}\b(?:exercise|movement|biceps?|back|shoulders?|rear delts?|chest|legs?|triceps?)\b|\b(?:gimme|give|add)\b.{0,20}\b(?:one|1)\s+more\b/i.test(userText);
        const recentPlanMention = chat.slice(-8).some((entry) =>
          entry.role === "assistant" &&
          (entry.workoutPlan || /\b(?:workout|training|pull|push|leg)\s+(?:plan|session|workout)\b|\b(?:plan|session)\b.{0,30}\b(?:ready|set up|here)\b/i.test(entry.content))
        );
        const generated = await request<{
          reply: string;
          plan?: WorkoutPlan | null;
        }>("/api/ai/workout-plan", "POST", {
          text: userText,
          date: workoutDate,
          history: history.slice(-6),
          today: today(),
          requirePlan: explicitPlanRequest || ((planFollowUp || planEditRequest) && recentPlanMention),
        });

        setText("");
        result = {
          items: [],
          reply: generated.reply,
          ...(generated.plan
            ? { workoutPlan: { ...generated.plan, id: crypto.randomUUID(), plannedFor: workoutDate } }
            : {}),
        };
      } else {
        result = await request<{ items: Draft[]; reply: string }>(
          "/api/ai/parse",
          "POST",
          { text: userText, date: today(), history },
        );
      }

      setChat((messages) => [
        ...messages,
        {
          role: "assistant",
          content: result.reply,
          ...(result.workoutPlan
            ? { workoutPlan: result.workoutPlan }
            : {}),
        },
      ]);

      void request(memoryUrl, "POST", {
        messages: [
          { role: "user", content: userText },
          {
            role: "assistant",
            content: result.reply,
            ...(result.workoutPlan
              ? { workoutPlan: result.workoutPlan }
              : {}),
          },
        ],
      }).catch(() =>
        setMessage("Reply received, but chat history could not be saved."),
      );

      let saved = 0;
      const failures: string[] = [];

      for (const draft of result.items) {
        try {
          await saveDraft(draft);
          saved += 1;
        } catch (reason) {
          failures.push(
            reason instanceof Error
              ? reason.message
              : "One entry could not be saved.",
          );
        }
      }

      if (saved > 0) {
        window.dispatchEvent(new CustomEvent("fitness-record-saved"));
      }

      if (failures.length === 0) {
        setMessage("");
      } else {
        setMessage(
          `${saved} ${saved === 1 ? "entry" : "entries"} added; ${failures.length} ${failures.length === 1 ? "entry needs" : "entries need"} a retry.`,
        );
        setChat((messages) => [
          ...messages,
          {
            role: "assistant",
            content: `I got ${saved} saved, but ${failures.length} ${failures.length === 1 ? "entry didn't" : "entries didn't"} go through: ${failures[0]}`,
          },
        ]);
      }
    } catch (reason) {
      const reply =
        reason instanceof Error
          ? reason.message
          : "I couldn't reach my AI brain just now. Nothing was logged—try me again in a bit.";

      if (workoutCoach) {
        setText(userText);
        if (reply.toLowerCase().includes("429") || reply.toLowerCase().includes("busy") || reply.toLowerCase().includes("too many requests")) {
          setMessage("The workout coach is busy. Your message is still here; wait a little, then retry.");
        }
      }
      setChat((messages) => [...messages, { role: "assistant", content: reply }]);

      if (!workoutCoach) void request(memoryUrl, "POST", {
        messages: [
          { role: "user", content: userText },
          { role: "assistant", content: reply },
        ],
      }).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function confirmWorkout(plan: WorkoutPlan) {
    if (!plan.id) return;
    const planDate = plan.plannedFor || workoutDate;
    setBusy(true);
    setMessage("");
    try {
      await request("/api/fitness/plans/confirm", "POST", { date: planDate, plan });
      setConfirmedPlans((current) => ({ ...current, [plan.id!]: planDate }));
      window.dispatchEvent(new Event("fitness-plan-updated"));
      setMessage(`Scheduled for ${planDate} only.`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "I couldn't save that plan.");
    } finally {
      setBusy(false);
    }
  }

  function updatePendingMeal(index: number, changes: Partial<Draft>) {
    setPendingMeals((meals) => meals.map((meal, i) => i === index ? { ...meal, ...changes } : meal));
  }

  async function confirmPendingMeal(index: number) {
    const meal = pendingMeals[index];
    if (!meal || busy) return;
    setBusy(true);
    try {
      await saveDraft(meal);
      setPendingMeals((meals) => meals.filter((_, i) => i !== index));
      setMessage("Meal saved to your nutrition log.");
      window.dispatchEvent(new CustomEvent("fitness-record-saved"));
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Could not save this meal.");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft(draft: Draft) {
    if (draft.kind === "nutrition") {
      await request("/api/nutrition", "POST", {
        foodName: draft.name,
        mealType: draft.mealType,
        servings: draft.servings,
        calories: draft.calories,
        protein: draft.protein,
        carbs: draft.carbs,
        fat: draft.fat,
        date: draft.date,
        notes: draft.notes,
        aiEstimated: draft.estimatedNutrition,
      });
    } else if (draft.kind === "water") {
      await request("/api/fitness/water", "POST", {
        date: draft.date,
        amountMl: draft.amountMl,
        notes: draft.notes,
      });
    } else if (draft.kind === "weight") {
      await request("/api/fitness/weight", "POST", {
        date: draft.date,
        weightKg: draft.weightKg,
        notes: draft.notes,
      });
    } else {
      await request("/api/fitness/workouts", "POST", {
        date: draft.date,
        workoutType: draft.workoutType,
        notes: draft.notes,
        exercises: draft.exercises,
      });
    }
  }

  const button =
    "rounded-xl bg-butter px-4 py-2.5 text-xs font-bold text-butter-ink shadow-card transition hover:bg-butter-hover disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div
      className={
        inline
          ? "w-full"
          : "fixed bottom-4 right-4 z-50 w-[min(25rem,calc(100vw-2rem))] sm:bottom-6 sm:right-6"
      }
    >
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="card flex w-full items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3 text-left transition hover:border-line-strong"
        >
          <span>
            <span className="block text-xs font-semibold uppercase tracking-wider text-periwinkle">
              KAIRO chat
            </span>
            <span className="mt-1 block text-sm text-ink">
              Talk with your fitness buddy
            </span>
          </span>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-butter text-xl font-bold text-butter-ink">
            +
          </span>
        </button>
      ) : (
        <section
          className={`card ${
            inline
              ? "rounded-2xl p-4 sm:p-5"
              : "max-h-[78vh] overflow-y-auto rounded-2xl p-4 shadow-lift"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-periwinkle">
                KAIRO chat
              </p>
              <h2 className="mt-1 font-semibold text-ink">
                Your fitness buddy
              </h2>
            </div>
            <button
              aria-label="Close chat"
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-1 text-ink-mute transition hover:bg-sunken"
            >
              ×
            </button>
          </div>

          <p className="mt-2 text-xs leading-5 text-ink-mute">
            {workoutCoach
              ? "Discuss your training, exercises, recovery, or a session plan. I’ll use your saved workouts to shape the selected day’s plan; it is only added after you confirm."
              : "Just dump your notes how you have them—even a bunch of days at once, spelling and all. I’ll sort it out and add the entries to your log."}
          </p>

          {workoutCoach && <label className="mt-3 block text-xs text-ink-mute">Plan for<input type="date" value={workoutDate} onChange={(event) => setWorkoutDate(event.target.value)} className={`${field} max-w-56`} /></label>}

          <div
            aria-live="polite"
            className="mt-4 max-h-[34rem] space-y-3 overflow-y-auto"
          >
            {chat.slice(-10).map((entry, index) => (
              <div
                key={`${index}-${entry.role}`}
                className={`rounded-2xl px-3 py-3 text-sm leading-6 ${
                  entry.role === "user"
                    ? "ml-6 border border-line bg-lavender text-ink"
                    : "mr-6 border border-line bg-sunken text-ink-soft"
                }`}
              >
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-periwinkle">
                  {entry.role === "user" ? "You" : "KAIRO BOT"}
                </span>
                <p className="whitespace-pre-wrap">{entry.content}</p>

                {entry.workoutPlan && (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-xl border border-line bg-surface p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-periwinkle">
                        Workout focus
                      </p>
                      <p className="mt-1 font-semibold text-ink">
                        {entry.workoutPlan.focus}
                      </p>
                      <p className="mt-2 text-xs leading-5 text-ink-mute">
                        {entry.workoutPlan.warmup}
                      </p>
                    </div>

                    <div className="space-y-2">
                      {entry.workoutPlan.exercises.map(
                        (exercise, exerciseIndex) => (
                          <article
                            key={`${exerciseIndex}-${exercise.name}`}
                            className="rounded-xl border border-line bg-surface p-3"
                          >
                            <div className="flex items-start gap-3">
                              {imageForExercise(exercise.name) && <Image src={imageForExercise(exercise.name)!} alt="" width={64} height={64} className="h-16 w-16 rounded-lg object-cover" />}
                              <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                              <h3 className="font-semibold text-ink">
                                {exerciseIndex + 1}. {exercise.name}
                              </h3>
                              <span className="text-xs text-periwinkle">
                                {exercise.sets} sets · {exercise.reps} reps ·{" "}
                                {exercise.weightKg === null
                                  ? "comfortable weight"
                                  : `${exercise.weightKg} kg`}
                              </span>
                            </div>
                            <p className="mt-1 text-xs leading-5 text-ink-mute">
                              {exercise.muscle || "Full body"} · {exercise.equipment || "Equipment flexible"}<br />{exercise.why}
                              {exercise.restSeconds
                                ? ` Rest ${exercise.restSeconds}s between sets.`
                                : ""}
                            </p>
                            {exercise.alternatives?.length ? <p className="mt-1 text-xs text-ink-mute">Alternatives: {exercise.alternatives.join(" · ")}</p> : null}
                              </div>
                            </div>
                          </article>
                        ),
                      )}
                    </div>

                    <p className="rounded-xl border border-line px-3 py-2 text-xs leading-5 text-ink-mute">
                      {entry.workoutPlan.coachTip}
                    </p>
                    {workoutCoach && (() => {
                      const id = entry.workoutPlan.id;
                      const confirmedDate = id ? confirmedPlans[id] : undefined;
                      const confirmed = Boolean(confirmedDate);
                      return confirmed ? (
                        <a href={`/workout?day=${encodeURIComponent(new Date(`${confirmedDate}T12:00:00`).toLocaleDateString(undefined, { weekday: "long" }))}&date=${encodeURIComponent(confirmedDate!)}&routine=${encodeURIComponent(id!)}`} className="block rounded-xl bg-butter px-3 py-2.5 text-center text-sm font-bold text-butter-ink">Start this workout</a>
                      ) : <button disabled={busy} onClick={() => void confirmWorkout(entry.workoutPlan!)} className={`${button} w-full`}>Confirm · schedule this date</button>;
                    })()}
                  </div>
                )}
              </div>
            ))}

            {!workoutCoach && pendingMeals.map((meal, index) => (
              <article key={`pending-meal-${index}`} className="rounded-2xl border border-periwinkle/30 bg-surface p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-periwinkle">Review estimate · not saved yet</p>
                <label className="mt-2 block text-xs text-ink-mute">Meal<input value={meal.name} onChange={(event) => updatePendingMeal(index, { name: event.target.value })} className={field} /></label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(["servings", "calories", "protein", "carbs", "fat"] as const).map((key) => (
                    <label key={key} className="text-xs capitalize text-ink-mute">{key}{key === "servings" ? "" : key === "calories" ? " (kcal)" : " (g)"}
                      <input type="number" min="0" step="any" value={meal[key]} onChange={(event) => updatePendingMeal(index, { [key]: Number(event.target.value) } as Partial<Draft>)} className={field} />
                    </label>
                  ))}
                  <label className="text-xs text-ink-mute">Portion / correction<input value={meal.notes} onChange={(event) => updatePendingMeal(index, { notes: event.target.value })} className={field} /></label>
                </div>
                <p className="mt-2 text-xs text-ink-mute">Photo-based nutrition is approximate. Adjust the portion or values before saving.</p>
                <button type="button" disabled={busy || !meal.name.trim()} onClick={() => void confirmPendingMeal(index)} className={`${button} mt-3 w-full`}>Confirm and save meal</button>
                <button type="button" onClick={() => setPendingMeals((meals) => meals.filter((_, i) => i !== index))} className="mt-2 w-full text-xs text-ink-mute">Discard estimate</button>
              </article>
            ))}
            {busy && (
              <p className="mr-6 rounded-xl border border-line bg-sunken px-3 py-2 text-xs text-ink-mute">
                KAIRO BOT is typing…
              </p>
            )}
            <div ref={bottomRef} />
          </div>

          {!workoutCoach && photoData && <div className="mt-3 flex items-center gap-3 rounded-xl border border-line bg-surface p-2"><Image src={photoData} unoptimized alt="Selected food" width={64} height={64} className="h-16 w-16 rounded-lg object-cover" /><span className="flex-1 text-xs text-ink-mute">Photo ready for a temporary estimate</span><button type="button" onClick={() => setPhotoData("")} className="text-xs text-ink-mute">Remove</button></div>}
          {!workoutCoach && <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
              setMessage("Choose a JPEG, PNG, or WebP photo under 5 MB.");
              event.target.value = "";
              return;
            }
            const reader = new FileReader();
            reader.onload = () => { if (typeof reader.result === "string") setPhotoData(reader.result); };
            reader.readAsDataURL(file);
          }} />}
          <textarea
            disabled={busy}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !busy &&
                text.trim()
              ) {
                event.preventDefault();
                void parse();
              }
            }}
            rows={3}
            placeholder={workoutCoach
              ? "Ask about your training, an exercise, recovery, or a workout plan…"
              : "Chat with me… tell me what you trained and I’ll log it, or ask me anything fitness-related."}
            className={`${field} mt-4 resize-y`}
          />

          <div className="mt-2 flex flex-wrap justify-between gap-2">
            {!workoutCoach && <button type="button" disabled={busy} onClick={() => photoInputRef.current?.click()} className="rounded-xl border border-line px-3 py-2 text-xs font-medium text-ink-soft">Camera / upload photo</button>}
            <button
              disabled={busy || !memoryReady || (!text.trim() && !photoData)}
              onClick={() => void parse()}
              className={button}
            >
              {!memoryReady
                ? "Loading memory…"
                : busy
                  ? "Thinking..."
                  : "Send"}
            </button>
          </div>

          {message && (
            <p role="status" className="mt-3 text-xs text-periwinkle">
              {message}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
