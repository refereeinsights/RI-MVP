import Link from "next/link";
import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { approveTournamentClaimForm, dismissTournamentClaimForm } from "./actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClaimEventRow = {
  tournament_id: string | null;
  event_type: string;
  entered_email: string | null;
  created_at: string;
  meta: any;
  tournament: {
    id: string;
    name: string | null;
    slug: string | null;
    city: string | null;
    state: string | null;
    tournament_director_email: string | null;
  } | null;
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function normalizeEmail(value: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function isOpenEventType(eventType: string) {
  return (
    eventType === "Tournament Claim Request Review" ||
    eventType === "Tournament Claim Failed Email Mismatch" ||
    eventType === "Tournament Claim Failed Missing Director Email"
  );
}

function isResolvedEventType(eventType: string) {
  return (
    eventType === "Tournament Claim Magic Link Sent" ||
    eventType === "Tournament Claim Authenticated" ||
    eventType === "Tournament Claim Admin Approved" ||
    eventType === "Tournament Claim Admin Dismissed"
  );
}

export default async function TournamentClaimsAdminPage({
  searchParams,
}: {
  searchParams?: { days?: string; mode?: string };
}) {
  await requireAdmin();

  const daysRaw = Number(searchParams?.days ?? "14");
  const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(90, daysRaw)) : 14;
  const mode = (searchParams?.mode ?? "open").trim().toLowerCase();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: rowsRaw, error } = await (supabaseAdmin.from("tournament_claim_events" as any) as any)
    .select(
      "tournament_id,event_type,entered_email,created_at,meta,tournament:tournaments(id,name,slug,city,state,tournament_director_email)"
    )
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (rowsRaw ?? []) as ClaimEventRow[];

  const byTournament = new Map<string, ClaimEventRow[]>();
  for (const row of rows) {
    const tid = row.tournament_id;
    if (!tid) continue;
    const list = byTournament.get(tid) ?? [];
    list.push(row);
    byTournament.set(tid, list);
  }

  const items = Array.from(byTournament.entries()).map(([tournamentId, list]) => {
    // list is already desc by created_at due to query order
    const tournament = list.find((r) => r.tournament)?.tournament ?? null;
    const latest = list[0] ?? null;
    const latestEnteredEmail = latest?.entered_email ?? null;
    const latestEventType = latest?.event_type ?? "";
    const mismatchCount = list.filter((r) => r.event_type === "Tournament Claim Failed Email Mismatch").length;
    const reviewCount = list.filter((r) => r.event_type === "Tournament Claim Request Review").length;
    const missingEmailCount = list.filter((r) => r.event_type === "Tournament Claim Failed Missing Director Email").length;
    const approvedCount = list.filter((r) => r.event_type === "Tournament Claim Admin Approved").length;
    const dismissedCount = list.filter((r) => r.event_type === "Tournament Claim Admin Dismissed").length;
    const resolved = list.some((r) => isResolvedEventType(r.event_type));
    const open = list.some((r) => isOpenEventType(r.event_type)) && !resolved;

    return {
      tournamentId,
      tournament,
      latest,
      latestEnteredEmail,
      latestEventType,
      mismatchCount,
      reviewCount,
      missingEmailCount,
      approvedCount,
      dismissedCount,
      open,
      resolved,
    };
  });

  const filtered = items.filter((item) => {
    if (mode === "all") return true;
    if (mode === "resolved") return item.resolved;
    return item.open;
  });

  const openCount = items.filter((i) => i.open).length;

  return (
    <main style={{ maxWidth: 1400, margin: "0 auto", padding: "1rem" }}>
      <AdminNav />

      <section style={{ display: "grid", gap: 10, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0 }}>Tournament Claims</h1>
            <p style={{ margin: "6px 0 0", color: "#475569" }}>
              Review claim attempts and manual review requests for TournamentInsights tournaments.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>Open: {openCount}</span>
            <Link
              href={`/admin/tournaments/claims?days=${days}&mode=open`}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                background: mode === "open" ? "#0f172a" : "#fff",
                color: mode === "open" ? "#fff" : "#0f172a",
                textDecoration: "none",
                fontWeight: 800,
                fontSize: 12,
              }}
            >
              Open
            </Link>
            <Link
              href={`/admin/tournaments/claims?days=${days}&mode=resolved`}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                background: mode === "resolved" ? "#0f172a" : "#fff",
                color: mode === "resolved" ? "#fff" : "#0f172a",
                textDecoration: "none",
                fontWeight: 800,
                fontSize: 12,
              }}
            >
              Resolved
            </Link>
            <Link
              href={`/admin/tournaments/claims?days=${days}&mode=all`}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                background: mode === "all" ? "#0f172a" : "#fff",
                color: mode === "all" ? "#fff" : "#0f172a",
                textDecoration: "none",
                fontWeight: 800,
                fontSize: 12,
              }}
            >
              All
            </Link>
            <form method="get" action="/admin/tournaments/claims" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="hidden" name="mode" value={mode} />
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, fontWeight: 800, color: "#64748b" }}>
                Days
                <input
                  name="days"
                  type="number"
                  min={1}
                  max={90}
                  defaultValue={days}
                  style={{ width: 80, padding: 8, borderRadius: 10, border: "1px solid #e2e8f0" }}
                />
              </label>
              <button
                type="submit"
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", fontWeight: 900 }}
              >
                Apply
              </button>
            </form>
          </div>
        </div>
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", background: "#f8fafc" }}>
                <th style={{ padding: "10px 12px", fontSize: 12, color: "#64748b" }}>Tournament</th>
                <th style={{ padding: "10px 12px", fontSize: 12, color: "#64748b" }}>On file</th>
                <th style={{ padding: "10px 12px", fontSize: 12, color: "#64748b" }}>Latest input</th>
                <th style={{ padding: "10px 12px", fontSize: 12, color: "#64748b" }}>Latest event</th>
                <th style={{ padding: "10px 12px", fontSize: 12, color: "#64748b" }}>Counts</th>
                <th style={{ padding: "10px 12px", fontSize: 12, color: "#64748b" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? (
                filtered.map((item) => {
                  const t = item.tournament;
                  const name = t?.name ?? "Unknown";
                  const slug = t?.slug ?? null;
                  const state = t?.state ?? "—";
                  const city = t?.city ?? "—";
                  const onFile = normalizeEmail(t?.tournament_director_email ?? null) || "—";
                  const latestInput = normalizeEmail(item.latestEnteredEmail) || "—";
                  const mismatchIcon = item.mismatchCount > 0 ? "⚠" : "";
                  const reviewIcon = item.reviewCount > 0 ? "✉" : "";

                  const editHref = slug
                    ? `/admin?tab=tournament-listings&q=${encodeURIComponent(slug)}#tournament-listings`
                    : `/admin?tab=tournament-listings&q=${encodeURIComponent(name)}#tournament-listings`;

                  return (
                    <tr key={item.tournamentId} style={{ borderTop: "1px solid #e5e7eb" }}>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ fontWeight: 900, display: "flex", alignItems: "center", gap: 8 }}>
                          <span title={item.mismatchCount > 0 ? "Has email mismatches" : undefined}>
                            {mismatchIcon}
                          </span>
                          <span title={item.reviewCount > 0 ? "Has review requests" : undefined}>
                            {reviewIcon}
                          </span>
                          <span>{name}</span>
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>
                          {city}, {state} • {item.tournamentId}
                        </div>
                        <div style={{ marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <a href={editHref} style={{ fontSize: 12, fontWeight: 900, color: "#1d4ed8", textDecoration: "none" }}>
                            Edit in admin
                          </a>
                          {slug ? (
                            <a
                              href={`https://www.tournamentinsights.com/tournaments/${slug}?claim=1`}
                              target="_blank"
                              rel="noreferrer"
                              style={{ fontSize: 12, fontWeight: 900, color: "#0f766e", textDecoration: "none" }}
                            >
                              Open TI page
                            </a>
                          ) : null}
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 12 }}>{onFile}</td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 12 }}>{latestInput}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ fontWeight: 800 }}>{item.latestEventType || "—"}</div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>{fmtDate(item.latest?.created_at ?? null)}</div>
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12 }}>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <span title="Mismatch events" style={{ color: item.mismatchCount ? "#b45309" : "#64748b", fontWeight: 900 }}>
                            mismatch {item.mismatchCount}
                          </span>
                          <span title="Request review events" style={{ color: item.reviewCount ? "#0369a1" : "#64748b", fontWeight: 900 }}>
                            review {item.reviewCount}
                          </span>
                          <span title="Missing director email on file" style={{ color: item.missingEmailCount ? "#b91c1c" : "#64748b", fontWeight: 900 }}>
                            missing {item.missingEmailCount}
                          </span>
                          <span title="Admin approvals" style={{ color: item.approvedCount ? "#047857" : "#64748b", fontWeight: 900 }}>
                            approved {item.approvedCount}
                          </span>
                          <span title="Admin dismissals" style={{ color: item.dismissedCount ? "#334155" : "#64748b", fontWeight: 900 }}>
                            dismissed {item.dismissedCount}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <form action={approveTournamentClaimForm}>
                            <input type="hidden" name="tournament_id" value={item.tournamentId} />
                            <input type="hidden" name="entered_email" value={latestInput === "—" ? "" : latestInput} />
                            <button
                              type="submit"
                              disabled={!latestInput || latestInput === "—"}
                              style={{
                                padding: "8px 10px",
                                borderRadius: 10,
                                border: "1px solid #86efac",
                                background: "#ecfdf5",
                                color: "#065f46",
                                fontWeight: 900,
                                cursor: latestInput && latestInput !== "—" ? "pointer" : "not-allowed",
                              }}
                              title="Sets tournaments.tournament_director_email to the latest entered email"
                            >
                              Approve
                            </button>
                          </form>
                          <form action={dismissTournamentClaimForm}>
                            <input type="hidden" name="tournament_id" value={item.tournamentId} />
                            <input type="hidden" name="entered_email" value={latestInput === "—" ? "" : latestInput} />
                            <input type="hidden" name="reason" value="admin_dismissed" />
                            <button
                              type="submit"
                              style={{
                                padding: "8px 10px",
                                borderRadius: 10,
                                border: "1px solid #e2e8f0",
                                background: "#fff",
                                color: "#0f172a",
                                fontWeight: 900,
                              }}
                            >
                              Dismiss
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} style={{ padding: "14px 12px", color: "#64748b" }}>
                    No claim events found in the last {days} days.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

