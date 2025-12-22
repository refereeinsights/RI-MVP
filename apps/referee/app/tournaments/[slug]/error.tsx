"use client";

export default function TournamentDetailError({ error }: { error: Error }) {
  return (
    <main className="pitchWrap tournamentsWrap">
      <section className="field tournamentsField">
        <div className="headerBlock">
          <h1 className="title">Tournament Insights</h1>
          <p className="subtitle">We couldn’t load this tournament. Please try again shortly.</p>
          {process.env.NODE_ENV === "development" && error?.message ? (
            <p className="subtitle">
              <code>{error.message}</code>
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
