import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FORM/AI Fitness Tracker",
    short_name: "FORM/AI",
    description: "Your personal fitness log and shared couple workouts.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#faf7f0",
    theme_color: "#faf7f0",
    orientation: "portrait",
    shortcuts: [
      { name: "Log something", url: "/tracker" },
      { name: "Start workout", url: "/workout" },
    ],
    icons: [
      {
        src: "/form-ai-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/form-ai-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
