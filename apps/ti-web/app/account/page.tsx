import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getTier } from "@/lib/entitlements";
import { extractProfileFromMetadata } from "@/lib/tiProfile";
import { TI_SPORTS, TI_SPORT_LABELS } from "@/lib/tiSports";
import { syncTiUserProfileFromAuthUser } from "@/lib/tiUserProfileServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripe } from "@/lib/stripe";
import PremiumInterestForm from "@/components/PremiumInterestForm";
import SavedTournamentsSection, { type SavedTournamentItem } from "./SavedTournamentsSection";
import QuickVenueCheckRewardClaim from "./QuickVenueCheckRewardClaim";
import ManageBillingButton from "./ManageBillingButton";
import UpgradeWeekendProButton from "@/components/UpgradeWeekendProButton";
import { WEEKEND_PRO_FOUNDING_PRICE_LINE } from "@/lib/weekendProPricing";
import styles from "./AccountPage.module.css";

type TiUserRow = {
  id: string;
  created_at: string;
  plan: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  stripe_customer_id?: string | null;
  first_seen_at: string | null;
  display_name: string | null;
  username: string | null;
  reviewer_handle: string | null;
  zip_code: string | null;
  sports_interests: string[];
  signup_source?: string | null;
  qvc_pending_quick_check_id?: string | null;
  qvc_pending_browser_hash?: string | null;
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

function normalizeSubscriptionStatus(status: string | null | undefined) {
  return (status ?? "").trim().toLowerCase();
}

function prettyDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function isoFromEpochSeconds(value: number | null | undefined) {
  if (!value || typeof value !== "number") return null;
  return new Date(value * 1000).toISOString();
}

function buildAccountPath(kind: "notice" | "error", message: string) {
  const params = new URLSearchParams();
  params.set(kind, message);
  return `/account?${params.toString()}`;
}

async function reconcileCheckoutSessionIfNeeded(params: {
  userId: string;
  sessionId: string;
}) {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(params.sessionId, {
    expand: ["subscription", "subscription.latest_invoice.payment_intent"],
  });

  if (session.mode !== "subscription") {
    throw new Error("Unsupported checkout session mode");
  }

  const clientRef = typeof session.client_reference_id === "string" ? session.client_reference_id.trim() : "";
  if (!clientRef || clientRef !== params.userId) {
    throw new Error("Checkout session does not match this account");
  }

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : typeof (session.customer as any)?.id === "string"
        ? String((session.customer as any).id)
        : null;

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : typeof (session.subscription as any)?.id === "string"
        ? String((session.subscription as any).id)
        : null;

  if (!subscriptionId) {
    throw new Error("Checkout session missing subscription");
  }

  const subscription =
    typeof session.subscription === "object" && session.subscription
      ? (session.subscription as any)
      : await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ["latest_invoice.payment_intent"],
        });

  const lastInvoiceId =
    typeof subscription.latest_invoice === "string"
      ? subscription.latest_invoice
      : typeof subscription.latest_invoice?.id === "string"
        ? String(subscription.latest_invoice.id)
        : null;

  const paymentIntentId =
    typeof subscription.latest_invoice?.payment_intent === "string"
      ? String(subscription.latest_invoice.payment_intent)
      : typeof subscription.latest_invoice?.payment_intent?.id === "string"
        ? String(subscription.latest_invoice.payment_intent.id)
        : null;

  const update: Record<string, unknown> = {
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    current_period_start: isoFromEpochSeconds(subscription.current_period_start),
    current_period_end: isoFromEpochSeconds(subscription.current_period_end),
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    last_invoice_id: lastInvoiceId,
    last_payment_intent_id: paymentIntentId,
    updated_at: new Date().toISOString(),
  };

  if (subscription.status === "active") {
    update.plan = "weekend_pro";
  }

  const { error } = await (supabaseAdmin.from("ti_users" as any) as any).update(update).eq("id", params.userId);
  if (error) throw error;
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams?: { notice?: string; error?: string; upgrade?: string; session_id?: string };
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!user.email_confirmed_at) redirect("/verify-email");

  if (searchParams?.upgrade === "success" && searchParams?.session_id) {
    try {
      await reconcileCheckoutSessionIfNeeded({ userId: user.id, sessionId: searchParams.session_id });
      redirect(buildAccountPath("notice", "Upgrade successful — welcome to Weekend Pro."));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to confirm upgrade right now.";
      redirect(buildAccountPath("error", message));
    }
  }

  const syncResult = await syncTiUserProfileFromAuthUser(user);

  const { data: profile } = await supabase
    .from("ti_users" as any)
    .select(
      "id,created_at,plan,subscription_status,current_period_end,trial_ends_at,stripe_customer_id,first_seen_at,display_name,username,reviewer_handle,zip_code,sports_interests,signup_source,qvc_pending_quick_check_id,qvc_pending_browser_hash"
    )
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
  const subscriptionStatus = normalizeSubscriptionStatus(profile?.subscription_status);
  const showTrialEnds = subscriptionStatus === "trialing" && Boolean(profile?.trial_ends_at);

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
      <QuickVenueCheckRewardClaim
        isWeekendPro={tier === "weekend_pro"}
        initialPending={
          profile?.qvc_pending_quick_check_id
            ? {
                quick_check_id: profile.qvc_pending_quick_check_id,
                browser_hash: profile?.qvc_pending_browser_hash ?? "",
              }
            : null
        }
      />
      {tier !== "weekend_pro" && profile?.qvc_pending_quick_check_id ? (
        <p className={styles.noticeBanner}>
          Weekend Pro reward pending — confirm your email to unlock it (or refresh if you already confirmed).
        </p>
      ) : null}
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
            <strong>{showTrialEnds ? "Trial ends:" : "Renews on:"}</strong>{" "}
            {prettyDate(showTrialEnds ? profile?.trial_ends_at : profile?.current_period_end)}
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
        <h2 className={styles.sectionTitle}>Billing</h2>
        <p className={styles.mutedText}>
          Manage your subscription, cancel, or update payment details securely through Stripe.
        </p>
        {profile?.stripe_customer_id ? (
          <div className={styles.formActions}>
            <ManageBillingButton />
          </div>
        ) : (
          <p className={styles.mutedText}>
            Billing portal will appear here after your first successful checkout.
          </p>
        )}
      </section>

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

      {tier !== "weekend_pro" ? (
        <section className={styles.sectionCard}>
          <h2 className={styles.sectionTitle}>Weekend Pro</h2>
          <p className={styles.mutedText}>
            Plan your tournament weekend without guesswork. Weekend Pro unlocks Owl&apos;s Eye™ venue intelligence: nearby hotels, rentals, coffee, food, and directions around where games are played.
          </p>
          <p className={styles.mutedText} style={{ fontWeight: 900 }}>
            {WEEKEND_PRO_FOUNDING_PRICE_LINE}
          </p>
          <div className={styles.formActions} style={{ gap: 10, flexWrap: "wrap" }}>
            <UpgradeWeekendProButton className={styles.primaryAction} source_page="account" source_context="account_upsell" />
            <Link href="/premium" className={styles.secondaryAction}>Learn more</Link>
          </div>
        </section>
      ) : null}

      <div className={styles.footerAction}>
        <Link href="/logout">Log out</Link>
      </div>
    </main>
  );
}
