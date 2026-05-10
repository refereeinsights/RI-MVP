import Link from "next/link";

type Props = {
  tournamentName: string;
  venueCount: number;
  href: string;
};

export default function VenueMapPreviewStrip({ tournamentName, venueCount, href }: Props) {
  if (!Number.isFinite(venueCount) || venueCount <= 0) return null;

  const title = venueCount === 1 ? "1 venue mapped" : `${venueCount} venues mapped`;
  const visibleVenuePins = Math.min(Math.max(Math.floor(venueCount), 1), 3);

  return (
    <Link
      href={href}
      className="venueMapPreviewStrip"
      aria-label={`Open venue map for ${tournamentName}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      <div className="venueMapPreviewStrip__visual" aria-hidden="true">
        {Array.from({ length: visibleVenuePins }).map((_, idx) => (
          <span key={`venue-${idx}`} className={`venueMapPin venueMapPin--venue venueMapPin--venue${idx + 1}`} />
        ))}
        <span className="venueMapPin venueMapPin--hotel" aria-hidden="true" />
        <span className="venueMapPin venueMapPin--food" aria-hidden="true" />
      </div>
      <div className="venueMapPreviewStrip__copy">
        <div className="venueMapPreviewStrip__title">{title}</div>
        <div className="venueMapPreviewStrip__subtitle">Open venue map →</div>
      </div>
    </Link>
  );
}
