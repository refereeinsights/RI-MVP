export const metadata = {
  title: "Content Standards | RefereeInsights",
  description:
    "What we allow on RefereeInsights: professionalism, safety, logistics, and pay clarity. What we don’t allow: harassment, doxxing, or threats.",
};

export default function ContentStandardsPage() {
  return (
    <main
      style={{
        width: "100%",
        display: "flex",
        justifyContent: "center",
        padding: "3rem 1.5rem",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 900,
          background: "rgba(255,255,255,0.95)",
          borderRadius: 18,
          padding: "2rem",
          boxShadow: "0 18px 38px rgba(0,0,0,0.12)",
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: "0.75rem", color: "#0f2a1a" }}>Content Standards</h1>
        <p style={{ marginTop: 0, marginBottom: "1.25rem", color: "#1f3b2b", lineHeight: 1.6 }}>
          RefereeInsights is referee-first. Keep contributions professional and focused on helping others make informed decisions.
        </p>

        <h3 style={{ marginBottom: "0.5rem", color: "#0f2a1a" }}>What we allow</h3>
        <ul style={{ marginTop: 0, marginBottom: "1.25rem", lineHeight: 1.6, color: "#0f2a1a" }}>
          <li>Professionalism, safety, and logistics insight</li>
          <li>Clarity on pay accuracy, timing, and organization</li>
          <li>Observations about on-site experience and support</li>
        </ul>

        <h3 style={{ marginBottom: "0.5rem", color: "#0f2a1a" }}>What we don’t allow</h3>
        <ul style={{ marginTop: 0, marginBottom: "1.25rem", lineHeight: 1.6, color: "#0f2a1a" }}>
          <li>Harassment, personal attacks, or defamation</li>
          <li>Doxxing or sharing private personal information</li>
          <li>Discriminatory content or threats</li>
        </ul>

        <p style={{ marginTop: 0, marginBottom: "1rem", color: "#1f3b2b", lineHeight: 1.6 }}>
          We may edit or remove content that violates these standards.
        </p>
        <p style={{ marginTop: 0, marginBottom: "1rem", color: "#1f3b2b", lineHeight: 1.6 }}>
          Report an issue: <a href="mailto:rod@refereeinsights.com">rod@refereeinsights.com</a>
        </p>
      </section>
    </main>
  );
}
