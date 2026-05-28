import Link from "next/link";
import "../tournaments/tournaments.css";
import PlannerClient from "../_components/planner/PlannerClient";
import WeekendPlannerClient from "./WeekendPlannerClient";
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
    title: "Weekend Planner | TournamentInsights",
    description:
      "Save tournaments, plan travel, and organize venue logistics for your sports weekend with TournamentInsights.",
    alternates: { canonical: "/weekend-planner" },
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
  const isPaid = tierInfo.tier === "weekend_pro";

  let plannerEvents: PlannerEventRow[] = [];
  if (user) {
    const { data, error } = await (supabase.from("planner_events" as any) as any)
      .select(
        "id,user_id,weekend_id,title,event_type,team_name,opponent_name,tournament_id,venue_id,field_label,address_text,city,state,starts_at,ends_at,timezone,notes,source_type,source_id,source_event_uid,created_at,updated_at"
      )
      .eq("user_id", user.id)
      .order("starts_at", { ascending: true })
      .limit(250);

    plannerEvents = (error ? [] : (data ?? [])) as PlannerEventRow[];
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

  return (
    <div className="pitchWrap tournamentsWrap">
      <section className="field tournamentsField">
        <div className="headerBlock">
          <h1 className="title">Weekend Planner</h1>
          <p className="subtitle">Plan the weekend. Manage the season.</p>
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {isAuthed ? (
              <div style={{ width: "min(980px, 100%)", marginLeft: "auto", marginRight: "auto" }}>
                <PlannerClient initialEvents={plannerEvents} isPaid={isPaid} />
              </div>
            ) : (
              <article className={styles.panelCard}>
                <div className={styles.panelHeader}>
                  <h2 className={styles.panelTitle}>Your whole weekend—and season—in one place</h2>
                  <p className={styles.panelSub}>
                    Save games, practices, venues, travel notes, and tournament logistics in one mobile-first planner.
                  </p>
                </div>
                <div className={styles.cardBody} style={{ display: "grid", gap: 10 }}>
                  <Link className={styles.ctaFull} href="/signup?returnTo=%2Fweekend-planner">
                    Create account
                  </Link>
                  <Link className="secondaryLink" href="/login?returnTo=%2Fweekend-planner">
                    Sign in
                  </Link>
                </div>
              </article>
            )}

            {isAuthed ? (
              <div style={{ paddingTop: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 950, color: "#0b1f14", marginBottom: 6 }}>Planning tools</div>
              </div>
            ) : null}
            <div className={styles.mainGrid} style={{ marginTop: 0 }}>
              <article className={styles.panelCard}>
                <div className={styles.panelHeader}>
                  <h2 className={styles.panelTitle}>Start with travel</h2>
                  <p className={styles.panelSub}>Search hotels and rentals by city, venue, or address.</p>
                </div>
                <div className={styles.cardBody}>
                  <Link className={styles.ctaFull} href="/book-travel">
                    Search travel
                  </Link>
                </div>
              </article>

              <article className={styles.panelCard}>
                <div className={styles.panelHeader}>
                  <h2 className={styles.panelTitle}>Find your tournament</h2>
                  <p className={styles.panelSub}>Open the tournament page, map, and weekend plan links.</p>
                </div>
                <div className={styles.cardBody}>
                  <Link className={styles.ctaFull} href="/tournaments">
                    Browse tournaments
                  </Link>
                </div>
              </article>

              <article className={styles.panelCard}>
                <div className={styles.panelHeader}>
                  <h2 className={styles.panelTitle}>Search venues</h2>
                  <p className={styles.panelSub}>Venue insights, maps, and planning context.</p>
                </div>
                <div className={styles.cardBody}>
                  <Link className={styles.ctaFull} href="/venues">
                    Search venues
                  </Link>
                </div>
              </article>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {!isAuthed ? (
                <article className={styles.panelCard}>
                  <div className={styles.panelHeader}>
                    <h2 className={styles.panelTitle}>Find hotels near a tournament venue</h2>
                    <p className={styles.panelSub}>Search by venue name, city, or address.</p>
                  </div>
                  <div className={styles.cardBody}>
                    <Link
                      className={styles.ctaFull}
                      href={`/go/hotels?${new URLSearchParams({ source: "weekend_planner" }).toString()}`}
                      target="_blank"
                      rel="noopener noreferrer sponsored"
                    >
                      Search hotels →
                    </Link>
                  </div>
                </article>
              ) : null}
              <div style={{ padding: "12px 12px", borderRadius: 14, border: "1px solid rgba(15, 61, 46, 0.12)", background: "rgba(255,255,255,0.96)" }}>
                <div style={{ fontSize: 12, fontWeight: 950, color: "#0b1f14" }}>Plan around a tournament</div>
                <div style={{ marginTop: 4, color: "rgba(16, 34, 19, 0.85)", fontWeight: 650, fontSize: 13, lineHeight: 1.45 }}>
                  Use tournament map pages to compare venues and logistics. Once you pick a tournament, the weekend plan page gives you a shareable “one link” starting point.
                </div>
                <div style={{ marginTop: 10 }}>
                  <Link className="secondaryLink" href="/tournaments">
                    Find a tournament to plan around →
                  </Link>
                </div>
              </div>

              <div style={{ padding: "12px 12px", borderRadius: 14, border: "1px solid rgba(15, 61, 46, 0.12)", background: "rgba(255,255,255,0.96)" }}>
                <div style={{ fontSize: 12, fontWeight: 950, color: "#0b1f14" }}>
                  {!isAuthed
                    ? "Explorer access"
                    : isUnverified
                      ? "Confirm your email"
                      : tierInfo.tier === "weekend_pro"
                        ? "Weekend Pro active"
                        : "Insider access"}
                </div>
                <div style={{ marginTop: 4, color: "rgba(16, 34, 19, 0.85)", fontWeight: 650, fontSize: 13, lineHeight: 1.45 }}>
                  {!isAuthed
                    ? "Explore Weekend Planner, search travel, browse tournaments, and open public weekend tools. Create an account to save tournaments."
                    : isUnverified
                      ? "Confirm your email to unlock Insider saved planning tools like saved tournaments."
                      : tierInfo.tier === "weekend_pro"
                        ? "You’re set up for advanced TournamentInsights weekend planning tools as they roll out."
                        : "Save tournaments, view saved tournaments, and keep weekend planning links in one place."}
                </div>
                <div style={{ marginTop: 10 }}>
                  {!isAuthed ? (
                    <Link className="secondaryLink" href="/signup?returnTo=%2Fweekend-planner">
                      Create account →
                    </Link>
                  ) : isUnverified ? (
                    <span className="secondaryLink" style={{ display: "inline-block" }}>
                      Check your inbox →
                    </span>
                  ) : tierInfo.tier === "weekend_pro" ? (
                    <Link className="secondaryLink" href="/premium">
                      Explore Weekend Pro →
                    </Link>
                  ) : (
                    <Link className="secondaryLink" href="/premium">
                      Explore Weekend Pro →
                    </Link>
                  )}
                </div>
              </div>

              {isAuthed ? (
                <>
                <div style={{ padding: "12px 12px", borderRadius: 14, border: "1px solid rgba(15, 61, 46, 0.12)", background: "rgba(255,255,255,0.96)" }}>
                  <div style={{ fontSize: 12, fontWeight: 950, color: "#0b1f14" }}>Weekend plans</div>
                  {isUnverified || !canUseSavedPlanning ? (
                    <div style={{ marginTop: 6, display: "grid", gap: 10 }}>
                      <div style={{ color: "rgba(16, 34, 19, 0.85)", fontWeight: 650, fontSize: 13, lineHeight: 1.45 }}>
                        Confirm your email to unlock Insider saved planning tools like weekend plans.
                      </div>
                      <div>
                        <span className="secondaryLink" style={{ display: "inline-block" }}>
                          Check your inbox →
                        </span>
                      </div>
                    </div>
                  ) : plansLoadFailed || planTournamentsLoadFailed ? (
                    <div style={{ marginTop: 6, color: "rgba(16, 34, 19, 0.85)", fontWeight: 650, fontSize: 13, lineHeight: 1.45 }}>
                      Weekend plans are unavailable right now.
                    </div>
                  ) : plansForRender.length === 0 ? (
                    <div style={{ marginTop: 6, display: "grid", gap: 10 }}>
                      <div style={{ color: "rgba(16, 34, 19, 0.85)", fontWeight: 650, fontSize: 13, lineHeight: 1.45 }}>
                        No weekend plans yet. Start a weekend plan from any tournament weekend page or venue map.
                      </div>
                      <div>
                        <Link className="secondaryLink" href="/tournaments">
                          Browse tournaments →
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 8, display: "grid", gap: 10 }}>
                      {plansForRender.map((plan) => {
                        const t = tournamentById.get(plan.tournament_id);
                        const slug = String(t?.slug ?? "").trim();
                        const hasSlug = Boolean(slug);
                        const title = String(t?.name ?? "Tournament").trim();
                        const loc = [t?.city, t?.state].filter(Boolean).join(", ");
                        const metaParts = [t?.sport, formatDateRange(t?.start_date ?? null, t?.end_date ?? null), loc].filter(Boolean);
                        const lodgingParts = [
                          String(plan.lodging_name ?? "").trim() || null,
                          String(plan.lodging_address ?? "").trim() || null,
                        ].filter(Boolean) as string[];
                        const lodgingDates = [formatDate(plan.check_in_date ?? null), formatDate(plan.check_out_date ?? null)].filter(Boolean);

                        if (!t || !hasSlug) {
                          const created = plan.created_at ? new Date(plan.created_at) : null;
                          const createdLabel = created && Number.isFinite(created.getTime()) ? created.toLocaleDateString() : null;
                          return (
                            <div
                              key={plan.id}
                              style={{ border: "1px solid rgba(15, 61, 46, 0.12)", borderRadius: 12, padding: "10px 10px", background: "#fff" }}
                            >
                              <div style={{ fontWeight: 950, color: "#0b1f14" }}>Tournament no longer available</div>
                              {createdLabel ? (
                                <div style={{ marginTop: 4, color: "rgba(16, 34, 19, 0.78)", fontWeight: 650, fontSize: 12 }}>
                                  Plan created {createdLabel}
                                </div>
                              ) : null}
                            </div>
                          );
                        }

                        return (
                          <div
                            key={plan.id}
                            style={{ border: "1px solid rgba(15, 61, 46, 0.12)", borderRadius: 12, padding: "10px 10px", background: "#fff" }}
                          >
                            <div style={{ fontWeight: 950, color: "#0b1f14" }}>{title}</div>
                            {metaParts.length ? (
                              <div style={{ marginTop: 4, color: "rgba(16, 34, 19, 0.78)", fontWeight: 650, fontSize: 12 }}>
                                {metaParts.join(" • ")}
                              </div>
                            ) : null}
                            <div style={{ marginTop: 6, color: "rgba(16, 34, 19, 0.82)", fontWeight: 650, fontSize: 12, lineHeight: 1.4 }}>
                              {lodgingParts.length || lodgingDates.length ? (
                                <>
                                  <span style={{ fontWeight: 850 }}>Lodging:</span>{" "}
                                  {[...lodgingParts, lodgingDates.length ? lodgingDates.join(" - ") : null].filter(Boolean).join(" • ")}
                                </>
                              ) : (
                                <>No lodging added yet.</>
                              )}
                            </div>
                            <WeekendPlanActionsClient
                              planId={plan.id}
                              tournamentSlug={slug}
                              selectedVenueId={plan.selected_venue_id ?? null}
                              notes={plan.notes ?? null}
                              lodgingName={plan.lodging_name ?? null}
                              lodgingAddress={plan.lodging_address ?? null}
                              checkInDate={plan.check_in_date ?? null}
                              checkOutDate={plan.check_out_date ?? null}
                              lodgingNotes={plan.lodging_notes ?? null}
                              tournamentCity={t?.city ?? null}
                              tournamentState={t?.state ?? null}
                              tournamentStartDate={t?.start_date ?? null}
                              tournamentEndDate={t?.end_date ?? null}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div style={{ padding: "12px 12px", borderRadius: 14, border: "1px solid rgba(15, 61, 46, 0.12)", background: "rgba(255,255,255,0.96)" }}>
                  <div style={{ fontSize: 12, fontWeight: 950, color: "#0b1f14" }}>Saved tournaments</div>
                  {isUnverified || !canUseSavedPlanning ? (
                    <div style={{ marginTop: 6, display: "grid", gap: 10 }}>
                      <div style={{ color: "rgba(16, 34, 19, 0.85)", fontWeight: 650, fontSize: 13, lineHeight: 1.45 }}>
                        Confirm your email to unlock Insider saved planning tools like saved tournaments.
                      </div>
                      <div>
                        <span className="secondaryLink" style={{ display: "inline-block" }}>
                          Check your inbox →
                        </span>
                      </div>
                    </div>
                  ) : savedLoadFailed ? (
                    <div style={{ marginTop: 6, color: "rgba(16, 34, 19, 0.85)", fontWeight: 650, fontSize: 13, lineHeight: 1.45 }}>
                      Saved tournaments are unavailable right now.
                    </div>
                  ) : savedTournaments.length === 0 ? (
                    <div style={{ marginTop: 6, display: "grid", gap: 10 }}>
                      <div style={{ color: "rgba(16, 34, 19, 0.85)", fontWeight: 650, fontSize: 13, lineHeight: 1.45 }}>
                        Saved tournaments will appear here after you save events from TournamentInsights.
                      </div>
                      <div>
                        <Link className="secondaryLink" href="/tournaments">
                          Browse tournaments →
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 8, display: "grid", gap: 10 }}>
                      {savedTournaments.map((t) => {
                        const slug = (t.slug ?? "").trim();
                        const hasSlug = Boolean(slug);
                        const title = (t.name ?? "Tournament").trim();
                        const loc = [t.city, t.state].filter(Boolean).join(", ");
                        const metaParts = [t.sport, formatDateRange(t.start_date, t.end_date), loc].filter(Boolean);
                        return (
                          <div key={t.id} style={{ border: "1px solid rgba(15, 61, 46, 0.12)", borderRadius: 12, padding: "10px 10px", background: "#fff" }}>
                            <div style={{ fontWeight: 950, color: "#0b1f14" }}>{title}</div>
                            {metaParts.length ? (
                              <div style={{ marginTop: 4, color: "rgba(16, 34, 19, 0.78)", fontWeight: 650, fontSize: 12 }}>
                                {metaParts.join(" • ")}
                              </div>
                            ) : null}
                            {hasSlug ? (
                              <SavedTournamentActionsClient
                                tournamentId={t.id}
                                tournamentSlug={slug}
                                tournamentCity={t.city ?? null}
                                tournamentState={t.state ?? null}
                                tournamentStartDate={t.start_date ?? null}
                                tournamentEndDate={t.end_date ?? null}
                              />
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                </>
              ) : (
                <>
                <div style={{ padding: "12px 12px", borderRadius: 14, border: "1px solid rgba(15, 61, 46, 0.12)", background: "rgba(255,255,255,0.96)" }}>
                  <div style={{ fontSize: 12, fontWeight: 950, color: "#0b1f14" }}>Weekend plans</div>
                  <div style={{ marginTop: 6, color: "rgba(16, 34, 19, 0.85)", fontWeight: 650, fontSize: 13, lineHeight: 1.45 }}>
                    Create a free Insider account to save weekend plans and keep your venue, lodging, and planning links together.
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <Link className="secondaryLink" href="/login?returnTo=%2Fweekend-planner">
                        Sign in →
                      </Link>
                      <Link className="secondaryLink" href="/signup?returnTo=%2Fweekend-planner">
                        Create account →
                      </Link>
                    </div>
                  </div>
                </div>

                <div style={{ padding: "12px 12px", borderRadius: 14, border: "1px solid rgba(15, 61, 46, 0.12)", background: "rgba(255,255,255,0.96)" }}>
                  <div style={{ fontSize: 12, fontWeight: 950, color: "#0b1f14" }}>Saved tournaments</div>
                  <div style={{ marginTop: 6, color: "rgba(16, 34, 19, 0.85)", fontWeight: 650, fontSize: 13, lineHeight: 1.45 }}>
                    Sign in to view your saved tournaments and jump back into weekend planning.
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <Link className="secondaryLink" href="/login?returnTo=%2Fweekend-planner">
                        Sign in →
                      </Link>
                      <Link className="secondaryLink" href="/signup?returnTo=%2Fweekend-planner">
                        Create account →
                      </Link>
                    </div>
                  </div>
                </div>
                </>
              )}
            </div>
          </div>
        </div>

        <WeekendPlannerClient />

        <div className={styles.disclosure}>
          <AffiliateDisclosure />
        </div>
      </section>
    </div>
  );
}
