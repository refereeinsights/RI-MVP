import Link from "next/link";

import TournamentMapCta from "@/components/tournaments/TournamentMapCta";

type Props = {
  mapHref: string;
  hotelsHref: string;
  rentalsHref: string;
  venueCount: number;
  primaryVenueName?: string | null;
};

export default function TournamentMapTeaser({ mapHref, hotelsHref, rentalsHref, venueCount, primaryVenueName }: Props) {
  if (!Number.isFinite(venueCount) || venueCount <= 0) return null;

  const isSingleVenue = venueCount === 1;
  const heading = isSingleVenue ? "Open the venue map" : "Open the tournament map";
  const body = isSingleVenue
    ? "Get directions and compare nearby hotels and Team Stays by location."
    : "Compare venues and plan hotels and Team Stays by location.";

  const primaryLabel = isSingleVenue ? "Open Venue Map" : "Open Tournament Map";

  const detailHeading =
    isSingleVenue && primaryVenueName ? (
      <div className="tournamentMapTeaser__detailHeading">See {primaryVenueName} on the map</div>
    ) : null;

  return (
    <div id="tournament-map-teaser" className="tournamentMapTeaser">
      {detailHeading}
      <div className="tournamentMapTeaser__heading">{heading}</div>
      <div className="tournamentMapTeaser__body">{body}</div>
      <div className="tournamentMapTeaser__primary">
        <TournamentMapCta
          href={mapHref}
          label={primaryLabel}
          sourceContext="tournament_detail:map_teaser"
          variant="button"
        />
      </div>
      <div className="tournamentMapTeaser__secondaryRow">
        <Link className="secondaryLink detailLinkSmall" href={hotelsHref} target="_blank" rel="noopener noreferrer sponsored">
          Hotels nearby
        </Link>
        <Link className="secondaryLink detailLinkSmall" href={rentalsHref} target="_blank" rel="noopener noreferrer sponsored">
          Team Stays nearby
        </Link>
      </div>
    </div>
  );
}

