"use client";

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logOut } from "@/lib/auth";
import { Icon, type IconName } from "@/app/components/icons";

type Item = { label: string; path: string; icon: IconName; match?: string[] };

/* Every destination from the original navigation is kept; only the arrangement is new. */
const RAIL: Item[] = [
  { label: "Overview", path: "/dashboard", icon: "home" },
  { label: "Tracker", path: "/tracker", icon: "plus" },
  { label: "Tomorrow’s Workout", path: "/tomorrow", icon: "calendar" },
  { label: "Plan", path: "/plan", icon: "dumbbell", match: ["/workout"] },
  { label: "Stats", path: "/stats", icon: "chart" },
  { label: "Exercises", path: "/exercises", icon: "book" },
  { label: "Shared", path: "/workspace", icon: "users" },
  { label: "AI usage", path: "/ai-usage", icon: "spark" },
  { label: "Account", path: "/account", icon: "user" },
];

const MORE: Item[] = [RAIL[2], RAIL[5], RAIL[6], RAIL[7], RAIL[8]];
const APP_ROUTES = [
  "/dashboard",
  "/tracker",
  "/tomorrow",
  "/plan",
  "/workout",
  "/stats",
  "/exercises",
  "/workspace",
  "/ai-usage",
  "/account",
  "/nutrition",
  "/progress",
  "/trackers",
];

