"use client";

export default function LoadingTournaments() {
  return (
    <main className="pitchWrap tournamentsWrap">
      <section className="field tournamentsField">
        <div className="headerBlock">
          <div className="loading-bar" style={{ width: "50%", height: 16, marginBottom: 12 }} />
          <div className="loading-bar" style={{ width: "70%", height: 12, marginBottom: 20 }} />
          <div className="loading-card-grid">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                style={{
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.08)",
                  background: "rgba(0,0,0,0.03)",
                  minHeight: 120,
                }}
              />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
