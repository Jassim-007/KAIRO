export default function Loading() {
  return (
    <main role="status" aria-live="polite" className="min-h-screen bg-[#10110f] px-4 py-6 text-white sm:px-8 sm:py-9">
      <span className="sr-only">Loading your training space</span>
      <div className="mx-auto max-w-5xl animate-pulse space-y-6">
        <div className="h-3 w-36 rounded bg-white/10" />
        <div className="flex gap-2 overflow-hidden border-b border-white/[0.08] pb-4">
          {[84, 72, 82, 148, 72, 70].map((width, index) => <div key={index} style={{ width }} className="h-10 shrink-0 rounded-xl bg-white/[0.06]" />)}
        </div>
        <div className="space-y-3 py-4">
          <div className="h-3 w-28 rounded bg-lime-300/15" />
          <div className="h-10 w-72 max-w-full rounded-lg bg-white/[0.08]" />
          <div className="h-4 w-[28rem] max-w-full rounded bg-white/[0.05]" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((index) => <div key={index} className="h-36 rounded-2xl border border-white/[0.06] bg-[#171915]" />)}
        </div>
        <div className="h-72 rounded-2xl border border-white/[0.06] bg-[#171915]" />
      </div>
    </main>
  );
}
