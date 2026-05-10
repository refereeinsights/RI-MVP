import Link from "next/link";

type Props = {
  tournamentName: string;
  venueCount: number;
  href: string;
};

export default function VenueMapPreviewStrip({ tournamentName, venueCount, href }: Props) {
  if (!Number.isFinite(venueCount) || venueCount <= 0) return null;

  const title = venueCount === 1 ? "1 venue mapped" : `${venueCount} venues mapped`;

  return (
    <Link href={href} className="venueMapPreviewStrip" aria-label={`View venue map for ${tournamentName}`}>
      <div className="venueMapPreviewStrip__visual" aria-hidden="true">
        <span className="venueMapDot venueMapDot--one" />
        <span className="venueMapDot venueMapDot--two" />
        <span className="venueMapDot venueMapDot--three" />
        <span className="venueMapDot venueMapDot--four" />
      </div>
      <div className="venueMapPreviewStrip__copy">
        <div className="venueMapPreviewStrip__title">{title}</div>
        <div className="venueMapPreviewStrip__subtitle">Plan hotels by location</div>
      </div>
    </Link>
  );
}

