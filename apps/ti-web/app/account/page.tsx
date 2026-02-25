import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getTier } from "@/lib/entitlements";
import PremiumInterestForm from "@/components/PremiumInterestForm";
import SavedTournamentsSection, { type SavedTournamentItem } from "./SavedTournamentsSection";
import styles from "./AccountPage.module.css";

type TiUserRow = {
  id: string;
  created_at: string;
  plan: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  first_seen_at: string | null;
  display_name: string | null;
  reviewer_handle: string | null;
  zip_code: string | null;
};

type SavedTournamentJoinRow = {
  tournament_id: string;
  tournaments:
    | {
        id: string;
        slug: string | null;
        name: string | null;
        start_date: string | null;
        end_date: string | null;
        city: string | null;
        state: string | null;
      }
    | {
        id: string;
        slug: string | null;
        name: string | null;
        start_date: string | null;
        end_date: string | null;
        city: string | null;
        state: string | null;
      }[]
    | null;
};

function normalizePlan(plan: string | null | undefined) {
  const value = (plan ?? "").trim().toLowerCase();
  if (!value || value === "free") return "insider";
  return value;
}

function prettyPlan(plan: string | null | undefined) {
  return normalizePlan(plan) === "weekend_pro" ? "Weekend Pro" : "Insider";
}

function prettySubscription(status: string | null | undefined) {
  const value = (status ?? "").trim().toLowerCase();
  if (!value || value === "none") return "None";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function prettyDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

export default async function AccountPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!user.email_confirmed_at) redirect("/verify-email");

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const displayNameRaw = typeof metadata.display_name === "string" ? metadata.display_name.trim() : "";
  const reviewerHandleRaw = typeof metadata.handle === "string" ? metadata.handle.trim().toLowerCase() : "";
  const zipRaw = typeof metadata.zip_code === "string" ? metadata.zip_code.trim() : "";
  const displayName = displayNameRaw || null;
  const reviewerHandle = /^[a-z0-9_]{3,20}$/.test(reviewerHandleRaw) ? reviewerHandleRaw : null;
  const zipCode = /^\d{5}(-\d{4})?$/.test(zipRaw) ? zipRaw : null;

  const { data: profile } = await supabase
    .from("ti_users" as any)
    .select("id,created_at,plan,subscription_status,current_period_end,first_seen_at,display_name,reviewer_handle,zip_code")
    .eq("id", user.id)
    .maybeSingle<TiUserRow>();

  const nowIso = new Date().toISOString();
  if (profile?.id) {
    await (supabase
      .from("ti_users" as any) as any)
      .update({
        last_seen_at: nowIso,
        email: user.email ?? null,
        ...(displayName ? { display_name: displayName } : {}),
        ...(reviewerHandle ? { reviewer_handle: reviewerHandle } : {}),
        ...(zipCode ? { zip_code: zipCode } : {}),
        ...(profile.first_seen_at ? {} : { first_seen_at: nowIso }),
      })
      .eq("id", user.id);
  } else {
    await (supabase.from("ti_users" as any) as any).insert({
      id: user.id,
      email: user.email ?? null,
      first_seen_at: nowIso,
      last_seen_at: nowIso,
      plan: "insider",
      subscription_status: "none",
      display_name: displayName,
      reviewer_handle: reviewerHandle,
      zip_code: zipCode,
    });
  }

  const tier = getTier(user, profile ?? null);
  const effectivePlan = profile ? prettyPlan(profile.plan) : "Insider";
  const { data: savedRowsRaw } = await supabase
    .from("ti_saved_tournaments" as any)
    .select("tournament_id,tournaments(id,slug,name,start_date,end_date,city,state)")
    .eq("user_id", user.id);

  const savedRows = (savedRowsRaw ?? []) as SavedTournamentJoinRow[];
  const savedTournaments: SavedTournamentItem[] = savedRows
    .map((row) => {
      const raw = row.tournaments;
      const tournament = Array.isArray(raw) ? raw[0] : raw;
      if (!tournament?.id) return null;
      return {
        tournament_id: row.tournament_id,
        slug: tournament.slug ?? null,
        name: tournament.name ?? null,
        start_date: tournament.start_date ?? null,
        end_date: tournament.end_date ?? null,
        city: tournament.city ?? null,
        state: tournament.state ?? null,
      };
    })
    .filter((row): row is SavedTournamentItem => Boolean(row))
    .sort((a, b) => {
      const aDate = a.start_date ?? "9999-12-31";
      const bDate = b.start_date ?? "9999-12-31";
      if (aDate !== bDate) return aDate.localeCompare(bDate);
      return (a.name ?? "").localeCompare(b.name ?? "");
    });

  return (
    <main className={styles.accountPage}>
      <header className={styles.headerCard}>
        <div className={styles.headerTop}>
          <h1 className={styles.pageTitle}>Welcome back</h1>
          <span className={styles.planBadge}>{tier === "weekend_pro" ? "Weekend Pro" : "Insider"}</span>
        </div>
        <div className={styles.headerMeta}>
          <div><strong>Email:</strong> {user.email ?? "—"}</div>
          <div><strong>Plan:</strong> {effectivePlan}</div>
          <div><strong>Subscription status:</strong> {prettySubscription(profile?.subscription_status)}</div>
          <div><strong>Member since:</strong> {prettyDate(profile?.first_seen_at ?? profile?.created_at ?? user.created_at)}</div>
          <div><strong>Renewal date:</strong> {prettyDate(profile?.current_period_end)}</div>
        </div>
      </header>

      <SavedTournamentsSection initialItems={savedTournaments} />

      <section className={styles.sectionCard}>
        <h2 className={styles.sectionTitle}>Weekend Pro (Coming Soon)</h2>
        <p className={styles.mutedText}>
          Unlock venue logistics + full Owl&apos;s Eye lists (Weekend Pro coming soon).
        </p>
        <PremiumInterestForm initialEmail={user.email ?? ""} />
      </section>

      <div className={styles.footerAction}>
        <Link href="/logout">Log out</Link>
      </div>
    </main>
  );
}
