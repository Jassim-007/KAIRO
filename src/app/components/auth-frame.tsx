"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import { Hills, PlantScene } from "@/app/components/illustrations";

/* Shared chrome for login, signup and email verification. */
export default function AuthFrame({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="relative mx-auto grid min-h-dvh w-full max-w-6xl items-center gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:px-10">
      {/* KAIRO brand panel */}
      <section
        aria-hidden="true"
        className="relative order-1 overflow-hidden rounded-[2rem] bg-gradient-to-b from-lavender/70 to-lavender/20 px-6 pb-8 pt-5 lg:min-h-[34rem] lg:px-12 lg:pb-12 lg:pt-8"
      >
        {/* Logo and brand name */}
        <div className="relative z-10 flex items-center gap-3">
          <Image
            src="/kairo-k-symbol.svg"
            alt=""
            width={38}
            height={38}
            priority
            className="h-[38px] w-[38px] object-contain"
          />
          <span className="font-display text-lg font-bold tracking-[0.2em]">
            KAIRO
          </span>
        </div>

        {/* Headline and illustration are stacked to prevent overlap */}
        <div className="relative mt-7 flex flex-col gap-5 lg:mt-16 lg:gap-8">
          <div className="relative z-10 max-w-md">
            <p className="font-display text-[1.7rem] font-bold leading-[1.08] sm:text-3xl lg:text-5xl">
              One honest rep at a time.
            </p>

            <p className="note mt-3 text-lg sm:text-xl lg:mt-4 lg:text-2xl">
              a steadier you is already on the way
            </p>
          </div>

          <div className="flex justify-center lg:justify-end">
            <PlantScene className="h-32 w-auto max-w-full shrink-0 sm:h-40 lg:h-56" />
          </div>
        </div>

        {/* Decorative landscape */}
        <Hills className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-28 w-full lg:block" />
      </section>

      {/* Login, signup, and verification content */}
      <section className="card order-2 -mt-2 rounded-[2rem] p-6 sm:p-9 lg:mt-0">
        <p className="eyebrow">{eyebrow}</p>

        <h1 className="mt-3 text-[2rem] font-bold leading-tight">
          {title}
        </h1>

        <p className="mt-2 text-[0.95rem] text-ink-soft">{subtitle}</p>

        <div className="mt-7">{children}</div>

        {footer && (
          <div className="mt-6 text-center text-sm text-ink-soft">
            {footer}
          </div>
        )}
      </section>
    </main>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm font-semibold text-ink">
      {label}
      {children}
    </label>
  );
}

export const inputClass =
  "mt-2 w-full rounded-2xl border border-line-strong bg-field px-4 py-3.5 text-base font-normal";

export function PasswordInput({
  value,
  onChange,
  autoComplete,
  minLength,
}: {
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  minLength?: number;
}) {
  const [shown, setShown] = useState(false);

  return (
    <span className="relative mt-2 block">
      <input
        required
        type={shown ? "text" : "password"}
        minLength={minLength}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-line-strong bg-field py-3.5 pl-4 pr-20 text-base font-normal"
      />

      <button
        type="button"
        onClick={() => setShown((value) => !value)}
        aria-pressed={shown}
        aria-label={shown ? "Hide password" : "Show password"}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-3 py-1.5 text-xs font-bold text-periwinkle hover:bg-sunken"
      >
        {shown ? "Hide" : "Show"}
      </button>
    </span>
  );
}

export function Alert({
  kind,
  children,
}: {
  kind: "error" | "success";
  children: ReactNode;
}) {
  return kind === "error" ? (
    <p
      role="alert"
      className="rounded-2xl border border-danger/25 bg-danger/10 p-3.5 text-sm font-medium text-danger"
    >
      {children}
    </p>
  ) : (
    <p
      role="status"
      className="rounded-2xl border border-sage/30 bg-sage/15 p-3.5 text-sm font-medium text-success"
    >
      {children}
    </p>
  );
}