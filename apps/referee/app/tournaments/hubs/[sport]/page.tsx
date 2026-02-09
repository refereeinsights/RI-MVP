import Link from "next/link";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getSportCardClass } from "@/lib/ui/sportBackground";
import "../../tournaments.css";

type Tournament = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string | null;
  sport: string | null;
  start_date: string | null;
};

export const revalidate = 300;

const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.refereeinsights.com").replace(/\/+$/, "");

function toTitleCase(value: string) {
  return value.replace(/\b\w/g, (match) => match.toUpperCase());
}

function normalizeSportParam(sport: string) {
  return sport.trim().toLowerCase().replace(/-/g, " ");
}

function sportLabelFromParam(sport: string) {
  return toTitleCase(normalizeSportParam(sport));
}

function formatDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export async function generateMetadata({
  params,
}: {
  params: { sport: string };
}): Promise<Metadata> {
  const sportLabel = sportLabelFromParam(params.sport);
  return {
    title: `${sportLabel} Tournament Directory | RefereeInsights`,
    description: `Public beta directory for ${sportLabel} tournaments. Details sourced from public listings with referee insights coming soon.`,
    alternates: {
      canonical: `${SITE_ORIGIN}/tournaments/hubs/${params.sport.toLowerCase()}`,
    },
  };
}

export default async function SportTournamentHub({
  params,
}: {
  params: { sport: string };
}) {
  const sportQuery = normalizeSportParam(params.sport);
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select("id,name,slug,city,state,sport,start_date,status,is_canonical")
    .eq("status", "published")
    .eq("is_canonical", true)
    .ilike("sport", `%${sportQuery}%`)
    .order("start_date", { ascending: true });

  const tournaments = (data ?? []) as Tournament[];
  const sportLabel = sportLabelFromParam(params.sport);

  return (
    <main className="pitchWrap tournamentsWrap">
      <section className="field tournamentsField">
        <div className="headerBlock brandedHeader">
          <h1 className="title" style={{ fontSize: "2rem", fontWeight: 600, letterSpacing: "-0.01em" }}>
            {sportLabel} Tournament Directory
          </h1>
          <div className="subtitle" style={{ marginTop: 12, maxWidth: 860, fontSize: 14, lineHeight: 1.6 }}>
            <p style={{ marginTop: 0 }}>
              RefereeInsights is building a public beta directory focused on {sportLabel.toLowerCase()} tournaments so
              officials can plan assignments with fewer surprises. Listings on this page are sourced from public
              tournament information and may be incomplete or in progress. We publish only what can be traced to a
              public listing and avoid filling in gaps with assumptions. That means you might see missing venues,
              partial dates, or limited contact information while the catalog fills in. The goal is not marketing
              copy; it is a practical, referee-first record that helps crews compare events by timing, location, and
              level before committing. Over time this should make it easier to plan travel, manage weekend workloads,
              and coordinate with other officials.
            </p>
            <p>
              As referee reviews are collected and verified, this hub will gain richer insight into logistics, crew
              support, and working conditions. Until then, treat each listing as a starting point for your own research
              and outreach. We do not publish ratings or pay claims unless they are supported by verified referee
              submissions. If you are working one of these events, you can help by reporting issues, requesting verified
              updates, or submitting a review once it is approved. Every correction improves the public beta and helps
              other officials prepare with clearer expectations for assignments.
            </p>
          </div>
        </div>

        {error ? (
          <p className="empty">Error loading tournaments: {error.message}</p>
        ) : (
          <div className="grid">
            {tournaments.map((t) => {
              const location = [t.city, t.state].filter(Boolean).join(", ");
              return (
                <article key={t.id} className={`card ${getSportCardClass(t.sport)}`}>
                  <h2>
                    <Link href={`/tournaments/${t.slug}`}>
                      {t.name}
                      {location ? ` (${location})` : ""}
                    </Link>
                  </h2>
                  <p className="meta">{location || "Location TBD"}</p>
                  <p className="dates">{formatDate(t.start_date)}</p>
                  <Link className="btn" href={`/tournaments/${t.slug}`}>
                    View details
                  </Link>
                </article>
              );
            })}
            {tournaments.length === 0 && (
              <p className="empty">No {sportLabel.toLowerCase()} tournaments are listed yet.</p>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
