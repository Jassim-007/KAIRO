"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import NaturalLog from "@/app/components/natural-log";

export default function PlanPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (user) => {
    setReady(true);
    if (!user) router.replace("/login");
  }), [router]);

  if (!ready) return <main className="min-h-screen p-8 text-ink-soft">Loading your workout coach…</main>;

  return (
    <main className="min-h-screen text-ink">
      <header className="px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8">
        <p className="text-xs text-ink-mute">KAIRO · YOUR MOMENT. YOUR MOMENTUM</p>
      </header>
      <div className="mx-auto max-w-3xl px-4 py-5 sm:px-8 sm:py-8">
        <section className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-periwinkle">Training studio</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Build your workout</h1>
          <p className="mt-2 text-sm text-ink-soft">Talk it through with your coach. Your workout card will appear in the chat, ready to add and start.</p>
        </section>
        <NaturalLog inline initialOpen workoutCoach />
      </div>
    </main>
  );
}

