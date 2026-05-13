// TODO: redirect /weekend-planner → /book-travel once the calendar-based Weekend Planner product
// is ready to claim this route.
import Link from "next/link";
import "../tournaments/tournaments.css";
import WeekendPlannerClient from "./WeekendPlannerClient";
import styles from "./WeekendPlanner.module.css";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getTiTierServer } from "@/lib/entitlementsServer";
import { getSavedTournamentIdsForUser } from "@/lib/savedTournaments";

export const revalidate = 3600;

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
      "Save tournaments, plan travel, and organize venue logistics for sports weekends.",
    alternates: { canonical: "/book-travel" },
  };
}

export default async function WeekendPlannerPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthed = Boolean(user);
  const tierInfo = await getTiTierServer(user ?? null);

  let savedTournaments: SavedTournamentRow[] = [];
  let savedLoadFailed = false;

  if (user?.id) {
    try {
      const ids = (await getSavedTournamentIdsForUser(user.id)).slice(0, 25);
      if (ids.length) {
        // NOTE: Confirm `tournaments_public` has `id` and supports `.in("id", ids)`; if not,
        // fall back to the smallest compatible public tournament source already used in TI.
        const { data, error } = await supabase
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

  return (
    <main className="pitchWrap tournamentsWrap">
      <section className="field tournamentsField">
        <div className="headerBlock">
          <h1 className="title">Weekend Planner</h1>
          <p className="subtitle">
            Save tournaments, plan travel, and organize venue logistics for your sports weekend.
          </p>
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
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
                  {tierInfo.tier === "weekend_pro" ? "Weekend Pro active" : "Weekend Planner Preview"}
                </div>
                <div style={{ marginTop: 4, color: "rgba(16, 34, 19, 0.85)", fontWeight: 650, fontSize: 13, lineHeight: 1.45 }}>
                  {tierInfo.tier === "weekend_pro"
                    ? "Your account is set up for the premium TournamentInsights planning experience as new tools roll out."
                    : "You can save tournaments and plan travel basics today. Weekend Pro tools will continue to expand around tournament logistics."}
                </div>
                <div style={{ marginTop: 10 }}>
                  <Link className="secondaryLink" href="/premium">
                    Explore Weekend Pro →
                  </Link>
                </div>
              </div>

              {isAuthed ? (
                <div style={{ padding: "12px 12px", borderRadius: 14, border: "1px solid rgba(15, 61, 46, 0.12)", background: "rgba(255,255,255,0.96)" }}>
                  <div style={{ fontSize: 12, fontWeight: 950, color: "#0b1f14" }}>Saved tournaments</div>
                  {savedLoadFailed ? (
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
                              <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 10 }}>
                                <Link className="secondaryLink" href={`/tournaments/${encodeURIComponent(slug)}`}>
                                  Tournament →
                                </Link>
                                <Link className="secondaryLink" href={`/weekend/${encodeURIComponent(slug)}`}>
                                  Weekend plan →
                                </Link>
                                <Link className="secondaryLink" href={`/tournaments/${encodeURIComponent(slug)}/map`}>
                                  Venue map →
                                </Link>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: "12px 12px", borderRadius: 14, border: "1px solid rgba(15, 61, 46, 0.12)", background: "rgba(255,255,255,0.96)" }}>
                  <div style={{ fontSize: 12, fontWeight: 950, color: "#0b1f14" }}>Saved tournaments</div>
                  <div style={{ marginTop: 6, color: "rgba(16, 34, 19, 0.85)", fontWeight: 650, fontSize: 13, lineHeight: 1.45 }}>
                    Sign in to save tournaments and keep weekend plans in one place.
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <Link className="secondaryLink" href="/signup?returnTo=%2Fweekend-planner">
                      Sign up →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <WeekendPlannerClient />

        <div className={styles.disclosure}>
          <AffiliateDisclosure />
        </div>
      </section>
    </main>
  );
}
