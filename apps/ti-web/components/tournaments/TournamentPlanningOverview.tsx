import Link from "next/link";
import {
  buildTournamentOverviewCopy,
  buildTravelPlanningCopy,
  buildVerificationCopy,
  buildVenuePlanningCopy,
} from "@/lib/tournaments/tournamentPageCopy";
import TournamentMapCta from "@/components/tournaments/TournamentMapCta";

type NearbyCounts = { coffee: number; food: number; hotels: number; quick_eats: number; hangouts: number; sporting_goods: number };

export default function TournamentPlanningOverview(props: {
  tournament: {
    name: string;
    sport: string | null;
    level: string | null;
    start_date: string | null;
    end_date: string | null;
    city: string | null;
    state: string | null;
    official_website_url?: string | null;
  };
  venueCount: number;
  primaryVenueName: string | null;
  primaryVenueLocationLabel: string | null;
  mapHref: string;
  hotelsHref: string | null;
  counts: NearbyCounts | null;
  isDemoTournament: boolean;
  tournamentSlug?: string | null;
}) {
  const overview = buildTournamentOverviewCopy({
    tournament: props.tournament,
    venueCount: props.venueCount,
    primaryVenueName: props.primaryVenueName,
  });
  const venuePlanning = buildVenuePlanningCopy({
    venueCount: props.venueCount,
    primaryVenueName: props.primaryVenueName,
    primaryVenueLocationLabel: props.primaryVenueLocationLabel,
    mapHref: props.mapHref,
  });
  const travelPlanning = buildTravelPlanningCopy({ counts: props.counts, venueCount: props.venueCount });
  const verification = buildVerificationCopy({
    official_website_url: props.tournament.official_website_url ?? null,
    isDemoTournament: props.isDemoTournament,
  });

  const paragraphs = [overview, venuePlanning, travelPlanning, verification].filter(Boolean) as string[];

  if (!paragraphs.length) return null;

  return (
    <section className="detailCard" style={{ width: "min(720px, 100%)", marginTop: 12, marginLeft: "auto", marginRight: "auto" }}>
      <div className="detailCard__title" style={{ fontSize: 15, fontWeight: 800 }}>
        Tournament Planning Overview
      </div>
      <div className="detailCard__body" style={{ display: "grid", gap: 10, fontSize: 13, lineHeight: 1.45 }}>
        {paragraphs.map((p, idx) => (
          <p key={idx} style={{ margin: 0, opacity: 0.92 }}>
            {p}
          </p>
        ))}

        <div style={{ marginTop: 2, display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 950 }}>Stay close to your fields</div>
          <div style={{ opacity: 0.9 }}>Most teams stay within 10–15 minutes of their venue.</div>
          <div>
            <TournamentMapCta
              href={props.mapHref}
              label="See closest hotels, food & coffee"
              sourceContext="tournament_page:overview_cta"
              tournamentSlug={props.tournamentSlug ?? null}
              sport={props.tournament.sport ?? null}
            />
          </div>
        </div>

        <div className="detailLinksRow" style={{ marginTop: 2, gap: 12, flexWrap: "wrap" as any }}>
          <a className="secondaryLink" href="#where-youll-play">
            View full tournament plan
          </a>
        </div>
      </div>
    </section>
  );
}
