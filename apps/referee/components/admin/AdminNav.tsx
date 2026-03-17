import Link from "next/link";
import type React from "react";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function AdminNav() {
  const buildStamp =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
    process.env.NEXT_PUBLIC_BUILD_ID;
  const buildShort = buildStamp ? buildStamp.slice(0, 7) : null;
  const vercelEnv = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "";
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID ?? null;
  const deploymentShort = deploymentId ? deploymentId.replace(/^dpl_/, "").slice(0, 7) : null;
  const vercelRegion = process.env.VERCEL_REGION ?? "";
  const vercelUrl = process.env.VERCEL_URL ?? "";
  const overdueCutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  const { count: overdueKeepSourcesCount } = await supabaseAdmin
    .from("tournament_sources" as any)
    .select("id", { count: "exact", head: true })
    .eq("review_status", "keep")
    .or(`last_swept_at.is.null,last_swept_at.lt.${overdueCutoff}`);

  const claimCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: claimEventsRaw } = await (supabaseAdmin.from("tournament_claim_events" as any) as any)
    .select("tournament_id,event_type,created_at")
    .gte("created_at", claimCutoff)
    .in("event_type", [
      "Tournament Claim Request Review",
      "Tournament Claim Failed Email Mismatch",
      "Tournament Claim Failed Missing Director Email",
      "Tournament Claim Admin Approved",
      "Tournament Claim Admin Dismissed",
      "Tournament Claim Authenticated",
      "Tournament Claim Magic Link Sent",
    ])
    .order("created_at", { ascending: false })
    .limit(1000);

  const claimEvents = (claimEventsRaw ?? []) as Array<{
    tournament_id: string | null;
    event_type: string;
    created_at: string;
  }>;
  const claimByTournament = new Map<
    string,
    {
      latestOpenAt: string | null;
      latestOpenType: string | null;
      latestResolvedAt: string | null;
    }
  >();
  for (const ev of claimEvents) {
    if (!ev.tournament_id) continue;
    const current = claimByTournament.get(ev.tournament_id) ?? {
      latestOpenAt: null,
      latestOpenType: null,
      latestResolvedAt: null,
    };

    const isResolved =
      ev.event_type === "Tournament Claim Authenticated" ||
      ev.event_type === "Tournament Claim Magic Link Sent" ||
      ev.event_type === "Tournament Claim Admin Approved" ||
      ev.event_type === "Tournament Claim Admin Dismissed";
    const isOpen =
      ev.event_type === "Tournament Claim Request Review" ||
      ev.event_type === "Tournament Claim Failed Missing Director Email" ||
      ev.event_type === "Tournament Claim Failed Email Mismatch";

    if (isResolved && !current.latestResolvedAt) current.latestResolvedAt = ev.created_at;
    if (isOpen && !current.latestOpenAt) {
      current.latestOpenAt = ev.created_at;
      current.latestOpenType = ev.event_type;
    }

    claimByTournament.set(ev.tournament_id, current);
  }

  const openClaimTournamentIds = Array.from(claimByTournament.entries())
    .filter(([, v]) => v.latestOpenAt && (!v.latestResolvedAt || v.latestOpenAt > v.latestResolvedAt))
    .map(([id]) => id);
  const openClaimCount = openClaimTournamentIds.length;
  const openClaimMismatchCount = Array.from(claimByTournament.values()).filter(
    (v) =>
      v.latestOpenAt &&
      (!v.latestResolvedAt || v.latestOpenAt > v.latestResolvedAt) &&
      v.latestOpenType === "Tournament Claim Failed Email Mismatch"
  ).length;
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
  const tiAdminLinkStyle: React.CSSProperties = {
    ...linkStyle,
    background: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)",
    color: "#ffffff",
    border: "1px solid #1d4ed8",
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
        <Link href="/admin/tournaments/validation" style={linkStyle}>
          Sport validation
        </Link>
        <Link href="/admin/tournaments/claims" style={linkStyle}>
          Claims
          {openClaimCount > 0 ? (
            <span
              style={{
                marginLeft: 6,
                minWidth: 16,
                height: 16,
                borderRadius: 999,
                background: openClaimMismatchCount > 0 ? "#b45309" : "#0f172a",
                color: "#fff",
                fontSize: 10,
                fontWeight: 900,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 5px",
                verticalAlign: "middle",
              }}
              title={
                openClaimMismatchCount > 0
                  ? `${openClaimCount} open claim item${openClaimCount === 1 ? "" : "s"} (${openClaimMismatchCount} mismatch)`
                  : `${openClaimCount} open claim item${openClaimCount === 1 ? "" : "s"}`
              }
            >
              {openClaimMismatchCount > 0 ? "!" : openClaimCount}
            </span>
          ) : null}
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
        <Link href="/admin/ti" style={tiAdminLinkStyle}>
          TI Admin
        </Link>
      </nav>
      {buildShort ? (
        <div
          style={{ fontSize: 11, color: "#6b7280", letterSpacing: "0.08em", textTransform: "uppercase" }}
          title={[
            buildStamp ? `commit: ${buildStamp}` : null,
            vercelEnv ? `env: ${vercelEnv}` : null,
            deploymentId ? `deployment: ${deploymentId}` : null,
            vercelRegion ? `region: ${vercelRegion}` : null,
            vercelUrl ? `url: ${vercelUrl}` : null,
          ]
            .filter(Boolean)
            .join("\n")}
        >
          Build {buildShort}
          {vercelEnv ? ` • ${vercelEnv}` : ""}
          {deploymentShort ? ` • dpl ${deploymentShort}` : ""}
        </div>
      ) : null}
    </div>
  );
}

export default AdminNav;
