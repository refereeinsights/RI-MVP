import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Corralio",
    short_name: "Corralio",
    description: "The planner built for sports families.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fffaf3",
    theme_color: "#111a2e",
  };
}
