import type { ReactNode, SVGProps } from "react";

/* Hand-set 24px stroke icons. Kept inline so the app ships zero icon dependencies. */
const paths: Record<string, ReactNode> = {
  home: <><path d="M4 11.2 12 4l8 7.2" /><path d="M6 10v9.2c0 .4.3.8.8.8H10v-5.5h4V20h3.2c.5 0 .8-.4.8-.8V10" /></>,
  dumbbell: <><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  chart: <><path d="M4 19.5V10M10 19.5V5M16 19.5v-7M21 19.5H3" /></>,
  grid: <><rect x="4" y="4" width="6.5" height="6.5" rx="2" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="2" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="2" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2" /></>,
  calendar: <><rect x="4" y="5.5" width="16" height="14.5" rx="3.5" /><path d="M8 3.5v4M16 3.5v4M4 10.5h16" /></>,
  book: <><path d="M5 5.5c0-.8.7-1.5 1.5-1.5H19v14.5H6.5C5.7 18.5 5 19.2 5 20" /><path d="M5 5.5V20c0 .8.7 1.5 1.5 1.5H19" /></>,
  users: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19c.4-3 2.7-4.8 5.5-4.8s5.1 1.8 5.5 4.8" /><path d="M15.5 5.6a3 3 0 0 1 0 5.8M17.5 14.6c1.8.5 3 2 3.3 4.4" /></>,
  spark: <><path d="M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5Z" /><path d="M18.5 16.5c.2 1.4.8 2 2.2 2.2-1.4.2-2 .8-2.2 2.2-.2-1.4-.8-2-2.2-2.2 1.4-.2 2-.8 2.2-2.2Z" /></>,
  user: <><circle cx="12" cy="8.5" r="3.6" /><path d="M4.8 20c.5-3.6 3.4-5.7 7.2-5.7s6.7 2.1 7.2 5.7" /></>,
  logout: <><path d="M14 4.5h4.2c.9 0 1.3.5 1.3 1.3v12.4c0 .8-.4 1.3-1.3 1.3H14" /><path d="M10 8l-4 4 4 4M6 12h9" /></>,
  more: <><circle cx="6" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="18" cy="12" r="1.4" /></>,
  close: <><path d="M6 6l12 12M18 6 6 18" /></>,
  chevron: <><path d="m9.5 6 6 6-6 6" /></>,
  drop: <><path d="M12 3.8c3.4 4 5.5 6.8 5.5 9.6a5.5 5.5 0 0 1-11 0c0-2.8 2.1-5.6 5.5-9.6Z" /></>,
  flame: <><path d="M12 3.5c.5 3-1.7 4.3-3.2 6.2A6 6 0 0 0 7.5 14a4.5 4.5 0 0 0 9 0c0-1.7-.8-2.7-1.6-3.6-.3 1.2-1 1.8-1.8 2 .6-3.4-.6-6.4-1.1-8.9Z" /></>,
  bolt: <><path d="M13 3.5 5.5 13.2h5.3L10 20.5l8-10h-5.4Z" /></>,
  leaf: <><path d="M5 19c0-8 4.5-13.5 14-14 .2 9.5-5 14.5-12.5 14" /><path d="M5 19c2.5-4 5.5-6.7 9-8.5" /></>,
  play: <><path d="M8 5.5v13l10.5-6.5Z" /></>,
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 22, strokeWidth = 1.8, ...rest }: { name: IconName; size?: number; strokeWidth?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      {paths[name]}
    </svg>
  );
}

/* FORM/AI mark: a butter sun with a sprout, the app's growth motif. */
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <circle cx="20" cy="20" r="20" fill="var(--c-butter)" />
      <path d="M20 31V19.5" stroke="#1d2050" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M20 21c-1-5.4-4.6-7.6-9.4-7.2.2 5 3.6 8 9.4 7.2Z" fill="#1d2050" />
      <path d="M20 19c.8-4.6 4-6.8 8.6-6.4-.2 4.4-3.4 7.2-8.6 6.4Z" fill="#1d2050" opacity=".72" />
    </svg>
  );
}
