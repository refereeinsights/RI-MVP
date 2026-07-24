import type { CanonicalPlannerPageType } from "./plannerSession";

export function canonicalPlannerPageTypeFromPath(pathname: string | null | undefined): CanonicalPlannerPageType {
  const path = String(pathname ?? "").trim().toLowerCase();
  if (!path) return "other";
  if (path.startsWith("/tournaments/")) return "tournament";
  if (path.startsWith("/weekend/")) return "planner_entry";
  if (path.startsWith("/weekend-planner")) return "planner";
  if (
    path.startsWith("/login") ||
    path.startsWith("/signup") ||
    path.startsWith("/verify-email") ||
    path.startsWith("/auth/confirm")
  ) {
    return "auth";
  }
  return "other";
}
