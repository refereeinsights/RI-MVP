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
          <bu

