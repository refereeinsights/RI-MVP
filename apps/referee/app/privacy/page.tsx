export const metadata = {
  title: "Privacy Policy | Referee Insights",
  description:
    "Referee Insights Privacy Policy describing what information we collect and how it is used.",
};

export default function PrivacyPage() {
  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <h1 style={styles.h1}>Privacy Policy</h1>
        <p style={styles.muted}>Last updated: December 16, 2025</p>

        <section style={styles.section}>
          <h2 style={styles.h2}>1. Information We Collect</h2>
          <ul style={styles.ul}>
            <li>Account information (such as email and username)</li>
            <li>User-submitted content (reviews, ratings, comments)</li>
            <li>Basic analytics and usage data (device/browser, pages visited)</li>
          </ul>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>2. How We Use Information</h2>
          <ul style={styles.ul}>
            <li>To operate and improve the platform</li>
            <li>To communicate with users (e.g., account-related emails)</li>
            <li>To maintain platform integrity and safety</li>
          </ul>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>3. Sharing</h2>
          <p>
            We do not sell personal data. We may share information with service
            providers (such as hosting and analytics) and to comply with legal
            obligations or enforce our policies.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>4. Data Retention</h2>
          <p>
            We retain information as needed to operate the platform, comply with
            legal requirements, and enforce our policies. You may request account
            deletion, subject to lawful retention needs.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>5. Contact</h2>
          <p>
            Questions about this policy? Contact us at{" "}
            <span style={{ fontWeight: 600 }}>support@refereeinsights.com</span>.
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
  h2: { fontSize: 20, margin: "20px 0 10px" },
  muted: { opacity: 0.7, marginTop: 0 },
  section: { marginTop: 18 },
  ul: { paddingLeft: 18 },
};
