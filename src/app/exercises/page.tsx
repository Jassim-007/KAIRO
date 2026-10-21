"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import sourceCatalog from "./data/exercises.json";
import { imageForExercise } from "./catalog";

type Exercise = {
  id?: string;
  name: string;
  muscle: string;
  equipment: string;
  level: string;
  type: string;
  cue: string;
  instructions?: string[];
  image?: string | null;
  source?: string;
  license?: string;
};

type SourceExercise = {
  id: string;
  name: string;
  equipment?: string | null;
  level?: string | null;
  mechanic?: string | null;
  primaryMuscles?: string[];
  instructions?: string[];
  category?: string | null;
};

const exerciseDataset = sourceCatalog as SourceExercise[];

const starterCatalog: Exercise[] = [
  {
    name: "Barbell Bench Press",
    muscle: "Chest",
    equipment: "Barbell",
    level: "Intermediate",
    type: "Compound",
    cue: "Set your shoulder blades, keep feet grounded, and lower with control.",
  },
  {
    name: "Push-up",
    muscle: "Chest",
    equipment: "Bodyweight",
    level: "Beginner",
    type: "Compound",
    cue: "Keep a long line from shoulders to hips; elevate your hands to scale.",
  },
  {
    name: "Dumbbell Shoulder Press",
    muscle: "Shoulders",
    equipment: "Dumbbell",
    level: "Intermediate",
    type: "Compound",
    cue: "Brace gently and press without forcing a painful range.",
  },
  {
    name: "Lat Pulldown",
    muscle: "Back",
    equipment: "Cable",
    level: "Beginner",
    type: "Compound",
    cue: "Drive elbows down and pause briefly without swinging.",
  },
  {
    name: "Seated Cable Row",
    muscle: "Back",
    equipment: "Cable",
    level: "Beginner",
    type: "Compound",
    cue: "Sit tall and draw elbows back while keeping the torso quiet.",
  },
  {
    name: "Dumbbell Row",
    muscle: "Back",
    equipment: "Dumbbell",
    level: "Beginner",
    type: "Compound",
    cue: "Support your free hand and pull toward your hip.",
  },
  {
    name: "Goblet Squat",
    muscle: "Quads",
    equipment: "Dumbbell",
    level: "Beginner",
    type: "Compound",
    cue: "Hold the load close and use a comfortable depth with steady feet.",
  },
  {
    name: "Romanian Deadlift",
    muscle: "Hamstrings",
    equipment: "Barbell",
    level: "Intermediate",
    type: "Compound",
    cue: "Hinge at the hips, keep the weight close, and stop before your back rounds.",
  },
  {
    name: "Glute Bridge",
    muscle: "Glutes",
    equipment: "Bodyweight",
    level: "Beginner",
    type: "Compound",
    cue: "Press through the feet and finish with ribs relaxed.",
  },
  {
    name: "Dumbbell Curl",
    muscle: "Biceps",
    equipment: "Dumbbell",
    level: "Beginner",
    type: "Isolation",
    cue: "Keep elbows near your sides and lower slowly.",
  },
  {
    name: "Cable Triceps Pressdown",
    muscle: "Triceps",
    equipment: "Cable",
    level: "Beginner",
    type: "Isolation",
    cue: "Keep upper arms still and use a comfortable elbow range.",
  },
  {
    name: "Standing Calf Raise",
    muscle: "Calves",
    equipment: "Bodyweight",
    level: "Beginner",
    type: "Isolation",
    cue: "Pause briefly at the top and lower under control.",
  },
];

const datasetCatalog: Exercise[] = exerciseDataset.map((item) => ({
  id: item.id,
  name: item.name,
  muscle: (item.primaryMuscles?.[0] || "Full body").replace(
    /\b\w/g,
    (letter) => letter.toUpperCase()
  ),
  equipment:
    item.equipment === "body only"
      ? "Bodyweight"
      : (item.equipment || "Varies").replace(/\b\w/g, (letter) =>
          letter.toUpperCase()
        ),
  level: (item.level || "All levels").replace(/\b\w/g, (letter) =>
    letter.toUpperCase()
  ),
  type: (item.mechanic || item.category || "Strength").replace(
    /\b\w/g,
    (letter) => letter.toUpperCase()
  ),
  cue:
    item.instructions?.[0] ||
    "Choose a comfortable range and controlled pace.",
  instructions: item.instructions,
  image: imageForExercise(item.name),
  source: "Free Exercise DB",
  license: "Unlicense",
}));

const datasetNames = new Set(
  datasetCatalog.map((item) => item.name.toLowerCase())
);

// Assign image paths to starter exercises too.
const starterCatalogWithImages: Exercise[] = starterCatalog.map((item) => ({
  ...item,
  image: imageForExercise(item.name),
}));

const catalog: Exercise[] = [
  ...datasetCatalog,
  ...starterCatalogWithImages.filter(
    (item) => !datasetNames.has(item.name.toLowerCase())
  ),
];

