import Link from "next/link";
import type React from "react";

export function AdminNav() {
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
    <nav aria-label="Admin navigation" style={wrapperStyle}>
      <Link href="/admin" style={linkStyle}>
        Admin Home
      </Link>
      <Link href="/admin/venues" style={linkStyle}>
        Venues
      </Link>
      <Link href="/admin/owls-eye" style={linkStyle}>
        Owl&apos;s Eye
      </Link>
    </nav>
  );
}

export default AdminNav;
