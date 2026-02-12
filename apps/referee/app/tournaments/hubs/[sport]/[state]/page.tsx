import Link from "next/link";
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSportCardClass } from "@/lib/ui/sportBackground";
import "../../../tournaments.css";

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
  params: { sport: string; state: string };
}): Promise<Metadata> {
  const sportLabel = sportLabelFromParam(params.sport);
  const stateLabel = params.state.toUpperCase();
  return {
    title: `${sportLabel} Tournaments in ${stateLabel} | RefereeInsights`,
    description: `Public beta directory for ${sportLabel.toLowerCase()} tournaments in ${stateLabel}. Details sourced from public listings with referee insights coming soon.`,
    alternates: {
      canonical: `${SITE_ORIGIN}/tournaments/hubs/${params.sport.toLowerCase()}/${params.state.toLowerCase()}`,
    },
  };
}

export default async function SportStateTournamentHub({
  params,
}: {
  params: { sport: string; state: string };
}) {
  const sportQuery = normalizeSportParam(params.sport);
  const stateQuery = params.state.trim().toUpperCase();
  const { data, error } = await supabaseAdmin
    .from("tournaments_public" as any)
    .select("id,name,slug,city,state,sport,start_date")
    .eq("state", stateQuery)
    .ilike("sport", `%${sportQuery}%`)
    .order("start_date", { ascending: true });

  const tournaments = (data ?? []) as Tournament[];
  const sportLabel = sportLabelFromParam(params.sport);
  const stateLabel = stateQuery;

  return (
    <main className="pitchWrap tournamentsWrap">
      <section className="field tournamentsField">
        <div className="headerBlock brandedHeader">
          <h1 className="title" style={{ fontSize: "2rem", fontWeight: 600, letterSpacing: "-0.01em" }}>
            {sportLabel} Tournaments in {stateLabel}
          </h1>
          <div className="subtitle" style={{ marginTop: 12, maxWidth: 860, fontSize: 14, lineHeight: 1.6 }}>
            <p style={{ marginTop: 0 }}>
              This is the public beta hub for {sportLabel.toLowerCase()} tournaments in {stateLabel}. Listings are
              gathered from public sources and may be incomplete or in progress, but they give officials a consistent
              place to start researching assignments. RefereeInsights is building a referee-first directory that
              prioritizes practical details over hype, with clear links back to the public sources used to create each
              listing. If a venue, address, or date is missing here, it is because we could not confirm it yet. Use
              this hub to compare options across the state and identify events that match your crew’s availability.
            </p>
            <p>
              As verified referee insights arrive, you will see clearer decision signals about logistics, support, and
              working conditions. Until then, treat each listing as a baseline and use the links to confirm details with
              tournament operators. We do not publish ratings or pay claims without referee verification. If you are
              working an event listed here, you can help by reporting issues, requesting verified updates, or submitting
              a review once it is approved. Every correction improves this {stateLabel} hub for other officials and
              helps keep the directory accurate as the public beta expands.
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
                  <p className="meta">{location || stateLabel}</p>
                  <p className="dates">{formatDate(t.start_date)}</p>
                  <Link className="btn" href={`/tournaments/${t.slug}`}>
                    View details
                  </Link>
                </article>
              );
            })}
            {tournaments.length === 0 && (
              <p className="empty">No {sportLabel.toLowerCase()} tournaments are listed for {stateLabel} yet.</p>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
