import type { User } from "@supabase/supabase-js";

export type TiProfile = {
  plan?: string | null;
  subscription_status?: string | null;
  current_period_end?: string | null;
  trial_ends_at?: string | null;
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
  if (value === "explorer") return "explorer";
  if (!value || value === "free") return "insider";
  return value;
}

function isFutureTimestamp(value?: string | null) {
  if (!value) return false;
  const ts = new Date(value).getTime();
  if (Number.isNaN(ts)) return false;
  return ts > Date.now();
}

export function getTier(user: User | null | undefined, profile: TiProfile): TiTier {
  if (overrideWeekendPro()) return "weekend_pro";
  if (!user) return "explorer";
  if (!user.email_confirmed_at) return "explorer";
  const plan = normalizedPlan(profile?.plan);
  const status = (profile?.subscription_status ?? "").trim().toLowerCase();

  if (plan === "explorer") return "explorer";
  if (plan === "weekend_pro") {
    const hasPaidAccess =
      status === "active" && (!profile?.current_period_end || isFutureTimestamp(profile.current_period_end));
    const hasTrialAccess =
      (status === "trialing" || status === "active" || !status) && isFutureTimestamp(profile?.trial_ends_at);

    if (hasPaidAccess || hasTrialAccess) {
      return "weekend_pro";
    }
  }
  return "insider";
}

export function canAccessWeekendPro(user: User | null | undefined, profile: TiProfile) {
  return getTier(user, profile) === "weekend_pro";
}
