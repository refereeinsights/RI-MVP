export default function HomePage() {
  return (
    <main className="landingShell">
      <section className="landingCard" aria-labelledby="corralio-title">
        <div className="brandRow" aria-label="Corralio">
          <span className="brandMark" aria-hidden="true">
            C
          </span>
          <span className="brandName">Corralio</span>
        </div>

        <div className="launchBadge">Pilot coming soon</div>

        <div className="messageBlock">
          <h1 id="corralio-title">The planner built for sports families.</h1>
          <p className="promise">Every kid. Every team. One plan.</p>
          <p className="supportingCopy">Corral your sports chaos.</p>
        </div>

        <div className="accentRule" aria-hidden="true">
          <span />
          <span />
        </div>
      </section>
    </main>
  );
}
