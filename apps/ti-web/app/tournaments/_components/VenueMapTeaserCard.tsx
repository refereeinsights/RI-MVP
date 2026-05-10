import Link from "next/link";

type Props = {
  tournamentName: string;
  slug: string;
  venueCount: number;
  city: string | null;
  state: string | null;
};

export default function VenueMapTeaserCard({ tournamentName, slug, venueCount, city, state }: Props) {
  if (!Number.isFinite(venueCount) || venueCount <= 0) return null;

  const primaryArea = [city, state].filter(Boolean).join(", ");
  const href = `/tournaments/${encodeURIComponent(slug)}/map`;

  const headline = venueCount === 1 ? "Plan around 1 venue" : `Plan around ${venueCount} venues`;
  const subhead = primaryArea
    ? venueCount === 1
      ? `Games are in ${primaryArea}`
      : `Most games are in ${primaryArea}`
    : null;
  const helper =
    venueCount === 1
      ? "Find hotels and Team Stays near the venue."
      : "Compare hotels and Team Stays by venue location.";

  return (
    <Link
      href={href}
      className="venueMapTeaserCard"
      aria-label={`Open interactive venue map for ${tournamentName}`}
    >
      <div className="venueMapTeaserCard__visual" aria-hidden="true">
        <span className="venueMapTeaserCard__pin venueMapTeaserCard__pin--one" />
        <span className="venueMapTeaserCard__pin venueMapTeaserCard__pin--two" />
        <span className="venueMapTeaserCard__pin venueMapTeaserCard__pin--three" />
      </div>

      <div className="venueMapTeaserCard__content">
        <div className="venueMapTeaserCard__badge">{venueCount === 1 ? "1 venue" : `${venueCount} venues`}</div>
        <div className="venueMapTeaserCard__headline">{headline}</div>
        {subhead ? <div className="venueMapTeaserCard__subhead">{subhead}</div> : null}
        <div className="venueMapTeaserCard__cta" aria-hidden="true">
          Open interactive venue map →
        </div>
        <div className="venueMapTeaserCard__helper">{helper}</div>
      </div>
    </Link>
  );
}

