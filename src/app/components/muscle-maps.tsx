
"use client";

import { useMemo, useState } from "react";
import { MuscleMap } from "@musclemap/react";
import type { MuscleGroup, MuscleMapValues } from "@musclemap/core";

type Props = { volumes: Record<string, number> };
type Model = "MALE" | "FEMALE";

const muscleTargets: Array<{ match: string[]; groups: MuscleGroup[] }> = [
  { match: ["chest", "pectoral", "pec"], groups: ["CHEST"] },
  { match: ["upper back", "trapezius", "traps"], groups: ["TRAPEZIUS"] },
  { match: ["rhomboid"], groups: ["RHOMBOIDS"] },
  { match: ["lower back"], groups: ["BACK_LOWER"] },
  { match: ["lat"], groups: ["LATS"] },
  {
    match: ["back"],
    groups: ["BACK_UPPER", "BACK_LOWER", "TRAPEZIUS", "RHOMBOIDS", "LATS"],
  },
  { match: ["front delt", "anterior delt", "shoulder front"], groups: ["SHOULDERS_FRONT"] },
  { match: ["rear delt", "posterior delt", "shoulder rear"], groups: ["SHOULDERS_REAR"] },
  {
    match: ["shoulder", "deltoid", "delt"],
    groups: ["SHOULDERS_FRONT", "SHOULDERS_SIDE", "SHOULDERS_REAR"],
  },
  { match: ["bicep"], groups: ["BICEPS"] },
  { match: ["tricep"], groups: ["TRICEPS"] },
  { match: ["forearm"], groups: ["FOREARMS"] },
  { match: ["oblique"], groups: ["OBLIQUES"] },
  { match: ["abdominal", "abs", "core"], groups: ["CORE"] },
  { match: ["hip flexor"], groups: ["HIP_FLEXORS"] },
  { match: ["glute"], groups: ["GLUTES"] },
  { match: ["quad", "quadricep"], groups: ["QUADS"] },
  { match: ["hamstring"], groups: ["HAMSTRINGS"] },
  { match: ["calf", "calves", "soleus"], groups: ["CALVES"] },
  { match: ["adductor"], groups: ["ADDUCTORS"] },
  { match: ["abductor"], groups: ["ABDUCTORS"] },
  {
    match: ["leg", "legs", "thigh"],
    groups: ["QUADS", "HAMSTRINGS", "CALVES", "GLUTES"],
  },
  { match: ["arm"], groups: ["BICEPS", "TRICEPS", "FOREARMS"] },
];

const labels: Partial<Record<MuscleGroup, string>> = {
  CHEST: "Chest",
  BACK_UPPER: "Upper back",
  BACK_LOWER: "Lower back",
  TRAPEZIUS: "Trapezius",
  RHOMBOIDS: "Rhomboids",
  LATS: "Lats",
  SHOULDERS_FRONT: "Front shoulders",
  SHOULDERS_SIDE: "Side shoulders",
  SHOULDERS_REAR: "Rear shoulders",
  BICEPS: "Biceps",
  TRICEPS: "Triceps",
  FOREARMS: "Forearms",
  CORE: "Abdominals",
  OBLIQUES: "Obliques",
  GLUTES: "Glutes",
  QUADS: "Quadriceps",
  HAMSTRINGS: "Hamstrings",
  CALVES: "Calves",
  HIP_FLEXORS: "Hip flexors",
  ADDUCTORS: "Adductors",
  ABDUCTORS: "Abductors",
};

export default function MuscleMaps({ volumes }: Props) {
  const [model, setModel] = useState<Model>("MALE");

  const values = useMemo<MuscleMapValues>(() => {
    const sets = new Map<MuscleGroup, number>();

    for (const [rawName, rawCount] of Object.entries(volumes)) {
      const name = rawName.toLocaleLowerCase();
      const count = Number.isFinite(rawCount) ? Math.max(0, rawCount) : 0;

      if (!count) continue;

      const targets = muscleTargets.find((entry) =>
        entry.match.some((part) => name.includes(part))
      );

      for (const group of targets?.groups ?? []) {
        sets.set(group, (sets.get(group) ?? 0) + count);
      }
    }

    const max = Math.max(0, ...sets.values());

    return Object.fromEntries(
      [...sets].map(([group, count]) => [
        group,
        {
          score: max ? Math.max(12, Math.round((count / max) * 100)) : 0,
          sets: count,
        },
      ])
    ) as MuscleMapValues;
  }, [volumes]);

  const total = Object.entries(volumes).reduce(
    (sum, [name, amount]) =>
      sum +
      (name === "Uncategorized" ? 0 : Math.max(0, Number(amount) || 0)),
    0
  );

  return (
    <section className="rounded-2xl border border-line bg-sunken p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-ink">Muscle balance</h3>
          <p className="mt-1 text-xs text-ink-mute">
            Training volume mapped to the muscles worked · selected range
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-ink-mute">{total} tagged sets</span>

          <div
            className="flex shrink-0 rounded-lg border border-line bg-field p-1"
            aria-label="Anatomy model"
          >
            {(["MALE", "FEMALE"] as Model[]).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={model === option}
                onClick={() => setModel(option)}
                className={`rounded-md px-2.5 py-2 text-[11px] font-medium transition ${
                  model === option
                    ? "bg-butter text-butter-ink"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                {option === "MALE" ? "Male" : "Female"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {total ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-line bg-field">
          <div className="overflow-x-auto overscroll-x-contain">
            <div className="w-full min-w-[340px] px-3 py-4 sm:min-w-0 sm:px-4">
              <MuscleMap
                values={values}
                sex={model}
                view="BOTH"
                colorModel="FREQUENCY"
                monochromeColor="#22c55e"
                monochromeBaseColor="#3a3e39"
                figureWidth={210}
                glow
                showLegend={false}
                tooltipFields={["group", "sets"]}
                labels={labels}
                className="w-full"
              />
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 px-3 pb-3 text-center text-xs text-ink-mute">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full bg-green-500"
              aria-hidden="true"
            />
            <span>Green intensity reflects sets logged in this range</span>
          </div>

          <p className="pb-3 text-center text-[10px] text-ink-mute sm:hidden">
            Swipe horizontally to view the full muscle map
          </p>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-line px-5 py-8 text-center">
          <p className="font-medium text-ink">Your muscle map is ready</p>
          <p className="mt-1 text-sm text-ink-mute">
            Log exercises with muscle tags to light up your training map.
          </p>
        </div>
      )}
    </section>
  );
}
