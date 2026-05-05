import Link from "next/link";

import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

import { bulkDeleteTournamentsFromQuality, deleteTournamentFromQuality, setTournamentQualityFlagStatus } from "./actions";

export const runtime = "nodejs";

type PageProps = {
  searchParams?: {
    status?: string;
    notice?: string;
  };
};

type FlagRow = {
  id: string;
  tournament_id: string;
  flag_type: string | null;
  severity: string | null;
  reason: string | null;
  detected_value: any;
  status: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  resolution_notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type TournamentRow = {
  id: string;
  slug: string | null;
  name: string | null;
  sport: string | null;
  city: string | null;
  state: string | null;
  start_date: string | null;
  end_date: string | null;
  source_url: string | null;
  official_website_url: string | null;
};

function durationDaysExclusive(startDate: string | null, endDate: string | null) {
  if (!startDate || !endDate) return null;
  const a = new Date(`${startDate}T00:00:00Z`).getTime();
  const b = new Date(`${endDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

function asStatus(raw: string | undefined) {
  const v = (raw ?? "").trim();
  if (!v) return "open";
  const allowed = new Set(["open", "closed_validated", "closed_fixed", "closed_duplicate"]);
  return allowed.has(v) ? v : "open";
}

function statusPill(status: string) {
  const bg =
    status === "open"
      ? "#fde68a"
      : status === "closed_fixed"
        ? "#bbf7d0"
        : status === "closed_validated"
          ? "#bfdbfe"
          : "#e5e7eb";
  const color = "#111827";
  return (
    <span style={{ fontSize: 12, fontWeight: 900, padding: "2px 8px", borderRadius: 999, background: bg, color }}>
      {status}
    </span>
  );
}

export default async function TiQualityPage({ searchParams }: PageProps) {
  await requireAdmin();

  const status = asStatus(searchParams?.status);
  const notice = (searchParams?.notice ?? "").trim();

  const flagsRes = await supabaseAdmin
    .from("tournament_quality_flags" as any)
    .select("id,tournament_id,flag_type,severity,reason,detected_value,status,reviewed_by,reviewed_at,resolution_notes,created_at,updated_at")
    .eq("status", status)
    .order("updated_at", { ascending: false })
    .limit(250);
  if (flagsRes.error) throw flagsRes.error;
  const flags: FlagRow[] = (flagsRes.data ?? []) as any;

  const tournamentIds = Array.from(new Set(flags.map((f) => f.tournament_id).filter(Boolean)));
  const tournamentsById = new Map<string, TournamentRow>();
  if (tournamentIds.length) {
    const tRes = await supabaseAdmin
      .from("tournaments" as any)
      .select("id,slug,name,sport,city,state,start_date,end_date,source_url,official_website_url")
      .in("id", tournamentIds);
    if (tRes.error) throw tRes.error;
    for (const row of (tRes.data ?? []) as any[]) {
      tournamentsById.set(String(row.id), row as TournamentRow);
    }
  }

  const title = "TI Quality Flags";

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 10 }}>{title}</h1>
      <div style={{ marginBottom: 12 }}>
        <AdminNav />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <Link href="/admin" className="cta secondary" style={{ padding: "8px 12px" }}>
          ← Back to Admin
        </Link>
        <Link href="/admin/ti/outbound" className="cta secondary" style={{ padding: "8px 12px" }}>
          Outbound →
        </Link>
        <Link href="/admin/ti/revenue" className="cta secondary" style={{ padding: "8px 12px" }}>
          Revenue →
        </Link>
        <Link href="/admin/ti/clicks" className="cta secondary" style={{ padding: "8px 12px" }}>
          Clicks →
        </Link>
      </div>

      {notice ? (
        <div
          style={{
            border: "1px solid #fde68a",
            background: "#fffbeb",
            color: "#92400e",
            fontWeight: 900,
            borderRadius: 14,
            padding: "10px 12px",
            marginBottom: 12,
          }}
        >
          {notice}
        </div>
      ) : null}

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          background: "#fff",
          padding: 14,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 900, textTransform: "uppercase" }}>Filters</div>
        <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {["open", "closed_validated", "closed_fixed", "closed_duplicate"].map((s) => (
            <Link
              key={s}
              href={`/admin/ti/quality?status=${encodeURIComponent(s)}`}
              className="cta secondary"
              style={{
                padding: "6px 10px",
                borderColor: status === s ? "#111827" : undefined,
                color: "#111827",
                fontWeight: 900,
              }}
            >
              {s}
            </Link>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280", fontWeight: 800 }}>
          Flags are review-only. No date edits happen here; deletes require explicit confirmation.
        </div>
      </div>

      <form
        id="bulkDeleteTournaments"
        action={bulkDeleteTournamentsFromQuality}
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          background: "#fff",
          padding: 12,
          marginBottom: 12,
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <input type="hidden" name="status" value={status} />
        <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 900, textTransform: "uppercase" }}>Bulk actions</div>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, color: "#6b7280", fontWeight: 900 }}>
          <input type="checkbox" name="confirm_delete" />
          Confirm delete
        </label>
        <button type="submit" className="cta secondary" style={{ padding: "6px 10px", borderColor: "#fecaca", color: "#b91c1c", fontWeight: 950 }}>
          Delete selected tournaments
        </button>
        <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>
          Selected rows are deleted via the existing safe-delete helper. Venues remain.
        </div>
      </form>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              <th style={{ width: 44, textAlign: "left", fontSize: 12, color: "#6b7280", padding: "10px 8px" }}>Sel</th>
              <th style={{ textAlign: "left", fontSize: 12, color: "#6b7280", padding: "10px 8px" }}>Tournament</th>
              <th style={{ textAlign: "left", fontSize: 12, color: "#6b7280", padding: "10px 8px" }}>Flag</th>
              <th style={{ textAlign: "left", fontSize: 12, color: "#6b7280", padding: "10px 8px" }}>Dates</th>
              <th style={{ textAlign: "right", fontSize: 12, color: "#6b7280", padding: "10px 8px" }}>Δ days</th>
              <th style={{ textAlign: "left", fontSize: 12, color: "#6b7280", padding: "10px 8px" }}>Reason</th>
              <th style={{ textAlign: "left", fontSize: 12, color: "#6b7280", padding: "10px 8px" }}>Status</th>
              <th style={{ textAlign: "left", fontSize: 12, color: "#6b7280", padding: "10px 8px" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {flags.map((f) => {
              const t = tournamentsById.get(f.tournament_id);
              const dur = durationDaysExclusive(t?.start_date ?? null, t?.end_date ?? null);
              const publicHref = t?.slug ? `/tournaments/${t.slug}` : null;

              return (
                <tr key={f.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "10px 8px" }}>
                    <input form="bulkDeleteTournaments" type="checkbox" name="tournament_id" value={f.tournament_id} />
                  </td>
                  <td style={{ padding: "10px 8px", minWidth: 320 }}>
                    <div style={{ fontWeight: 950, color: "#111" }}>{t?.name ?? "Unknown tournament"}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>
                      {(t?.sport ?? "—") + " • " + [t?.city, t?.state].filter(Boolean).join(", ")}
                    </div>
                    {publicHref ? (
                      <div style={{ marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <Link href={publicHref} className="cta secondary" style={{ padding: "6px 10px" }}>
                          Open tournament →
                        </Link>
                      </div>
                    ) : null}
                  </td>

                  <td style={{ padding: "10px 8px", fontWeight: 900, color: "#111" }}>{f.flag_type ?? "—"}</td>

                  <td style={{ padding: "10px 8px", fontSize: 13, color: "#111" }}>
                    <div>
                      <span style={{ fontWeight: 900 }}>Start:</span> {t?.start_date ?? "—"}
                    </div>
                    <div>
                      <span style={{ fontWeight: 900 }}>End:</span> {t?.end_date ?? "—"}
                    </div>
                  </td>

                  <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 950 }}>{dur ?? "—"}</td>

                  <td style={{ padding: "10px 8px", fontSize: 13, color: "#111", minWidth: 260 }}>
                    <div style={{ fontWeight: 800 }}>{f.reason ?? "—"}</div>
                    <div style={{ marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {t?.source_url ? (
                        <a href={t.source_url} target="_blank" rel="noopener noreferrer" className="cta secondary" style={{ padding: "6px 10px" }}>
                          Source ↗
                        </a>
                      ) : null}
                      {t?.official_website_url ? (
                        <a
                          href={t.official_website_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="cta secondary"
                          style={{ padding: "6px 10px" }}
                        >
                          Official ↗
                        </a>
                      ) : null}
                    </div>
                  </td>

                  <td style={{ padding: "10px 8px", minWidth: 140 }}>{statusPill(String(f.status ?? "open"))}</td>

                  <td style={{ padding: "10px 8px", minWidth: 280 }}>
                    <details style={{ border: "1px solid #f3f4f6", borderRadius: 12, padding: 10, background: "#fafafa" }}>
                      <summary style={{ cursor: "pointer", fontWeight: 950, color: "#111", listStyle: "none" }}>
                        Review / resolve
                      </summary>
                      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                        <form action={setTournamentQualityFlagStatus} style={{ display: "grid", gap: 8 }}>
                          <input type="hidden" name="flag_id" value={f.id} />
                          <textarea
                            name="resolution_notes"
                            defaultValue={f.resolution_notes ?? ""}
                            placeholder="Resolution notes (optional)"
                            style={{
                              width: "100%",
                              minHeight: 54,
                              border: "1px solid #e5e7eb",
                              borderRadius: 10,
                              padding: 8,
                              fontSize: 13,
                            }}
                          />
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button type="submit" name="status" value="closed_validated" className="cta secondary" style={{ padding: "6px 10px" }}>
                              Close validated
                            </button>
                            <button type="submit" name="status" value="closed_fixed" className="cta secondary" style={{ padding: "6px 10px" }}>
                              Close fixed
                            </button>
                            <button type="submit" name="status" value="closed_duplicate" className="cta secondary" style={{ padding: "6px 10px" }}>
                              Close duplicate
                            </button>
                            <button type="submit" name="status" value="open" className="cta secondary" style={{ padding: "6px 10px" }}>
                              Reopen
                            </button>
                          </div>
                        </form>

                        <form action={deleteTournamentFromQuality} style={{ display: "grid", gap: 8 }}>
                          <input type="hidden" name="status" value={status} />
                          <input type="hidden" name="tournament_id" value={f.tournament_id} />
                          <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, color: "#6b7280", fontWeight: 900 }}>
                            <input type="checkbox" name="confirm_delete" />
                            Confirm delete
                          </label>
                          <button
                            type="submit"
                            className="cta secondary"
                            style={{ padding: "6px 10px", borderColor: "#fecaca", color: "#b91c1c", fontWeight: 950 }}
                          >
                            Delete this tournament
                          </button>
                          <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>
                            Deletes the tournament row; venues remain.
                          </div>
                        </form>
                      </div>
                    </details>
                  </td>
                </tr>
              );
            })}

            {flags.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: "14px 8px", color: "#6b7280", fontWeight: 800 }}>
                  No flags found for status: {status}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
