"use client";

export default function AdminError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="pitchWrap">
      <section className="field">
        <div className="headerBlock">
          <h1 className="title">Unable to load admin</h1>
          <p className="subtitle">
            {error?.message || "An unexpected error occurred while loading admin data."}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1rem",
              padding: "0.6rem 1.25rem",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "#0f172a",
              color: "#fff",
              fontWeight: 600,
            }}
          >
            Retry
          </button>
        </div>
      </section>
    </main>
  );
}
