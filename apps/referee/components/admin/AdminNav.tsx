import Link from "next/link";
import type React from "react";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function AdminNav() {
  const buildStamp = process.env.NEXT_PUBLIC_BUILD_ID ?? process.env.VERCEL_GIT_COMMIT_SHA;
  const buildShort = buildStamp ? buildStamp.slice(0, 7) : null;
  const overdueCutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  const { count: overdueKeepSourcesCount } = await supabaseAdmin
    .from("tournament_sources" as any)
    .select("id", { count: "exact", head: true })
    .eq("review_status", "keep")
    .or(`last_swept_at.is.null,last_swept_at.lt.${overdueCutoff}`);
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
        <Link href="/admin/outreach" style={linkStyle}>
          Outreach
        </Link>
        <Link href="/admin/tournaments/staff-verification-queue" style={linkStyle}>
          Staff verification
        </Link>
        <Link href="/admin/tournaments/sources" style={linkStyle}>
          Sources
          {overdueKeepSourcesCount && overdueKeepSourcesCount > 0 ? (
            <span
              style={{
                marginLeft: 6,
                minWidth: 16,
                height: 16,
                borderRadius: 999,
                background: "#991b1b",
                color: "#fff",
                fontSize: 10,
                fontWeight: 900,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 5px",
                verticalAlign: "middle",
              }}
              title={`${overdueKeepSourcesCount} keep source${overdueKeepSourcesCount === 1 ? "" : "s"} overdue for sweep`}
            >
              {overdueKeepSourcesCount}
            </span>
          ) : null}
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
