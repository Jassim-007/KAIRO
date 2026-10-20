
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "KAIRO — Fitness & Wellness",
    short_name: "KAIRO",
    description:
      "Your moment. Your momentum. Track workouts, nutrition, hydration, and progress.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#17182D",
    theme_color: "#17182D",
    orientation: "portrait",
    icons: [
      {
        src: "/kairo-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/kairo-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/kairo-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Log something", url: "/tracker" },
      { name: "Start workout", url: "/workout" },
    ],
  };
}
