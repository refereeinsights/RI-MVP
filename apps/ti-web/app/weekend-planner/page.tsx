import Link from "next/link";
import "../tournaments/tournaments.css";
import PlannerClient from "../_components/planner/PlannerClient";
import WeekendPlannerClient from "./WeekendPlannerClient";
import PlannerGuestSharePanel from "./PlannerGuestSharePanel";
import PlannerCalendarFeedPanel from "./PlannerCalendarFeedPanel";
import WeekendPlannerEntryCtas from "./WeekendPlannerEntryCtas";
import styles from "./WeekendPlanner.module.css";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTiTierServer } from "@/lib/entitlementsServer";
import { getSavedTournamentIdsForUser } from "@/lib/savedTournaments";
import SavedTournamentActionsClient from "./SavedTournamentActionsClient";
import { getActivePlansForUser } from "@/lib/weekendPlans";
import WeekendPlanActionsClient from "./WeekendPlanActionsClient";
import type { PlannerEventRow } from "@/lib/planner/types";
import { enrichPlannerEventsWithLinkedVenue } from "@/lib/planner/enrichVenueMetadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SavedTournamentRow = {
  id: string;
  slug: string | null;
  name: string | null;
  sport: string | null;
  city: string | null;
  state: string | null;
  start_date: string | null;
  end_date: string | null;
};

