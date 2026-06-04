import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TournamentInsights",
    short_name: "TI Planner",
    description: "Your tournament weekend in one place.",
    start_url: "/weekend-planner",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0F5034",
    theme_color: "#0F5034",
    icons: [
      {
        src: "/icons/icon-192",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-192",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/apple-touch-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
