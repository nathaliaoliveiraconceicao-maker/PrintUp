import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pasta de build configurável: o teste E2E usa uma própria (.next-e2e) para não tocar no build do desenvolvedor.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  /* config options here */
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
