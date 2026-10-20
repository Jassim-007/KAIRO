"use client";
import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import NaturalLog from "@/app/components/natural-log";
import SectionNav from "@/app/components/section-nav";
type Workout = { id: string; date: string; workoutType: string; exercises: { name: string; sets: number; reps: number; weightKg: number }[] };

export default function TomorrowPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) router.replace("/login");
    });
    return () => unsubscribe();
  }, [router]);
  const load = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/fitness/workouts", { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load workout history.");
      setWorkouts((data.records || []).slice(0, 8));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load workout history.");
    }
  }, [user]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("fitness-record-saved", refresh);
    return () => window.removeEventListener("fitness-record-saved", refresh);
  }, [load]);
  if (!user) return <main className="min-h-screen bg-[#10110f]" />;
  return (
    <main className="min-h-screen bg-[#10110f] text-white">
      <header className="px-4 py-4 sm:px-8"><p className="text-xs text-zinc-500">FORM/AI · your fitness space</p></header>
      <SectionNav />
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-7 sm:px-8 sm:py-9">
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime-300">Your training buddy</p>
          <h1 className="mt-2 text-3xl font-bold">Plan a workout together</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Ask what to train today, tell me what equipment you have, or ask for a change. I’ll give you a clear plan and use a matching exercise in your log to suggest a starting weight.</p>
        </section>
        {error && <p role="alert" className="rounded-xl border border-amber-300/20 p-3 text-sm text-amber-200">{error}</p>}
        <NaturalLog inline initialOpen workoutCoach workoutHistory={workouts} />
      </div>
    </main>
  );
}