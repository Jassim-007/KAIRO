import imageIndex from "./data/image-index.json";

type ImageEntry = {
  name: string;
  image?: string | null;
};

const images = imageIndex as ImageEntry[];

function normalizeName(name: string) {
  return name
    .toLocaleLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

const imageByName = new Map<string, string>();

for (const exercise of images) {
  if (exercise.image) {
    imageByName.set(normalizeName(exercise.name), exercise.image);
  }
}

const aliases: Record<string, string[]> = {
  latpulldown: [
    "Full Range-Of-Motion Lat Pulldown",
    "Close-Grip Front Lat Pulldown",
    "Wide-Grip Lat Pulldown",
  ],
  seatedcablerow: ["Seated Cable Rows"],
  dumbbellrow: [
    "Bent Over Two-Dumbbell Row",
    "Bent Over Two-Dumbbell Row With Palms In",
  ],
  pushup: ["Push-Up", "Push-Up Wide"],
  dumbbellcurl: ["Dumbbell Bicep Curl"],
  barbellbenchpress: ["Barbell Bench Press - Medium Grip"],
};

function toImageUrl(path: string) {
  const safePath = path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  return `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${safePath}`;
}

export function imageForExercise(name: string): string | null {
  const normalized = normalizeName(name);

  // 1. Exact normalized match
  const exact = imageByName.get(normalized);
  if (exact) return toImageUrl(exact);

  // 2. Match known naming variations
  for (const alias of aliases[normalized] ?? []) {
    const image = imageByName.get(normalizeName(alias));
    if (image) return toImageUrl(image);
  }

  return null;
}