const isActive = (pathname: string, item: Item) =>
  [item.path, ...(item.match ?? [])].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sheet, setSheet] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const inApp = APP_ROUTES.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  const focused = pathname === "/workout";

  useEffect(() => {
    if (!sheet) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSheet(false);
    };

    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [sheet]);

  async function signOut() {
    setSigningOut(true);
    try {
      await logOut();
    } finally {
      router.replace("/login");
    }
  }

  if (!inApp) return <>{children}</>;

  const trainActive = [
    "/plan",
    "/workout",
    "/tomorrow",
    "/exercises",
  ].some((path) => pathname.startsWith(path));

  const moreActive =
    !sheet && MORE.some((item) => isActive(pathname, item)) && !trainActive;

  const tab = (active: boolean) =>
    `relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[11px] font-semibold transition-colors ${
      active ? "text-ink" : "text-ink-mute"
    }`;

  return (
    <>
      <div
        aria-hidden="true"
        className="scroll-progress fixed inset-x-0 top-0 z-[60] h-[3px] bg-butter"
      />

      {/* Desktop / tablet-landscape rail */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col gap-1 border-r border-line bg-surface p-5 backdrop-blur-xl lg:flex">
        <Link
          href="/dashboard"
          className="mb-5 flex items-center gap-3 rounded-2xl p-1"
        >
          <Image
            src="/kairo-k-symbol.svg"
            alt="KAIRO"
            width={40}
            height={40}
            priority
            className="h-10 w-10 shrink-0 object-contain"
          />
          <span className="font-display text-lg font-bold tracking-[0.16em]">
            KAIRO
          </span>
        </Link>

        <nav
          aria-label="Main sections"
          className="flex flex-1 flex-col gap-1 overflow-y-auto"
        >
          {RAIL.map((item) => {
            const active = isActive(pathname, item);

            return (
              <Link
                key={item.path}
                href={item.path}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                  active
                    ? "bg-butter text-butter-ink shadow-card"
                    : "text-ink-soft hover:bg-sunken hover:text-ink"
                }`}
              >
                <Icon name={item.icon} size={20} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={() => router.push("/workout")}
          className="mt-3 flex items-center justify-center gap-2 rounded-full bg-navy px-5 py-3.5 text-sm font-bold text-canvas shadow-lift"
        >
          <Icon name="play" size={18} />
          Start workout
        </button>

        <button
          onClick={() => void signOut()}
          disabled={signingOut}
          className="mt-1 flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-ink-mute hover:bg-sunken hover:text-ink"
        >
          <Icon name="logout" size={20} />
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </aside>

      <div
        className={`lg:pl-72 ${
          focused
            ? ""
            : "pb-[calc(5.75rem+env(safe-area-inset-bottom))] lg:pb-0"
        }`}
      >
        {children}
      </div>

      {/* Mobile tab bar */}
      {!focused && (
        <nav
          aria-label="Main sections"
          className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] lg:hidden"
        >
          <div
            className="card mx-auto flex max-w-md items-end justify-between rounded-[1.75rem] px-2 pt-1.5 pb-1 shadow-lift"
            style={{ animation: "none" }}
          >
            <Link
              href="/dashboard"
              aria-current={pathname === "/dashboard" ? "page" : undefined}
              className={tab(pathname === "/dashboard")}
            >
              <Icon name="home" />
              Today
            </Link>

            <Link
              href="/plan"
              aria-current={trainActive ? "page" : undefined}
              className={tab(trainActive)}
            >
              <Icon name="dumbbell" />
              Train
            </Link>

            <Link
              href="/tracker"
              aria-label="Log something"
              aria-current={pathname === "/tracker" ? "page" : undefined}
              className="relative -mt-7 flex flex-1 flex-col items-center gap-1 text-[11px] font-semibold text-ink"
            >
              <span className="grid h-14 w-14 place-items-center rounded-full bg-butter text-butter-ink shadow-lift ring-4 ring-[var(--c-canvas)]">
                <Icon name="plus" size={26} strokeWidth={2.2} />
              </span>
              Log
            </Link>

            <Link
              href="/stats"
              aria-current={pathname === "/stats" ? "page" : undefined}
              className={tab(pathname === "/stats")}
            >
              <Icon name="chart" />
              Stats
            </Link>

            <button
              onClick={() => setSheet(true)}
              aria-haspopup="dialog"
              className={tab(moreActive)}
            >
              <Icon name="grid" />
              More
            </button>
          </div>
        </nav>
      )}

      {/* Mobile More menu */}
      {sheet && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center lg:hidden"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSheet(false);
          }}
        >
          <div
            className="scrim-in absolute inset-0 bg-scrim backdrop-blur-sm"
            aria-hidden="true"
            onClick={() => setSheet(false)}
          />

          <section
            role="dialog"
            aria-modal="true"
            aria-label="More destinations"
            className="sheet-in card relative w-full max-w-md rounded-t-[2rem] border-b-0 bg-[var(--c-surface-solid)] p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
          >
            <div
              className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line-strong"
              aria-hidden="true"
            />

            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xl font-bold">More</h2>
              <button
                autoFocus
                aria-label="Close"
                onClick={() => setSheet(false)}
                className="grid h-10 w-10 place-items-center rounded-full bg-sunken text-ink"
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <ul className="divide-y divide-line">
              {MORE.map((item) => (
                <li key={item.path}>
                  <Link
                    href={item.path}
                    onClick={() => setSheet(false)}
                    aria-current={
                      isActive(pathname, item) ? "page" : undefined
                    }
                    className="flex items-center gap-4 py-3.5 text-[0.95rem] font-semibold"
                  >
                    <span className="grid h-10 w-10 place-items-center rounded-2xl bg-sunken text-periwinkle">
                      <Icon name={item.icon} size={20} />
                    </span>
                    <span className="flex-1">{item.label}</span>
                    <Icon
                      name="chevron"
                      size={18}
                      className="text-ink-mute"
                    />
                  </Link>
                </li>
              ))}

              <li>
                <button
                  onClick={() => void signOut()}
                  disabled={signingOut}
                  className="flex w-full items-center gap-4 py-3.5 text-left text-[0.95rem] font-semibold text-ink-soft"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-2xl bg-sunken">
                    <Icon name="logout" size={20} />
                  </span>
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
              </li>
            </ul>
          </section>
        </div>
      )}
    </>
  );
}