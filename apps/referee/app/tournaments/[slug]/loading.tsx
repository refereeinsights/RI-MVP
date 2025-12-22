"use client";

export default function LoadingTournamentDetail() {
  return (
    <main className="pitchWrap tournamentsWrap">
      <section className="field tournamentsField">
        <div className="headerBlock">
          <div className="loading-bar" style={{ width: "40%", height: 18, marginBottom: 12 }} />
          <div className="loading-bar" style={{ width: "70%", height: 12, marginBottom: 16 }} />
          <div
            style={{
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.08)",
              background: "rgba(0,0,0,0.03)",
              minHeight: 160,
            }}
          />
        </div>
      </section>
    </main>
  );
}
