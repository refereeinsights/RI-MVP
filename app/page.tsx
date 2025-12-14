export default function Home() {
  return (
    <main style={styles.main}>
      <header style={styles.header}>
        <h1 style={styles.title}>Referee Insights</h1>
        <p style={styles.subtitle}>Insight before you accept.</p>
      </header>

      <section style={styles.section}>
        <h2 style={styles.heading}>Why Referee Insights?</h2>
        <p style={styles.text}>
          Referee Insights helps officials make smarter assignment decisions
          by providing transparency, context, and community-driven insight
          before committing to games, tournaments, or assignors.
        </p>
      </section>

      <section style={styles.sectionAlt}>
        <h2 style={styles.heading}>What You’ll Get</h2>
        <ul style={styles.list}>
          <li>✔ Tournament and assignor insights</li>
          <li>✔ Community feedback from fellow officials</li>
          <li>✔ AI-assisted summaries (coming soon)</li>
          <li>✔ Smarter decisions, fewer surprises</li>
        </ul>
      </section>

      <section style={styles.section}>
        <h2 style={styles.heading}>Built for Officials</h2>
        <p style={styles.text}>
          Whether you’re a youth referee, high school official, or working
          competitive matches, Referee Insights exists to protect your time,
          effort, and experience.
        </p>
      </section>

      <section style={styles.ctaSection}>
        <h2 style={styles.heading}>Get Early Access</h2>
        <p style={styles.text}>
          We’re building the MVP now. Join the early list to help shape the
          platform and be first to access insights.
        </p>

        <form style={styles.form}>
          <input
            type="email"
            placeholder="you@email.com"
            style={styles.input}
            disabled
          />
          <button style={styles.button} disabled>
            Coming Soon
          </button>
        </form>
      </section>

      <footer style={styles.footer}>
        <p>© {new Date().getFullYear()} Referee Insights</p>
      </footer>
    </main>
  );
}

const styles = {
  main: {
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    backgroundColor: "#ffffff",
    color: "#000000",
    lineHeight: 1.6,
  },
  header: {
    padding: "4rem 2rem",
    textAlign: "center" as const,
    borderBottom: "2px solid #000",
  },
  title: {
    fontSize: "3rem",
    marginBottom: "0.5rem",
    letterSpacing: "0.05em",
  },
  subtitle: {
    fontSize: "1.2rem",
    fontWeight: 600,
  },
  section: {
    padding: "3rem 2rem",
    maxWidth: "900px",
    margin: "0 auto",
  },
  sectionAlt: {
    padding: "3rem 2rem",
    maxWidth: "900px",
    margin: "0 auto",
    backgroundColor: "#f5f5f5",
    borderTop: "1px solid #000",
    borderBottom: "1px solid #000",
  },
  heading: {
    fontSize: "1.8rem",
    marginBottom: "1rem",
  },
  text: {
    fontSize: "1rem",
  },
  list: {
    listStyle: "none",
    padding: 0,
    fontSize: "1rem",
  },
  ctaSection: {
    padding: "3rem 2rem",
    maxWidth: "900px",
    margin: "0 auto",
    textAlign: "center" as const,
  },
  form: {
    marginTop: "1.5rem",
    display: "flex",
    justifyContent: "center",
    gap: "0.5rem",
    flexWrap: "wrap" as const,
  },
  input: {
    padding: "0.75rem",
    fontSize: "1rem",
    border: "1px solid #000",
    minWidth: "250px",
  },
  button: {
    padding: "0.75rem 1.5rem",
    fontSize: "1rem",
    backgroundColor: "#000",
    color: "#fff",
    border: "none",
    cursor: "not-allowed",
  },
  footer: {
    padding: "2rem",
    textAlign: "center" as const,
    borderTop: "2px solid #000",
    fontSize: "0.9rem",
  },
};
