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
        <p style={styles.muted}>Last updated: February 2026</p>

        <section style={styles.section}>
          <h2 style={styles.h2}>1. Information We Collect</h2>
          <p>We collect information that helps us operate and improve Referee Insights, including:</p>
          <ul style={styles.ul}>
            <li>Account details (email, username)</li>
            <li>User-submitted content (reviews, ratings, comments)</li>
            <li>Basic usage data such as device type, browser, and pages visited</li>
          </ul>
          <p>
            We use a privacy-focused analytics tool (Plausible) to understand general site activity
            (e.g., unique visits, top pages). Plausible is configured in a way that does not use
            cookies or collect personal data about individuals.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>2. How We Use Information</h2>
          <p>We use the data we collect to:</p>
          <ul style={styles.ul}>
            <li>Operate and improve the platform</li>
            <li>Communicate with users (account-related messages)</li>
            <li>Maintain platform safety and integrity</li>
          </ul>
          <p>Analytics data is never used to create personal user profiles or track individuals.</p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>3. Sharing and Disclosure</h2>
          <p>
            We do not sell personal data to third parties. We may share information with trusted
            service providers (such as hosting and analytics) who support the platform and are bound
            to protect your data.
          </p>
          <p>We may also disclose information when required by law or to enforce our policies.</p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>4. Data Retention</h2>
          <p>
            We retain data as long as necessary to operate the platform, comply with legal
            requirements, and enforce our policies. You may request deletion of your account data in
            accordance with applicable laws.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>5. Contact</h2>
          <p>
            If you have questions about this policy or your data, please email:{" "}
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
