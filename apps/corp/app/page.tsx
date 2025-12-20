import Image from "next/image";
import Link from "next/link";

const featurePoints = [
  "Powers referee-first insight and reporting",
  "Centralizes tournament and organization data",
  "Emphasizes safety, clarity, and professionalism",
  "Designed for moderation and accountability",
];

const valueStrip = [
  "Trusted insight",
  "Moderated submissions",
  "Built for accountability",
];

export default function Home() {
  return (
    <main className="page">
      <section className="section hero">
        <div className="hero-content">
          <div className="logo-row">
            <Image
              src="/tournyx_logo_on_white.svg"
              alt="Tournyx"
              className="logo-mark"
              width={240}
              height={120}
              priority
            />
          </div>
          <h1 className="headline">Clarity for Competition.</h1>
          <p className="subhead">
            Tournyx builds insight-driven tools that help officials, organizers,
            and participants make better decisions around youth sports
            tournaments.
          </p>
          <div className="cta-row">
            <Link
              href="https://www.refereeinsights.com"
              className="button primary"
              prefetch={false}
            >
              Explore RefereeInsights
            </Link>
            <Link
              href="mailto:hello@tournyx.com"
              className="button ghost"
              prefetch={false}
            >
              Contact
            </Link>
          </div>
          <div className="value-strip">
            {valueStrip.map((item) => (
              <div key={item} className="value-pill">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">A platform built for trust and transparency</h2>
        <p className="muted">
          Tournyx connects the people closest to the game with the clarity they
          need to make confident decisions.
        </p>
        <div className="feature-grid">
          {featurePoints.map((point) => (
            <div key={point} className="feature-card">
              {point}
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Products</h2>
        <div className="product-card">
          <h3>RefereeInsights</h3>
          <p>
            A referee-first platform providing insight into tournaments,
            organizers, and on-site experience — so officials can decide before
            accepting.
          </p>
          <Link
            href="https://www.refereeinsights.com"
            className="button ghost"
            prefetch={false}
          >
            Visit RefereeInsights
          </Link>
        </div>
      </section>

      <section className="section philosophy">
        <h2 className="section-title">Our approach</h2>
        <p className="muted">
          Youth sports depend on trust. Tournyx is built on the belief that
          better decisions come from better information — delivered
          responsibly, moderated carefully, and shared by the people closest to
          the game.
        </p>
      </section>

      <footer className="section footer">
        <div>© Tournyx</div>
        <div className="footer-links">
          <Link href="https://www.refereeinsights.com/privacy" prefetch={false}>
            Privacy
          </Link>
          <Link href="https://www.refereeinsights.com/terms" prefetch={false}>
            Terms
          </Link>
        </div>
        <div className="muted">
          Tournyx is the platform behind RefereeInsights.
        </div>
      </footer>
    </main>
  );
}