export default function ExercisesPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [visibleCount, setVisibleCount] = useState(24);
  const [muscle, setMuscle] = useState("All muscles");
  const [gear, setGear] = useState("All equipment");

  const all = useMemo(() => catalog, []);

  const muscles = [
    "All muscles",
    ...new Set(
      all.map((item) => item.muscle).filter(Boolean).sort()
    ),
  ];

  const gearOptions = [
    "All equipment",
    ...new Set(
      all.map((item) => item.equipment).filter(Boolean).sort()
    ),
  ];

  const results = all.filter(
    (item) =>
      (muscle === "All muscles" || item.muscle === muscle) &&
      (gear === "All equipment" || item.equipment === gear) &&
      `${item.name} ${item.muscle} ${item.equipment} ${item.type}`
        .toLowerCase()
        .includes(q.toLowerCase())
  );

  return (
    <main className="min-h-screen text-ink">
      <header className="px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8">
        <p className="text-xs text-ink-mute">
          KAIRO ·YOUR MOMENT.YOUR MOMENTUM
        </p>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-7 sm:px-8 sm:py-10">
        <section>
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-periwinkle">
            Exercise library
          </p>
          <h1 className="mt-2 text-4xl font-bold">
            Find your next movement.
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            Explore and filter the built-in collection of{" "}
            {catalog.length.toLocaleString()} movements.
          </p>
        </section>

        <div className="grid gap-3 sm:grid-cols-[1fr_12rem_12rem]">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setVisibleCount(24);
            }}
            placeholder="Search exercises"
            aria-label="Search exercises"
            className="px-4 py-3"
          />

          <select
            value={muscle}
            onChange={(e) => {
              setMuscle(e.target.value);
              setVisibleCount(24);
            }}
            aria-label="Filter by muscle"
            className="px-3 py-3"
          >
            {muscles.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>

          <select
            value={gear}
            onChange={(e) => {
              setGear(e.target.value);
              setVisibleCount(24);
            }}
            aria-label="Filter by equipment"
            className="px-3 py-3"
          >
            {gearOptions.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>

        <p className="text-xs text-ink-mute">
          {results.length} movements in the built-in catalog
        </p>

        {results.length ? (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              {results.slice(0, visibleCount).map((item, index) => (
                <article
                  key={item.id || `${item.name}-${index}`}
                  className="overflow-hidden rounded-3xl border border-line card"
                >
                  <ExerciseCardImage
                    item={item}
                    priority={index === 0}
                  />

                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="font-semibold">{item.name}</h2>
                      <span className="rounded-full bg-periwinkle/10 px-2.5 py-1 text-[11px] text-periwinkle">
                        {item.level}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {[item.muscle, item.equipment, item.type].map(
                        (x) => (
                          <span
                            key={x}
                            className="rounded-full bg-sunken px-2.5 py-1 text-xs text-ink-soft"
                          >
                            {x}
                          </span>
                        )
                      )}
                    </div>

                    <p className="mt-4 line-clamp-3 text-sm leading-6 text-ink-soft">
                      {item.cue}
                    </p>

                    {item.instructions &&
                      item.instructions.length > 1 && (
                        <details className="mt-3 text-xs text-ink-soft">
                          <summary className="cursor-pointer text-periwinkle">
                            View all coaching steps
                          </summary>
                          <ol className="mt-2 list-inside list-decimal space-y-1">
                            {item.instructions.map((step, i) => (
                              <li key={i}>{step}</li>
                            ))}
                          </ol>
                        </details>
                      )}

                    <div className="mt-4">
                      <button
                        onClick={() => router.push("/plan")}
                        className="text-sm font-semibold text-periwinkle"
                      >
                        Add through Plan →
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {visibleCount < results.length && (
              <div className="flex flex-col items-center gap-2 py-4">
                <p className="text-xs text-ink-mute">
                  Showing {Math.min(visibleCount, results.length)} of{" "}
                  {results.length}
                </p>
                <button
                  onClick={() =>
                    setVisibleCount((count) => count + 24)
                  }
                  className="rounded-2xl border border-line-strong px-5 py-3 text-sm font-semibold hover:border-periwinkle/50"
                >
                  Load more exercises
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-3xl border border-line p-10 text-center text-sm text-ink-mute">
            No matches. Try another search or filter.
          </div>
        )}

        <p className="rounded-2xl border border-line p-3 text-xs text-ink-mute">
          Catalog: Free Exercise DB under the Unlicense; its license and
          attribution are included with the project. Exercise media is
          loaded from the source repository. Movement cues are general
          fitness information; choose a comfortable variation and stop if
          you feel sharp pain.
        </p>
      </div>
    </main>
  );
}

function ExerciseCardImage({
  item,
  priority = false,
}: {
  item: Exercise;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="relative h-44 overflow-hidden bg-sunken">
      {item.image && !failed ? (
        <Image
          unoptimized
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          src={item.image}
          alt={`${item.name} demonstration`}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full items-center justify-center bg-gradient-to-br from-lavender/60 via-transparent to-sunken">
          <span
            aria-hidden="true"
            className="text-5xl text-periwinkle/70"
          >
            ✳
          </span>
          <span className="sr-only">No illustration available</span>
        </div>
      )}
    </div>
  );
}