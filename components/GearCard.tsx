import { withAmazonTag } from "@/lib/amazon";
import type { CSSProperties } from "react";

export type GearCardProps = {
  name: string;
  description?: string | null;
  sport?: string | null;
  category?: string | null;
  amazonUrl?: string | null;
  priceHint?: string | null;
};

export default function GearCard({
  name,
  description,
  sport,
  category,
  amazonUrl,
  priceHint,
}: GearCardProps) {
  const amazonHref = amazonUrl ? withAmazonTag(amazonUrl) : null;

  return (
    <article style={styles.card}>
      <div style={styles.metaRow}>
        {sport && (
          <span style={styles.badge} aria-label="Sport">
            {sport}
          </span>
        )}
        {category && (
          <span style={{ ...styles.badge, ...styles.categoryBadge }} aria-label="Category">
            {category}
          </span>
        )}
      </div>
      <h3 style={styles.name}>{name}</h3>
      {priceHint && <p style={styles.priceHint}>{priceHint}</p>}
      {description && <p style={styles.description}>{description}</p>}
      {amazonHref && (
        <a
          href={amazonHref}
          target="_blank"
          rel="sponsored noopener noreferrer"
          style={styles.amazonButton}
        >
          View on Amazon
          <span style={styles.arrow}>↗</span>
        </a>
      )}
    </article>
  );
}

const styles: Record<string, CSSProperties> = {
  card: {
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 18,
    padding: "1.5rem",
    background: "#fff",
    boxShadow: "0 12px 28px rgba(0,0,0,0.08)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  metaRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  badge: {
    borderRadius: 999,
    padding: "0.2rem 0.75rem",
    background: "#eef7f4",
    color: "#0f5c46",
    fontWeight: 700,
  },
  categoryBadge: {
    background: "#f8f1e5",
    color: "#7a4f16",
  },
  name: {
    margin: "0.25rem 0 0",
    fontSize: 22,
    lineHeight: 1.2,
  },
  priceHint: {
    margin: 0,
    color: "#0f5c46",
    fontWeight: 700,
  },
  description: {
    margin: 0,
    color: "#444",
    lineHeight: 1.5,
  },
  amazonButton: {
    marginTop: "auto",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "0.75rem 1.25rem",
    borderRadius: 999,
    background: "#f7a41d",
    color: "#111",
    fontWeight: 800,
    textDecoration: "none",
    boxShadow: "0 10px 20px rgba(0,0,0,0.15)",
  },
  arrow: {
    fontSize: 18,
    lineHeight: 1,
  },
};
