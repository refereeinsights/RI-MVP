import Link from "next/link";
import {
  buildTournamentOverviewCopy,
  buildTravelPlanningCopy,
  buildVerificationCopy,
  buildVenuePlanningCopy,
} from "@/lib/tournaments/tournamentPageCopy";

type NearbyCounts = { coffee: number; food: number; hotels: number };

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

        <div className="detailLinksRow" style={{ marginTop: 2, gap: 12, flexWrap: "wrap" as any }}>
          <Link className="secondaryLink" href={props.mapHref}>
            Open venue map
          </Link>
          <a className="secondaryLink" href="#where-youll-play">
            View venue details
          </a>
          {props.hotelsHref ? (
            <a className="secondaryLink" href={props.hotelsHref} target="_blank" rel="noopener noreferrer sponsored">
              View hotel options
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}

