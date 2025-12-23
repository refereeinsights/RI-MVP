import { supabaseAdmin } from "@/lib/supabaseAdmin";

type EligibleUser = {
  user_id: string;
  email: string;
  home_zip: string;
  radius_miles: number;
  last_sent_at: string | null;
  latitude: number;
  longitude: number;
};

type AlertPreferenceRow = {
  user_id: string;
  home_zip: string;
  radius_miles: number;
  frequency: string;
  enabled: boolean;
  last_sent_at: string | null;
};

type ProfileRow = {
  user_id: string;
  email: string | null;
  email_opt_in_tournaments: boolean | null;
  role: string | null;
};

type SubscriptionRow = {
  user_id: string;
  product: string | null;
  plan: string | null;
  status: string | null;
};

type ZipCentroidRow = {
  zip: string;
  latitude: number | null;
  longitude: number | null;
};

const ACTIVE_SUB_STATUSES = ["active", "trialing"];

export async function getEligibleUsers(): Promise<{
  eligible: EligibleUser[];
  skippedMissingZip: number;
  skippedNoOptIn: number;
  skippedNoSub: number;
}> {
  const { data: prefs, error: prefError } = await supabaseAdmin
    .from("alert_preferences" as any)
    .select("user_id, home_zip, radius_miles, frequency, enabled, last_sent_at")
    .eq("enabled", true)
    .eq("frequency", "weekly");

  if (prefError) throw prefError;
  const prefRows = (prefs ?? []) as AlertPreferenceRow[];
  if (!prefRows.length) {
    return { eligible: [], skippedMissingZip: 0, skippedNoOptIn: 0, skippedNoSub: 0 };
  }

  const userIds = Array.from(new Set(prefRows.map((p) => p.user_id)));
  const zips = Array.from(new Set(prefRows.map((p) => p.home_zip)));

  const [{ data: profileData }, { data: subData }, { data: zipData }] = await Promise.all([
    supabaseAdmin
      .from("profiles" as any)
      .select("user_id, email, email_opt_in_tournaments, role")
      .in("user_id", userIds),
    supabaseAdmin
      .from("subscriptions" as any)
      .select("user_id, product, plan, status")
      .in("user_id", userIds),
    supabaseAdmin.from("zip_centroids" as any).select("zip, latitude, longitude").in("zip", zips),
  ]);

  const profileMap = new Map(
    ((profileData ?? []) as ProfileRow[]).map((p) => [p.user_id, p])
  );
  const subsByUser = new Map<string, SubscriptionRow[]>();
  for (const sub of (subData ?? []) as SubscriptionRow[]) {
    const arr = subsByUser.get(sub.user_id) ?? [];
    arr.push(sub);
    subsByUser.set(sub.user_id, arr);
  }
  const zipMap = new Map(
    ((zipData ?? []) as ZipCentroidRow[])
      .filter((z) => z.latitude !== null && z.longitude !== null)
      .map((z) => [z.zip, z])
  );

  let skippedMissingZip = 0;
  let skippedNoOptIn = 0;
  let skippedNoSub = 0;
  const eligible: EligibleUser[] = [];

  for (const pref of prefRows) {
    const zip = zipMap.get(pref.home_zip);
    if (!zip) {
      skippedMissingZip += 1;
      continue;
    }

    const profile = profileMap.get(pref.user_id);
    if (!profile || profile.email_opt_in_tournaments !== true || !profile.email) {
      skippedNoOptIn += 1;
      continue;
    }

    const subs = subsByUser.get(pref.user_id) ?? [];
    const hasPlus = subs.some(
      (s) =>
        s.product === "ri" &&
        s.plan === "referee_plus" &&
        s.status &&
        ACTIVE_SUB_STATUSES.includes(s.status)
    );
    if (!hasPlus) {
      skippedNoSub += 1;
      continue;
    }

    eligible.push({
      user_id: pref.user_id,
      email: profile.email,
      home_zip: pref.home_zip,
      radius_miles: pref.radius_miles,
      last_sent_at: pref.last_sent_at,
      latitude: zip.latitude!,
      longitude: zip.longitude!,
    });
  }

  return { eligible, skippedMissingZip, skippedNoOptIn, skippedNoSub };
}
