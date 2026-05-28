type BuildPlanningMapUrlArgs = {
  tournamentSlug: string;
  venueId?: string | null;
  source?: string | null;
};

export function buildPlanningMapUrl({ tournamentSlug, venueId, source }: BuildPlanningMapUrlArgs): string {
  const slug = String(tournamentSlug ?? "").trim();
  if (!slug) return "/tournaments";

  const params = new URLSearchParams();
  const venueIdClean = String(venueId ?? "").trim();
  const sourceClean = String(source ?? "").trim();
  if (venueIdClean) params.set("venue", venueIdClean);
  if (sourceClean) params.set("source", sourceClean);

  const qs = params.toString();
  return `/tournaments/${encodeURIComponent(slug)}/map${qs ? `?${qs}` : ""}`;
}

