import ReferralCTA from "@/components/ReferralCTA";
import AdSlot from "@/components/AdSlot";

export default function Home() {
  return (
    <main
      style={{
        padding: "4rem 2rem",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <section
        style={{
          maxWidth: 960,
          width: "100%",
          textAlign: "center",
        }}
      >
        {/* Headline */}
        <h1
          style={{
            fontSize: "3rem",
            margin: 0,
            fontWeight: 700,
          }}
        >
          Referee-first transparency
        </h1>

        {/* Official slogan */}
        <p
          style={{
            marginTop: "0.75rem",
            fontSize: "0.875rem",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#333",
          }}
        >
          INSIGHT BEFORE YOU ACCEPT
        </p>

        {/* Supporting copy */}
        <p
          style={{
            maxWidth: 720,
            margin: "1.5rem auto 0",
            fontSize: "1.125rem",
            lineHeight: 1.6,
            color: "#333",
          }}
        >
          Referee Insights helps officials make smarter assignment decisions by
          providing transparency into tournaments, schools, and assignors —
          powered by real referee experiences and unbiased insight.
        </p>
        <p
          style={{
            maxWidth: 720,
            margin: "0.75rem auto 0",
            fontSize: "0.95rem",
            lineHeight: 1.6,
            color: "#333",
          }}
        >
          RefereeInsights is in public beta — features and data are evolving.
        </p>
        <p
          style={{
            maxWidth: 720,
            margin: "0.5rem auto 0",
            fontSize: "0.95rem",
            lineHeight: 1.6,
            color: "#333",
          }}
        >
          Assignor contact details are protected and only visible to registered
          users.
        </p>

        {/* Value props */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "1.5rem",
            marginTop: "3rem",
            textAlign: "left",
          }}
        >
          <div>
            <h3 style={{ marginBottom: "0.5rem" }}>Discover opportunities</h3>
            <p style={{ color: "#333" }}>
              Find tournaments and assignors with better visibility into what
              you’re accepting.
            </p>
          </div>

          <div>
            <h3 style={{ marginBottom: "0.5rem" }}>
              Rate tournaments & assignors
            </h3>
            <p style={{ color: "#333" }}>
              Share real experiences to help raise the standard across
              officiating.
            </p>
          </div>

          <div>
            <h3 style={{ marginBottom: "0.5rem" }}>
              Make informed decisions
            </h3>
            <p style={{ color: "#333" }}>
              Get insight on pay, organization, and professionalism before you
              commit.
            </p>
          </div>
        </div>

        <div style={{ marginTop: "3rem" }}>
          <ReferralCTA placement="home_referral" />
        </div>

        {/* Primary CTA */}
        <div style={{ marginTop: "3.5rem" }}>
          <a
            href="/referrals"
            style={{
              display: "inline-block",
              padding: "0.9rem 1.75rem",
              border: "2px solid #000",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontSize: "0.875rem",
            }}
          >
            Get your invite link
          </a>
        </div>

        <div style={{ marginTop: "3rem", display: "flex", justifyContent: "center" }}>
          <AdSlot placement="home_footer_banner" />
        </div>
      </section>
    </main>
  );
}
