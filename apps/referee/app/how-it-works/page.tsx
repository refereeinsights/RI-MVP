export const metadata = {
  title: "How it works | RefereeInsights",
  description: "How RefereeInsights helps officials evaluate tournaments and schools before accepting.",
};

export default function HowItWorksPage() {
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
          background: "rgba(255,255,255,0.9)",
          borderRadius: 18,
          padding: "2rem",
          boxShadow: "0 18px 38px rgba(0,0,0,0.12)",
        }}
      >
        <h1 style={{ margin: "0 0 0.5rem", fontSize: "2.2rem", color: "#0f2a1a" }}>How it works</h1>
        <p style={{ margin: "0 0 1.5rem", color: "#1f3b2b", lineHeight: 1.6 }}>
          RefereeInsights is referee-first. We surface moderated insight from working officials so you can make informed decisions quickly.
        </p>

        <ol style={{ paddingLeft: "1.25rem", margin: "0 0 2rem", lineHeight: 1.7, color: "#0f2a1a" }}>
          <li style={{ marginBottom: "0.9rem" }}>Browse tournaments and organizations.</li>
          <li style={{ marginBottom: "0.9rem" }}>Read referee insight on pay, organization, and safety.</li>
          <li style={{ marginBottom: "0.9rem" }}>Decide before accepting assignments.</li>
        </ol>

        <a
          href="/tournaments"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            background: "#0f3d2e",
            color: "#fff",
            padding: "0.85rem 1.5rem",
            borderRadius: 999,
            fontWeight: 800,
            textDecoration: "none",
            letterSpacing: "0.05em",
          }}
        >
          Browse Tournament Reviews
        </a>
      </section>
    </main>
  );
}
