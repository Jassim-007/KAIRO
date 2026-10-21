/* Original botanical scene used on the auth screens, dashboard hero and empty states.
   Colours are fixed greens/clay so it reads on both the light and night themes. */
export function PlantScene({ className = "", sun = true }: { className?: string; sun?: boolean }) {
  const leaf = "M0 0C17-26 18-66 0-98C-18-66-17-26 0 0Z";
  return (
    <svg viewBox="0 0 240 250" className={className} role="img" aria-label="A potted plant growing in morning light">
      {sun && <circle className="sun" cx="196" cy="42" r="24" fill="var(--c-butter)" />}
      <ellipse cx="120" cy="226" rx="104" ry="14" fill="var(--c-lavender)" opacity=".55" />
      <g className="sway">
        <g transform="translate(120 176)">
          <g transform="rotate(-58) scale(.78)"><path d={leaf} fill="#7fae88" /><path d="M0 0V-86" stroke="#4f7f5e" strokeWidth="2" opacity=".55" /></g>
          <g transform="rotate(58) scale(.8)"><path d={leaf} fill="#8db596" /><path d="M0 0V-86" stroke="#4f7f5e" strokeWidth="2" opacity=".55" /></g>
          <g transform="rotate(-30) scale(1.02)"><path d={leaf} fill="#5d8f6c" /><path d="M0 0V-90" stroke="#3f6f50" strokeWidth="2" opacity=".6" /></g>
          <g transform="rotate(31) scale(1)"><path d={leaf} fill="#4f7f5e" /><path d="M0 0V-90" stroke="#355f45" strokeWidth="2" opacity=".6" /></g>
          <g transform="rotate(-6) scale(1.2)"><path d={leaf} fill="#6e9f7b" /><path d="M0 0V-94" stroke="#3f6f50" strokeWidth="2" opacity=".6" /></g>
          <g transform="rotate(10) scale(.7)"><path d={leaf} fill="#a3c7aa" /></g>
        </g>
      </g>
      <path d="M78 172h84l-9 46c-1 5-5 8-10 8H97c-5 0-9-3-10-8l-9-46Z" fill="#f1ece3" />
      <path d="M74 168c0-3 2-5 5-5h82c3 0 5 2 5 5s-2 6-5 6H79c-3 0-5-3-5-6Z" fill="#e6dfd3" />
      <g fill="#cfc6b6" opacity=".7"><circle cx="100" cy="196" r="1.6" /><circle cx="128" cy="205" r="1.4" /><circle cx="144" cy="188" r="1.7" /><circle cx="112" cy="214" r="1.3" /><circle cx="136" cy="219" r="1.2" /></g>
    </svg>
  );
}

/* Rolling hills used behind hero panels and the 404/error states. */
export function Hills({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 140" preserveAspectRatio="none" className={className} aria-hidden="true" focusable="false">
      <path d="M0 96c60-34 112-36 172-8s118 20 228-24V140H0Z" fill="var(--c-lavender)" opacity=".7" />
      <path d="M0 118c70-24 128-18 190 2s130 6 210-18v38H0Z" fill="var(--c-navy)" opacity=".85" />
    </svg>
  );
}

/* Circular progress used for the dashboard's daily balance. */
export function Ring({ value, size = 176, stroke = 16, children, label }: { value: number; size?: number; stroke?: number; children?: React.ReactNode; label: string }) {
  const clamped = Math.max(0, Math.min(1, value));
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--c-lavender)" strokeWidth={stroke} opacity=".75" />
        <circle
          className="ring-draw"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--c-periwinkle)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={len}
          strokeDashoffset={len * (1 - clamped)}
          style={{ ["--ring-len" as string]: len }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}
