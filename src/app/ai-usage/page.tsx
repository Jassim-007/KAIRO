"use client";
import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useRouter } from "next/navigation";
import SectionNav from "@/app/components/section-nav";
import { auth } from "@/lib/firebase";

type Usage = { requestCount: number; inputTokens: number | null; outputTokens: number | null; estimatedCostUsd: number | null; model: string | null; lastRequestAt: string | null };
export default function AiUsagePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async (account: User) => {
    try {
      const token = await account.getIdToken();
      const response = await fetch("/api/ai/usage", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load AI usage.");
      setUsage(data.usage);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load AI usage.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => onAuthStateChanged(auth, (account) => {
    setUser(account);
    if (!account) router.replace("/login");
    else void load(account);
  }), [load, router]);
  if (!user) return <main className="flex min-h-screen items-center justify-center bg-[#10110f] text-zinc-400">Checking your account…</main>;
  const metric = (label: string, value: string, note?: string) => <article key={label} className="rounded-2xl border border-white/10 bg-[#171915] p-5"><p className="text-sm text-zinc-400">{label}</p><p className="mt-3 text-3xl font-bold">{value}</p>{note && <p className="mt-2 text-xs text-zinc-500">{note}</p>}</article>;
  return <main className="min-h-screen bg-[#10110f] text-white"><header className="px-4 py-4 sm:px-8"><p className="text-xs text-zinc-500">FORM/AI · your fitness space</p></header><SectionNav/><div className="mx-auto max-w-5xl space-y-6 px-4 py-7 sm:px-8 sm:py-10"><section><p className="text-xs font-semibold uppercase tracking-[.2em] text-lime-300">Account</p><h1 className="mt-2 text-4xl font-bold">AI usage</h1><p className="mt-2 text-sm text-zinc-400">Gemini requests made from this account using FORM/AI’s shared key.</p></section>
    {error && <p role="alert" className="rounded-xl border border-amber-300/20 p-3 text-sm text-amber-200">{error}</p>}
    {loading ? <p className="rounded-xl bg-[#171915] p-6 text-sm text-zinc-400">Loading usage…</p> : usage && <><section className="grid gap-3 sm:grid-cols-2">{metric("AI requests", usage.requestCount.toLocaleString(), "Counted when Gemini returns an HTTP response, including provider errors.")}{metric("Input tokens", usage.inputTokens === null ? "Not available" : usage.inputTokens.toLocaleString(), "Reported by Gemini when available.")}{metric("Output tokens", usage.outputTokens === null ? "Not available" : usage.outputTokens.toLocaleString(), "Reported by Gemini when available.")}{metric("Estimated cost", usage.estimatedCostUsd === null ? "Not configured" : `$${usage.estimatedCostUsd.toFixed(6)}`, "Estimate uses configured per million token rates; it is not a Gemini invoice.")}</section><section className="rounded-2xl border border-white/10 bg-[#171915] p-5 text-sm text-zinc-400"><p>Current model: <span className="text-zinc-200">{usage.model ?? "No requests yet"}</span></p><p className="mt-2">Last request: <span className="text-zinc-200">{usage.lastRequestAt ? new Date(usage.lastRequestAt).toLocaleString() : "—"}</span></p><p className="mt-3 text-xs text-zinc-500">Only aggregate usage is saved. Your prompts and Gemini responses are not included in this record.</p></section></>}</div></main>;
}
