import type { User } from "@supabase/supabase-js";

export type TiProfile = {
  plan?: string | null;
  subscription_status?: string | null;
} | null;

export type TiTier = "explorer" | "insider" | "weekend_pro";

function overrideWeekendPro() {
  return (
    process.env.TI_PREMIUM_DEMO === "1" ||
    process.env.TI_FORCE_PAID_TOURNAMENT_DETAILS === "true"
  );
}

function normalizedPlan(plan?: string | null) {
  const value = (plan ?? "").trim().toLowerCase();
  if (!value || value === "free") return "insider";
  return value;
}

export function getTier(user: User | null | undefined, profile: TiProfile): TiTier {
  if (overrideWeekendPro()) return "weekend_pro";
  if (!user) return "explorer";
  if (!user.email_confirmed_at) return "explorer";
  if (
    normalizedPlan(profile?.plan) === "weekend_pro" &&
    (profile?.subscription_status ?? "").trim().toLowerCase() === "active"
  ) {
    return "weekend_pro";
  }
  return "insider";
}

export function canAccessWeekendPro(user: User | null | undefined, profile: TiProfile) {
  return getTier(user, profile) === "weekend_pro";
}
