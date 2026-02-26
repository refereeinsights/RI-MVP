import Link from "next/link";

type AuthErrorPageProps = {
  searchParams?: {
    notice?: string;
  };
};

function messageForNotice(notice?: string): string {
  if (notice === "auth_link_expired") {
    return "This sign-in link has expired. Request a new link and try again.";
  }
  return "This link is invalid or has already been used. Request a new link and try again.";
}

export default function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
  const message = messageForNotice(searchParams?.notice);

  return (
    <main style={{ minHeight: "100svh", display: "grid", placeItems: "center", padding: 24 }}>
      <section
        style={{
          width: "100%",
          maxWidth: 560,
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 16,
          padding: 24,
          background: "rgba(11, 17, 32, 0.6)",
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: 10, fontSize: 28, fontWeight: 800 }}>
          Link expired or invalid
        </h1>
        <p style={{ marginTop: 0, marginBottom: 18, color: "rgba(255,255,255,0.86)" }}>{message}</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link
            href="/login"
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              background: "#0b5fff",
              color: "#fff",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            Request a new link
          </Link>
          <Link
            href="/account"
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.25)",
              color: "#fff",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            Go to account
          </Link>
        </div>
      </section>
    </main>
  );
}

