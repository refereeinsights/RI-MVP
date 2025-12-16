import Link from "next/link";
import type { CSSProperties } from "react";

const SPORTS = [
  { slug: "soccer", name: "Soccer", blurb: "Kits, whistles, and hydration picks for long tournament weekends." },
  { slug: "basketball", name: "Basketball", blurb: "Shoes, stripes, and rotation-friendly bags for gym days." },
  { slug: "football", name: "Football", blurb: "Sideline essentials, cold‑weather layers, and penalty flags." },
  { slug: "baseball", name: "Baseball", blurb: "Masks, chest protectors, and plate shoes that can handle doubleheaders." },
];

export const metadata = {
  title: "Referee Gear Hub | Referee Insights",
  description: "Hand-picked referee gear guides by sport—kits, accessories, and tournament-tested essentials.",
};

export default function GearHubPage() {
  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <header style={styles.header}>
          <p style={styles.eyebrow}>Gear hub</p>
          <h1 style={styles.title}>Tournament-tested referee gear</h1>
          <div style={styles.disclosure}>
            <strong>Affiliate Disclosure</strong>
            <p style={styles.disclosureBody}>
              Some links on this page are affiliate links. If you make a purchase, Referee Insights may
              earn a small commission at no additional cost to you.
            </p>
            <p style={styles.disclosureBody}>
              Products are listed for convenience and informational purposes only. Referee Insights does
              not endorse or guarantee any product.
            </p>
          </div>
          <p style={styles.subtitle}>
            Lightweight bags, all-weather kits, and comfort upgrades recommended by verified officials.
            Choose your sport to see curated lists and packing tips.
          </p>
        </header>

        <section style={styles.grid}>
          {SPORTS.map((sport) => (
            <Link key={sport.slug} href={`/gear/${sport.slug}`} style={styles.card}>
              <h2 style={styles.cardTitle}>{sport.name}</h2>
              <p style={styles.cardBody}>{sport.blurb}</p>
              <span style={styles.cardCta}>Browse {sport.name} gear →</span>
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
    maxWidth: 960,
  },
  header: {
    textAlign: "center",
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
  title: { margin: 0, fontSize: 40, fontWeight: 900 },
  subtitle: { marginTop: 16, color: "#555", fontSize: 16, lineHeight: 1.5 },
  disclosure: {
    border: "1px solid rgba(0,0,0,0.08)",
    background: "#f7faf9",
    borderRadius: 12,
    padding: "12px 16px",
    fontSize: 13,
    marginTop: 16,
    textAlign: "left",
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
