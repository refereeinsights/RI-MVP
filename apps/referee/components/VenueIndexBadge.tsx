import { computeVenueIndex, type VenueIndexInput } from "@/lib/venueIndex";
import styles from "./VenueIndexBadge.module.css";

type Props = VenueIndexInput;

function formatUpdated(value: string | Date | null | undefined) {
  if (!value) return "Unknown";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function VenueIndexBadge(props: Props) {
  const result = computeVenueIndex(props);
  const count = props.review_count ?? 0;

  return (
    <div className={styles.badge}>
      <div className={styles.topRow}>
        <p className={styles.title}>Venue Index</p>
        <span
          className={styles.tooltip}
          title="Composite venue quality score from facilities/logistics, review freshness, and review volume."
          aria-label="Venue Index info"
        >
          i
        </span>
      </div>

      <div className={styles.valueRow}>
        <span className={styles.indexValue}>{result.index == null ? "—" : result.index}</span>
        <span className={styles.label}>{result.index == null ? "Not enough data" : result.label}</span>
      </div>

      <div className={styles.meter} aria-hidden="true">
        {[0, 1, 2, 3, 4].map((bar) => (
          <span key={bar} className={`${styles.bar} ${bar < result.bars ? styles.barFilled : ""}`} />
        ))}
      </div>

      <div className={styles.meta}>Based on {count} reviews</div>
      <div className={styles.meta}>Updated {formatUpdated(props.reviews_last_updated_at)}</div>
      {count > 0 && count < 5 ? <div className={styles.muted}>Early data — score stabilizes as reviews increase.</div> : null}
    </div>
  );
}
