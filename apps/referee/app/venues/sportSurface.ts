import { getSportCardClass as getSharedSportCardClass } from "@/lib/ui/sportBackground";

export function getSportCardClass(sport: string | null) {
  return getSharedSportCardClass(sport);
}

export function getSummarySportClass(sport: string) {
  return `summary-sport-${sport.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

export function getVenueCardClassFromSports(sports: string[]) {
  const priority = ["lacrosse", "soccer", "basketball", "baseball", "softball", "football", "hockey", "volleyball"];
  const chosen = priority.find((sport) => sports.includes(sport)) ?? sports[0] ?? null;
  return getSportCardClass(chosen);
}
