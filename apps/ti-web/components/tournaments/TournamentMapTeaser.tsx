import Link from "next/link";

import TournamentMapCta from "@/components/tournaments/TournamentMapCta";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";

type Props = {
  mapHref: string;
  hotelsHref: string;
  rentalsHref: string;
  venueCount: number;
  primaryVenueName?: string | null;
  city?: string | null;
  state?: string | null;
};

export default function TournamentMapTeaser({
  mapHref,
  hotelsHref,
  rentalsHref,
  venueCount,
  primaryVenueName,
  city,
  state,
}: Props) {
  if (!Number.isFinite(venueCount) || venueCount <= 0) return null;

  const isSingleVenue = venueCount === 1;
  const title = "Plan around the fields";
  const body = "See venue locations, directions, hotels, Team Stays, and nearby options.";

  const primaryLabel = isSingleVenue ? "Open Venue Map" : "Open Tournament Map";

  const locationLabel = [city, state].filter(Boolean).join(", ");
  const contextLine =
    venueCount > 0 && locationLabel
      ? `${venueCount} venue${venueCount === 1 ? "" : "s"} near ${locationLabel}`
      : "View venues and nearby options";

  const hotelsLabel = (() => {
    if (venueCount === 1) {
      return primaryVenueName ? `Find hotels near ${primaryVenueName}` : "Find hotels near this venue";
    }
    return "Find hotels near tournament venues";
  })();

  const rentalsLabel = (() => {
    if (venueCount === 1) {
      return primaryVenueName ? `Search rentals near ${primaryVenueName}` : "Search rentals near this venue";
    }
    return "Search rentals near tournament venues";
  })();

  return (
    <div id="tournament-map-teaser" className="tournamentMapTeaser">
      <div className="tournamentMapTeaser__visual" aria-hidden="true">
        <span className="tournamentMapTeaser__pin tournamentMapTeaser__pin--one" />
        <span className="tournamentMapTeaser__pin tournamentMapTeaser__pin--two" />
        <span className="tournamentMapTeaser__pin tournamentMapTeaser__pin--three" />
        <div className="tournamentMapTeaser__venueBadge">{venueCount === 1 ? "1 venue" : `${venueCount} venues`}</div>
      </div>
      <div className="tournamentMapTeaser__titleRow">
        <div className="tournamentMapTeaser__title">{title}</div>
        {isSingleVenue && primaryVenueName ? (
          <div className="tournamentMapTeaser__hint">Venue: {primaryVenueName}</div>
        ) : null}
      </div>
      <div className="tournamentMapTeaser__context">{contextLine}</div>
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
          {hotelsLabel}
        </Link>
        <Link className="secondaryLink detailLinkSmall" href={rentalsHref} target="_blank" rel="noopener noreferrer sponsored">
          {rentalsLabel}
        </Link>
      </div>
      <AffiliateDisclosure className="tournamentMapTeaser__disclosure" />
    </div>
  );
}
