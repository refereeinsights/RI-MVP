import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getTier } from "@/lib/entitlements";
import { extractProfileFromMetadata } from "@/lib/tiProfile";
import { TI_SPORTS, TI_SPORT_LABELS } from "@/lib/tiSports";
import { syncTiUserProfileFromAuthUser } from "@/lib/tiUserProfileServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import PremiumInterestForm from "@/components/PremiumInterestForm";
import SavedTournamentsSection, { type SavedTournamentItem } from "./SavedTournamentsSection";
import styles from "./AccountPage.module.css";

type TiUserRow = {
  id: string;
  created_at: string;
  plan: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  first_seen_at: string | null;
  display_name: string | null;
  username: string | null;
  reviewer_handle: string | null;
  zip_code: string | null;
  sports_interests: string[];
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

function prettySubscription(status: string | null | undefined, tier: "explorer" | "insider" | "weekend_pro") {
  if (tier === "insider") return "Free";
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

function buildAccountPath(kind: "notice" | "error", message: string) {
  const params = new URLSearchParams();
  params.set(kind, message);
  return `/account?${params.toString()}`;
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams?: { notice?: string; error?: string };
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!user.email_confirmed_at) redirect("/verify-email");

  const syncResult = await syncTiUserProfileFromAuthUser(user);

  const { data: profile } = await supabase
    .from("ti_users" as any)
    .select("id,created_at,plan,subscription_status,current_period_end,trial_ends_at,first_seen_at,display_name,username,reviewer_handle,zip_code,sports_interests")
    .eq("id", user.id)
    .maybeSingle<TiUserRow>();
  const metadataProfile = extractProfileFromMetadata(
    ((user.user_metadata ?? {}) as Record<string, unknown>)
  );
  const profileSettings = {
    displayName: profile?.display_name ?? metadataProfile.displayName ?? "",
    username:
      profile?.username ??
      profile?.reviewer_handle ??
      metadataProfile.username ??
      "",
    zipCode: profile?.zip_code ?? metadataProfile.zipCode ?? "",
    sportsInterests:
      profile?.sports_interests?.length
        ? profile.sports_interests
        : metadataProfile.sportsInterests,
  };

  const tier = getTier(user, profile ?? null);
  const effectivePlan = profile ? prettyPlan(profile.plan) : "Insider";

  const accountEmail = (user.email ?? "").trim().toLowerCase();
  const { data: emailSuppression } = accountEmail
    ? await (supabaseAdmin.from("email_suppressions" as any) as any)
        .select("suppress_marketing,suppress_all")
        .eq("email", accountEmail)
        .maybeSingle()
    : { data: null as any };
  const suppressMarketingDefault = Boolean((emailSuppression as any)?.suppress_marketing);
  const suppressAllDefault = Boolean((emailSuppression as any)?.suppress_all);

  const { data: savedRowsRaw } = await supabase
    .from("ti_saved_tournaments" as any)
    .select("tournament_id,notify_on_changes,tournaments(id,slug,name,start_date,end_date,city,state)")
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
        notify_on_changes: Boolean((row as any).notify_on_changes),
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
        {syncResult.warning || syncResult.error ? (
          <p className={styles.mutedText} style={{ color: syncResult.error ? "#b91c1c" : "#92400e", marginTop: 8 }}>
            {syncResult.error ?? syncResult.warning}
          </p>
        ) : null}
        <div className={styles.headerMeta}>
          <div>
            <strong>Email:</strong> {user.email ?? "—"}
          </div>
          <div><strong>Plan:</strong> {effectivePlan}</div>
          <div><strong>Subscription:</strong> {prettySubscription(profile?.subscription_status, tier)}</div>
          <div><strong>Member since:</strong> {prettyDate(profile?.first_seen_at ?? profile?.created_at ?? user.created_at)}</div>
          <div>
            <strong>{profile?.trial_ends_at ? "Trial ends:" : "Renewal date:"}</strong>{" "}
            {prettyDate(profile?.trial_ends_at ?? profile?.current_period_end)}
          </div>
        </div>
      </header>

      {searchParams?.notice ? (
        <p className={styles.noticeBanner}>{searchParams.notice}</p>
      ) : null}
      {searchParams?.error ? (
        <p className={styles.errorBanner}>{searchParams.error}</p>
      ) : null}

      <section className={styles.sectionCard}>
        <div>
          <h2 className={styles.sectionTitle}>Profile settings</h2>
          <p className={styles.mutedText}>Update the details used for your TI profile and recommendations.</p>
        </div>

        <form action="/api/account/change-email" method="post" className={styles.profileForm}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Sign-in email</span>
            <span className={styles.fieldHelp}>
              We’ll send a confirmation link to the new email address. You’ll keep using your current email until it’s confirmed.
            </span>
            <input
              className={styles.textInput}
              type="email"
              name="new_email"
              defaultValue=""
              placeholder={user.email ?? "you@example.com"}
              autoComplete="email"
              required
            />
          </label>
          <div className={styles.formActions}>
            <button type="submit" className={styles.secondaryAction}>Change email</button>
          </div>
        </form>

        <form action="/api/account/profile" method="post" className={styles.profileForm}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Full name</span>
            <span className={styles.fieldHelp}>Optional.</span>
            <input
              className={styles.textInput}
              type="text"
              name="name"
              defaultValue={profileSettings.displayName}
              placeholder="Your name"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Username</span>
            <span className={styles.fieldHelp}>This appears on your profile and submissions.</span>
            <input
              className={styles.textInput}
              type="text"
              name="username"
              defaultValue={profileSettings.username}
              placeholder="Choose a username"
              required
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>ZIP code</span>
            <span className={styles.fieldHelp}>Used for nearby tournaments and travel planning.</span>
            <input
              className={styles.textInput}
              type="text"
              name="zip"
              defaultValue={profileSettings.zipCode}
              placeholder="99216"
              inputMode="numeric"
              required
            />
          </label>
          <fieldset className={styles.checkboxFieldset}>
            <legend className={styles.fieldLabel}>Sports interests</legend>
            <p className={styles.fieldHelp}>Pick one or more — we&apos;ll personalize tournaments and alerts.</p>
            <div className={styles.checkboxGrid}>
              {TI_SPORTS.map((sport) => (
                <label key={sport} className={styles.checkboxOption}>
                  <input
                    type="checkbox"
                    name="sports_interests"
                    value={sport}
                    defaultChecked={profileSettings.sportsInterests.includes(sport)}
                  />
                  <span>{TI_SPORT_LABELS[sport]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className={styles.formActions}>
            <button type="submit" className={styles.primaryAction}>Save settings</button>
          </div>
        </form>
      </section>

      <SavedTournamentsSection initialItems={savedTournaments} />

      <section className={styles.sectionCard}>
        <div>
          <h2 className={styles.sectionTitle}>Email preferences</h2>
          <p className={styles.mutedText}>
            Control what emails we send you. Alerts and saved-tournament change notifications are treated as
            transactional emails.
          </p>
        </div>

        <form action="/api/account/email-preferences" method="post" className={styles.profileForm}>
          <label className={styles.checkboxOption} style={{ alignItems: "flex-start" }}>
            <input type="checkbox" name="suppress_marketing" defaultChecked={suppressMarketingDefault && !suppressAllDefault} />
            <span>
              <strong>Opt out of marketing</strong>
              <div className={styles.fieldHelp}>Admin blasts, promos, and non-essential updates.</div>
            </span>
          </label>

          <label className={styles.checkboxOption} style={{ alignItems: "flex-start" }}>
            <input type="checkbox" name="suppress_all" defaultChecked={suppressAllDefault} />
            <span>
              <strong>Pause all emails</strong>
              <div className={styles.fieldHelp}>
                Includes alerts and saved-tournament change notifications. (You may still need email for account access like password resets.)
              </div>
            </span>
          </label>

          <div className={styles.formActions}>
            <button type="submit" className={styles.primaryAction}>Save email preferences</button>
          </div>
        </form>
      </section>

      <section className={styles.sectionCard}>
        <h2 className={styles.sectionTitle}>Scheduled alerts</h2>
        <p className={styles.mutedText}>
          Get a quick email with tournaments near you. Alerts are designed for planning: they start looking{" "}
          <strong>21+</strong> days out.
        </p>
        <div className={styles.formActions}>
          <Link href="/account/alerts" className={styles.primaryAction}>
            Manage alerts
          </Link>
        </div>
      </section>

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
