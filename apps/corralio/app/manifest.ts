import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Corralio",
    short_name: "Corralio",
    description: "The planner built for sports families.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6faf9",
    theme_color: "#16233a",
    icons: [
      { src: "/icons/corralio-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/corralio-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
