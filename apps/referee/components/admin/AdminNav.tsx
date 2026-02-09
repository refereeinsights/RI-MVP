import Link from "next/link";
import type React from "react";

export function AdminNav() {
  const buildStamp = process.env.NEXT_PUBLIC_BUILD_ID ?? process.env.VERCEL_GIT_COMMIT_SHA;
  const buildShort = buildStamp ? buildStamp.slice(0, 7) : null;
  const linkStyle: React.CSSProperties = {
    padding: "6px 10px",
    borderRadius: 8,
    background: "#f3f4f6",
    color: "#111827",
    fontSize: 13,
    fontWeight: 700,
    textDecoration: "none",
    border: "1px solid #e5e7eb",
  };

  const wrapperStyle: React.CSSProperties = {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 16,
  };

  return (
    <div>
      <nav aria-label="Admin navigation" style={wrapperStyle}>
        <Link href="/admin" style={linkStyle}>
          Admin Home
        </Link>
        <Link href="/admin/tournaments/dashboard" style={linkStyle}>
          Tournaments dashboard
        </Link>
        <Link href="/admin/tournaments/sources" style={linkStyle}>
          Sources
        </Link>
        <Link href="/admin/assignors" style={linkStyle}>
          Assignors
        </Link>
        <Link href="/admin/assignors/review" style={linkStyle}>
          Assignors review
        </Link>
        <Link href="/admin/assignors/sources" style={linkStyle}>
          Assignors sources
        </Link>
        <Link href="/admin/venues" style={linkStyle}>
          Venues
        </Link>
        <Link href="/admin/owls-eye" style={linkStyle}>
          Owl&apos;s Eye
        </Link>
      </nav>
      {buildShort ? (
        <div style={{ fontSize: 11, color: "#6b7280", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Build {buildShort}
        </div>
      ) : null}
    </div>
  );
}

export default AdminNav;
