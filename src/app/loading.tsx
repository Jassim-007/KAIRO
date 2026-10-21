export default function Loading() {
  return (
    <main role="status" aria-live="polite" className="min-h-dvh px-4 py-6 sm:px-8 sm:py-9">
      <span className="sr-only">Loading your training space</span>
      <div className="mx-auto max-w-5xl animate-pulse space-y-6">
        <div className="h-3 w-36 rounded-full bg-lavender/70" />
        <div className="space-y-3 py-2">
          <div className="h-3 w-28 rounded-full bg-periwinkle/20" />
          <div className="h-10 w-72 max-w-full rounded-2xl bg-lavender/60" />
          <div className="h-4 w-[26rem] max-w-full rounded-full bg-lavender/40" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((index) => <div key={index} className="h-36 rounded-[1.75rem] border border-line bg-surface" />)}
        </div>
        <div className="h-72 rounded-[1.75rem] border border-line bg-surface" />
      </div>
    </main>
  );
}
