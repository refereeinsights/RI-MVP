export const metadata = {
  title: "Review & Content Disclaimer | Referee Insights",
  description:
    "Referee Insights disclaimer about reviews being user opinions and not verified statements of fact.",
};

export default function DisclaimerPage() {
  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <h1 style={styles.h1}>Review & Content Disclaimer</h1>
        <p style={styles.muted}>Last updated: December 16, 2025</p>

        <section style={styles.section}>
          <p>
            Reviews and ratings on Referee Insights are{" "}
            <strong>user-submitted opinions</strong>, not statements of fact.
          </p>
          <ul style={styles.ul}>
            <li>Referee Insights does not verify reviews.</li>
            <li>Reviews do not represent Referee Insights’ views.</li>
            <li>Reviews are not endorsements.</li>
          </ul>
          <p>
            Users should independently evaluate referees, leagues, tournaments,
            and events.
          </p>
        </section>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: { padding: "32px 16px" },
  container: { maxWidth: 900, margin: "0 auto", lineHeight: 1.6 },
  h1: { fontSize: 36, margin: "0 0 8px" },
  muted: { opacity: 0.7, marginTop: 0 },
  section: { marginTop: 18 },
  ul: { paddingLeft: 18 },
};
