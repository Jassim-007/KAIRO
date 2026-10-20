"use client";
import { usePathname, useRouter } from "next/navigation";
const sections = [
  { label: "Overview", path: "/dashboard" }, { label: "Account", path: "/account" }, { label: "Shared", path: "/workspace" }, { label: "Tracker", path: "/tracker" },
  { label: "Tomorrow’s Workout", path: "/tomorrow" }, { label: "Plan", path: "/plan" }, { label: "Stats", path: "/stats" }, { label: "Exercises", path: "/exercises" }, { label: "AI usage", path: "/ai-usage" },
];
export default function SectionNav() {
  const router = useRouter(); const pathname = usePathname();
  return <nav aria-label="Main sections" className="sticky top-0 z-20 flex gap-2 overflow-x-auto border-b border-white/[0.07] bg-[#10110f]/95 px-4 py-3 backdrop-blur sm:px-8">
    {sections.map((section) => { const active = pathname === section.path || (section.path === "/plan" && pathname === "/workout"); return <button key={section.path} onClick={() => router.push(section.path)} aria-current={active ? "page" : undefined} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm transition ${active ? "bg-lime-300 font-semibold text-black" : "border border-white/10 text-zinc-300 hover:bg-white/5"}`}>{section.label}</button>; })}
    {pathname !== "/workspace" && <button onClick={() => router.push("/workout")} className="ml-auto shrink-0 rounded-xl bg-lime-300 px-4 py-2.5 text-sm font-bold text-black">Start workout</button>}
  </nav>;
}

