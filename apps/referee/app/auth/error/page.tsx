import Link from "next/link";

type AuthErrorPageProps = {
  searchParams?: { notice?: string };
};

const NOTICE_LABEL: Record<string, string> = {
  auth_link_invalid: "This auth link is invalid.",
  auth_link_expired: "This auth link has expired.",
};

export default function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
  const notice = (searchParams?.notice ?? "").trim();
  const detail = NOTICE_LABEL[notice] ?? "This auth link is invalid or expired.";

  return (
    <main style={{ maxWidth: 560, margin: "3rem auto", padding: "0 1rem", display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0 }}>Link expired or invalid</h1>
      <p style={{ margin: 0, color: "#475569" }}>{detail}</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link
          href="/account/login"
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #0f172a",
            background: "#0f172a",
            color: "#fff",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Request a new link
        </Link>
        <Link
          href="/account"
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #cbd5e1",
            background: "#fff",
            color: "#0f172a",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Go to account
        </Link>
      </div>
    </main>
  );
}
