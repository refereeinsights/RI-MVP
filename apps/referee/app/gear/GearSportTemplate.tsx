import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

export type GearPick = {
  name: string;
  note: string;
  link?: string;
};

export type GearSection = {
  title: string;
  description: string;
  picks: GearPick[];
};

type GearSportTemplateProps = {
  eyebrow: string;
  title: string;
  subtitle: ReactNode;
  sections: GearSection[];
};

export default function GearSportTemplate({
  eyebrow,
  title,
  subtitle,
  sections,
}: GearSportTemplateProps) {
  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <nav style={styles.breadcrumb}>
          <Link href="/gear" style={styles.breadcrumbLink}>
            Gear hub
          </Link>{" "}
          / <span>{title}</span>
        </nav>

        <header style={styles.header}>
          <p style={styles.eyebrow}>{eyebrow}</p>
          <h1 style={styles.title}>{title}</h1>
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
          <p style={styles.subtitle}>{subtitle}</p>
        </header>

        <section style={styles.sections}>
          {sections.map((section) => (
            <article key={section.title} style={styles.sectionCard}>
              <h2 style={styles.sectionTitle}>{section.title}</h2>
              <p style={styles.sectionDescription}>{section.description}</p>
              <ul style={styles.list}>
                {section.picks.map((pick) => (
                  <li key={pick.name} style={styles.listItem}>
                    <strong>{pick.name}</strong>
                    <p style={styles.pickNote}>{pick.note}</p>
                    {pick.link && (
                      <Link href={pick.link} style={styles.pickLink}>
                        View pick
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </article>
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
    maxWidth: 900,
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
  sections: {
    display: "grid",
    gap: 24,
  },
  sectionCard: {
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 16,
    padding: 24,
    background: "#fff",
    boxShadow: "0 12px 26px rgba(0,0,0,0.08)",
  },
  sectionTitle: { margin: "0 0 8px", fontSize: 22, fontWeight: 800 },
  sectionDescription: { margin: "0 0 16px", color: "#555", lineHeight: 1.4 },
  list: { listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 16 },
  listItem: {
    borderTop: "1px solid rgba(0,0,0,0.06)",
    paddingTop: 12,
  },
  pickNote: { margin: "4px 0 8px", color: "#555", lineHeight: 1.4 },
  pickLink: {
    fontWeight: 700,
    color: "#0f5c46",
    textDecoration: "none",
  },
};
