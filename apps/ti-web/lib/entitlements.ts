export type TiUserProfile = {
  plan?: string;
  subscription_status?: string;
};

export function canAccessPremium(profile: TiUserProfile | null | undefined) {
  if (!profile) return false;
  return profile.plan !== "free" && profile.subscription_status === "active";
}