type WeekendPlanRow = {
  id: string;
  tournament_id: string;
  selected_venue_id: string | null;
  notes: string | null;
  lodging_name: string | null;
  lodging_address: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  lodging_notes: string | null;
  created_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDateRange(start: string | null, end: string | null) {
  const s = formatDate(start);
  const e = formatDate(end);
  if (s && e && s !== e) return `${s} - ${e}`;
  return s || e || "Dates TBA";
}

export async function generateMetadata() {
  return {
    title: "Weekend Planner Beta",
    description:
      "Save tournaments, plan travel, and organize venue logistics for your sports weekend with TournamentInsights.",
    alternates: { canonical: "/weekend-planner" },
    robots: { index: false, follow: true },
  };
}

export default async function WeekendPlannerPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthed = Boolean(user);
  const tierInfo = await getTiTierServer(user ?? null);
  const isUnverified = Boolean(isAuthed && tierInfo.unverified);
  const canUseSavedPlanning = tierInfo.tier === "insider" || tierInfo.tier === "weekend_pro";
  const plannerEntitlement = tierInfo.tier;

  let plannerEvents: PlannerEventRow[] = [];
  if (user) {
    const { data, error } = await (supabase.from("planner_events" as any) as any)
      .select(
        "id,user_id,weekend_id,title,event_type,team_name,opponent_name,tournament_id,venue_id,field_label,address_text,city,state,starts_at,ends_at,timezone,notes,child_profile_id,team_profile_id,source_type,source_id,source_event_uid,created_at,updated_at"
      )
      .eq("user_id", user.id)
      .order("starts_at", { ascending: true })
      .limit(250);

    plannerEvents = error
      ? []
      : await enrichPlannerEventsWithLinkedVenue(supabase, ((data ?? []) as PlannerEventRow[]) as any);
  }

  let activePlans: WeekendPlanRow[] = [];
  let plansLoadFailed = false;
  let planTournaments: SavedTournamentRow[] = [];
  let planTournamentsLoadFailed = false;

  let savedTournaments: SavedTournamentRow[] = [];
  let savedLoadFailed = false;

  if (user?.id && canUseSavedPlanning) {
    // Active weekend plans.
    try {
      const res = await getActivePlansForUser({ userId: user.id, limit: 25 });
      if (!res.ok) {
        plansLoadFailed = true;
      } else {
        activePlans = (res.plans ?? []).map((p) => ({
          id: p.id,
          tournament_id: String(p.tournament_id),
          selected_venue_id: (p.selected_venue_id as any) ?? null,
          notes: (p.notes as any) ?? null,
          lodging_name: (p.lodging_name as any) ?? null,
          lodging_address: (p.lodging_address as any) ?? null,
          check_in_date: (p.check_in_date as any) ?? null,
          check_out_date: (p.check_out_date as any) ?? null,
          lodging_notes: (p.lodging_notes as any) ?? null,
          created_at: (p.created_at as any) ?? null,
        })) as WeekendPlanRow[];
      }
    } catch {
      plansLoadFailed = true;
    }

    // Plan tournament details: `tournaments_public` is service-role only in this codebase.
    if (!plansLoadFailed && activePlans.length > 0) {
      try {
        const tournamentIds = Array.from(
          new Set(activePlans.map((p) => String(p.tournament_id ?? "").trim()).filter(Boolean))
        ).slice(0, 25);

        if (tournamentIds.length > 0) {
          const { data, error } = await supabaseAdmin
            .from("tournaments_public" as any)
            .select("id,slug,name,sport,city,state,start_date,end_date")
            .in("id", tournamentIds)
            .limit(25);

          if (error) {
            planTournamentsLoadFailed = true;
          } else {
            planTournaments = ((data as SavedTournamentRow[] | null) ?? []).slice();
          }
        }
      } catch {
        planTournamentsLoadFailed = true;
      }
    }

    try {
      const ids = (await getSavedTournamentIdsForUser(user.id)).slice(0, 25);
      if (ids.length) {
        const { data, error } = await supabaseAdmin
          .from("tournaments_public" as any)
          .select("id,slug,name,sport,city,state,start_date,end_date")
          .in("id", ids)
          .limit(25);

        if (error) {
          savedLoadFailed = true;
        } else {
          const rows = (data as SavedTournamentRow[] | null) ?? [];
          savedTournaments = rows
            .slice()
            .sort((a, b) => {
              const aDate = a.start_date ?? "9999-12-31";
              const bDate = b.start_date ?? "9999-12-31";
              if (aDate !== bDate) return aDate.localeCompare(bDate);
              return (a.name ?? "").localeCompare(b.name ?? "");
            });
        }
      }
    } catch {
      savedLoadFailed = true;
    }
  }

  const tournamentById = new Map(planTournaments.map((t) => [t.id, t]));
  const plansForRender = activePlans
    .slice()
    .sort((a, b) => {
      const ta = tournamentById.get(a.tournament_id);
      const tb = tournamentById.get(b.tournament_id);
      const aDate = ta?.start_date ?? "9999-12-31";
      const bDate = tb?.start_date ?? "9999-12-31";
      if (aDate !== bDate) return aDate.localeCompare(bDate);
      return (ta?.name ?? "").localeCompare(tb?.name ?? "");
    })
    .slice(0, 25);

  const plannerCalendarFeedPanel = user ? await PlannerCalendarFeedPanel() : null;
  const plannerGuestSharePanel = user ? await PlannerGuestSharePanel() : null;

	  return (
	    <div className={`pitchWrap tournamentsWrap ${styles.standaloneShell}`} data-weekend-planner-root="true">
	      <section className="field tournamentsField">
	        <div className="headerBlock">
	          <h1 className="title">Weekend Planner Beta</h1>
	          <p className="subtitle">Plan the weekend. Manage the season.</p>
            {!isAuthed ? (
              <p className={`subtitle ${styles.betaIntro}`}>
                You’re invited to test an early version of Weekend Planner. Add games, practices, tournaments,
                travel notes, and team calendar feeds in one place. Then check Upcoming, This Weekend, and Season
                views to see what is coming next.
              </p>
            ) : null}
	          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
	            {isAuthed ? (
	              <div style={{ width: "min(980px, 100%)", marginLeft: "auto", marginRight: "auto", display: "grid", gap: 12 }}>
                  <PlannerClient initialEvents={plannerEvents} plannerEntitlement={plannerEntitlement} isUnverified={isUnverified} hideHeader />
                  {plannerCalendarFeedPanel}
                  {plannerGuestSharePanel}
	              </div>
	            ) : (
	              <article className={styles.panelCard}>
	                <div className={styles.panelHeader}>
	                  <h2 className={styles.panelTitle}>Start by building your sports schedule</h2>
	                  <p className={styles.panelSub}>
	                    Add a game, practice, tournament, or travel note. Connect a team calendar feed when you have an
                      ICS / iCal link.
	                  </p>
	                </div>
	                <div className={styles.cardBody} style={{ display: "grid", gap: 10 }}>
                    <WeekendPlannerEntryCtas />
	                </div>
	              </article>
	            )}
	          </div>
	        </div>

          {!isAuthed ? (
            <div className={styles.onboardingStack}>
              <section className={styles.infoCard} aria-label="What to test first">
                <h2 className={styles.infoTitle}>What to test first</h2>
                <p className={styles.infoIntro}>Start with one or two simple actions, then reply to the beta email with feedback.</p>
                <div className={styles.checklistGrid}>
                  <article className={styles.checklistItem}>
                    <h3 className={styles.checklistTitle}>Add one manual event</h3>
                    <p className={styles.checklistCopy}>Create a game, practice, tournament, hotel note, or travel reminder.</p>
                  </article>
                  <article className={styles.checklistItem}>
                    <h3 className={styles.checklistTitle}>Connect a team calendar</h3>
                    <p className={styles.checklistCopy}>
                      Paste an ICS / iCal feed from TeamSnap, SportsEngine, GameChanger, Sports Connect, or another
                      calendar source.
                    </p>
                  </article>
                  <article className={styles.checklistItem}>
                    <h3 className={styles.checklistTitle}>Check your weekend</h3>
                    <p className={styles.checklistCopy}>
                      Use Upcoming, This Weekend, and Season views to see whether your schedule feels easier to manage.
                    </p>
                  </article>
                  <article className={styles.checklistItem}>
                    <h3 className={styles.checklistTitle}>Send feedback</h3>
                    <p className={styles.checklistCopy}>
                      Reply with what worked, what confused you, and what you expected but could not do.
                    </p>
                  </article>
                </div>
              </section>

              <section className={styles.supportNote} aria-label="Beta access">
                <p className={styles.supportNoteCopy}>
                  Beta access: Explorer accounts can preview Weekend Planner. Insider accounts can add events and
                  connect calendars. Weekend Pro includes planner sharing and private family calendar subscription.
                </p>
              </section>

              <section className={styles.upgradeCard} aria-label="Weekend Pro secondary path">
                <p className={styles.upgradeCopy}>
                  Want to share your planner or subscribe to a private family calendar? Weekend Pro unlocks planner
                  sharing and private calendar subscription.
                </p>
                <div>
                  <Link href="/premium" className={styles.upgradeLink}>
                    View Weekend Pro
                  </Link>
                </div>
              </section>
            </div>
          ) : null}

          <WeekendPlannerClient
            mode="planner_beta"
            initialAuthState={isAuthed ? (isUnverified ? "unverified" : "verified") : "signed_out"}
            initialEntitlement={plannerEntitlement}
          />

	        <div className={styles.disclosure}>
	          <AffiliateDisclosure />
	        </div>
	      </section>
	    </div>
	  );
	}
