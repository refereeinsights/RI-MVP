export const metadata = {
  title: "Terms of Service | Referee Insights",
  description:
    "Referee Insights Terms of Service for using the platform and submitting content.",
};

export default function TermsPage() {
  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <h1 style={styles.h1}>Terms of Service</h1>
        <p style={styles.muted}>Last updated: December 16, 2025</p>

        <section style={styles.section}>
          <h2 style={styles.h2}>1. Purpose of the Platform</h2>
          <p>
            Referee Insights (“RI,” “we,” “us,” or “our”) provides an informational
            platform that allows users to view, submit, and discuss reviews,
            ratings, and information related to sports officials, tournaments,
            leagues, and related events.
          </p>
          <p>
            RI is an <strong>information and opinion platform only</strong>. We
            do not assign officials, certify referees, employ users, operate
            sporting events, or control any venue, organization, or participant.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>2. Eligibility & Accounts</h2>
          <ul style={styles.ul}>
            <li>You must be at least 13 years old to use RI.</li>
            <li>
              You are responsible for maintaining the confidentiality of your
              account credentials.
            </li>
            <li>You are responsible for all activity under your account.</li>
          </ul>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>3. User-Generated Content (UGC)</h2>
          <p>
            RI allows users to submit content including reviews, ratings,
            comments, and other materials (“User Content”).
          </p>
          <p>By submitting User Content, you agree that:</p>
          <ul style={styles.ul}>
            <li>Your content reflects your personal opinion and experience.</li>
            <li>You are solely responsible for your content.</li>
            <li>
              Your content does not violate any law or third-party rights.
            </li>
          </ul>
          <p>
            RI does <strong>not verify</strong>, endorse, or guarantee the
            accuracy of User Content.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>4. Moderation & Removal</h2>
          <p>
            We reserve the right (but not the obligation) to remove or restrict
            content that violates these Terms, and to moderate content at our
            discretion, including removing content without notice.
          </p>
          <p>
            We are not obligated to remove content solely because it is negative,
            controversial, or disputed.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>5. No Employment, Agency, or Endorsement</h2>
          <p>
            Nothing on RI creates an employment, independent contractor, agency,
            partnership, or fiduciary relationship.
          </p>
          <p>
            RI does not endorse, certify, recommend, or guarantee the
            performance, conduct, or suitability of any referee, official, league,
            or tournament.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>6. Safety Disclaimer</h2>
          <p>
            RI does not control sporting events, venues, participants,
            spectators, or conditions. Sporting activities involve inherent
            risks. You assume all risks associated with reliance on information
            found on RI.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>7. Accuracy & Reliance Disclaimer</h2>
          <p>
            Information on RI may be incomplete, outdated, or inaccurate. You
            agree to independently verify critical information. RI is not
            responsible for losses, disputes, or damages resulting from reliance
            on platform content.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>8. Limitation of Liability</h2>
          <p>
            To the fullest extent permitted by law, RI shall not be liable for
            indirect, incidental, consequential, or punitive damages. RI’s total
            liability shall not exceed the amount you paid RI in the past 12
            months (if any).
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>9. Arbitration & Class Action Waiver</h2>
          <p>
            Any dispute arising from or relating to RI shall be resolved through
            binding arbitration, not in court. You waive the right to participate
            in class actions, class arbitrations, or representative proceedings.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>10. Governing Law</h2>
          <p>
            These Terms are governed by the laws of the State of Washington,
            without regard to conflict-of-law principles.
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
