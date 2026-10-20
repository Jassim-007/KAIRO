
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow your phone to access the development server on the same Wi-Fi.
  allowedDevOrigins: ["192.168.1.9"],

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
        pathname: "/yuhonas/free-exercise-db/main/exercises/**",
      },
    ],
  },

  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
