"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
      }}
    >
      <div
        style={{
          maxWidth: 540,
          width: "100%",
          background: "rgba(255,255,255,0.9)",
          borderRadius: 16,
          padding: "1.75rem",
          boxShadow: "0 10px 28px rgba(0,0,0,0.12)",
        }}
      >
        <h1 style={{ marginTop: 0 }}>Something went wrong</h1>
        <p style={{ marginBottom: "1rem", lineHeight: 1.6 }}>
          We couldn&apos;t load this page. If it keeps happening, please try again or report it.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            padding: "0.75rem 1.25rem",
            borderRadius: 10,
            border: "none",
            background: "#0f3d2e",
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
        {process.env.NODE_ENV === "development" && error?.message ? (
          <pre
            style={{
              marginTop: "1rem",
              padding: "0.75rem",
              background: "#f5f5f5",
              borderRadius: 8,
              fontSize: 12,
              whiteSpace: "pre-wrap",
              color: "#333",
            }}
          >
            {error.message}
          </pre>
        ) : null}
      </div>
    </main>
  );
}
