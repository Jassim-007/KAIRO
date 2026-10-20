import imageIndex from "./data/image-index.json";

type ImageEntry = { name: string; image?: string | null };
const images = imageIndex as ImageEntry[];
const imageByName = new Map(images.map((exercise) => [
  exercise.name.toLocaleLowerCase().replace(/[^a-z0-9]/g, ""),
  exercise.image,
]));

export function imageForExercise(name: string) {
  const key = name.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
  const image = imageByName.get(key);
  if (!image) return null;
  const path = image.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${path}`;
}
