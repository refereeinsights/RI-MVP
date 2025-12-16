import Link from "next/link";
import type { CSSProperties } from "react";

const CATEGORIES = [
  {
    slug: "whistles",
    title: "Whistles",
    blurb: "Fox 40 classics with affiliate disclosure plus a reminder to pack a spare.",
  },
  {
    slug: "flags",
    title: "Assistant flags",
    blurb: "Touchline flag sets and carry cases so AR kits stay sharp through showcases.",
  },
  {
    slug: "cards",
    title: "Cards & notebooks",
    blurb: "Wallets, caution cards, notebooks, and toss coins for match control.",
  },
  {
    slug: "uniforms",
    title: "Uniforms",
    blurb: "Short and long sleeve kits, shorts, and socks—double-check league colors.",
  },
];

export const metadata = {
  title: "Soccer Referee Gear Guide | Referee Insights",
  description:
    "Tournament-tested soccer referee kits, whistles, flags, cards, and uniforms curated for Referee Insights members.",
};

export default function SoccerGearPage() {
  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <nav style={styles.breadcrumb}>
          <Link href="/gear" style={styles.breadcrumbLink}>
            Gear hub
          </Link>{" "}
          / <span>Soccer</span>
        </nav>

        <header style={styles.header}>
          <p style={styles.eyebrow}>Soccer gear</p>
          <h1 style={styles.title}>Soccer referee gear hub</h1>
          <p style={styles.subtitle}>
            Links to the most-requested soccer categories: whistles, AR flags, match cards, and uniforms. Each page lists
            neutral affiliate picks for convenience with clear disclosure.
          </p>
          <div style={styles.disclosure}>
            <strong>Affiliate Disclosure</strong>
            <p style={styles.disclosureBody}>
              Some links on these pages are affiliate links. If you make a purchase, Referee Insights may earn a small
              commission at no additional cost to you. Products are listed for informational purposes only.
            </p>
          </div>
        </header>

        <section style={styles.grid}>
          {CATEGORIES.map((category) => (
            <Link key={category.slug} href={`/gear/soccer/${category.slug}`} style={styles.card}>
              <h2 style={styles.cardTitle}>{category.title}</h2>
              <p style={styles.cardBody}>{category.blurb}</p>
              <span style={styles.cardCta}>Browse {category.title.toLowerCase()} →</span>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  main: {
    padding: "48px 16px",
    display: "flex",
    justifyContent: "center",
  },
  container: {
    width: "100%",
    maxWidth: 940,
  },
  breadcrumb: {
    fontSize: 13,
    marginBottom: 12,
    color: "#2f6752",
  },
  breadcrumbLink: {
    color: "#2f6752",
    textDecoration: "none",
    fontWeight: 700,
  },
  header: {
    textAlign: "left",
    marginBottom: 32,
  },
  eyebrow: {
    textTransform: "uppercase",
    letterSpacing: 1,
    fontSize: 12,
    fontWeight: 800,
    color: "#0f5c46",
    marginBottom: 8,
  },
  title: { margin: 0, fontSize: 38, fontWeight: 900 },
  subtitle: { marginTop: 14, color: "#444", fontSize: 16, lineHeight: 1.6 },
  disclosure: {
    border: "1px solid rgba(0,0,0,0.08)",
    background: "#f7faf9",
    borderRadius: 12,
    padding: "12px 16px",
    fontSize: 13,
    marginTop: 16,
  },
  disclosureBody: { margin: "6px 0", color: "#444", lineHeight: 1.4 },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 20,
  },
  card: {
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 16,
    padding: 20,
    textDecoration: "none",
    background: "#fff",
    boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
    transition: "transform 0.15s ease, box-shadow 0.15s ease",
    color: "#111",
  },
  cardTitle: { margin: "0 0 8px", fontSize: 20, fontWeight: 800 },
  cardBody: { margin: "0 0 18px", color: "#444", lineHeight: 1.4 },
  cardCta: { fontWeight: 800, color: "#0f5c46" },
};
