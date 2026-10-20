import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FORM/AI Fitness Tracker",
    short_name: "FORM/AI",
    description: "Your personal fitness log and shared couple workouts.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#10110f",
    theme_color: "#bef264",
    icons: [
      {
        src: "/form-ai-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
