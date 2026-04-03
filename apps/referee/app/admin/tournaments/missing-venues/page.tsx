import Link from "next/link";
import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import DeepScanButton from "./DeepScanButton";
import BulkDeepScanButton from "./BulkDeepScanButton";
import USClubSoccerUrlButton from "./USClubSoccerUrlButton";

export const runtime = "nodejs";

type SearchParams = {
  page?: string;
  q?: string;
  state?: string;
  status?: string;
};

type TournamentRow = {
  id: string;
  name: string | null;
  slug: string | null;
  city: string | null;
  state: string | null;
  start_date: string | null;
  official_website_url: string | null;
  source_url: string | null;
  status?: string | null;
  is_canonical?: boolean | null;
  total_count?: number | null;
};

type AttrCandidate = {
  tournament_id: string | null;
  attribute_key: string | null;
  attribute_value: string | null;
  confidence: number | null;
  source_url: string | null;
  created_at: string | null;
};

type VenueCandidate = {
  tournament_id: string | null;
  venue_name: string | null;
  address_text: string | null;
  venue_url: string | null;
  evidence_text: string | null;
  confidence: number | null;
  source_url: string | null;
  created_at: string | null;
};

const VENUE_REASON_CODES = new Set([
  "jsonld_location",
  "anchor_full_address",
  "page_text_address",
  "map_link",
  "provider_perfectgame_locations",
  "unknown",
]);

function reasonFromEvidence(evidence: string | null | undefined): string | null {
  const text = String(evidence ?? "").trim();
  if (!text) return null;
  const m = text.match(/^reason=([a-z0-9_]+)\s*;/i);
  if (!m?.[1]) return null;
  const code = m[1].toLowerCase();
  return VENUE_REASON_CODES.has(code) ? code : null;
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function clean(value: string | null | undefined) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : null;
}

function trunc(value: string | null, max = 80) {
  if (!value) return "—";
  const v = value.trim();
  if (v.length <= max) return v;
  return `${v.slice(0, max - 1)}…`;
}

export default async function MissingVenuesPage({ searchParams }: { searchParams?: SearchParams }) {
  await requireAdmin();

  const page = Math.max(1, Number(searchParams?.page ?? "1") || 1);
  const q = (searchParams?.q ?? "").trim();
  const state = (searchParams?.state ?? "").trim().toUpperCase();
  const tournamentStatusRaw = (searchParams?.status ?? "published").trim().toLowerCase();
  const tournamentStatus = tournamentStatusRaw === "draft" ? "draft" : "published";

  const pageSize = 50;
  const offset = (page - 1) * pageSize;
  const missingRes = await (supabaseAdmin as any).rpc("list_missing_venue_link_tournaments_v2", {
    p_limit: pageSize,
    p_offset: offset,
    p_state: state || null,
    p_q: q || null,
    p_status: tournamentStatus,
  });

  if (missingRes.error) {
    return (
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "1rem" }}>
        <AdminNav />
        <h1 style={{ marginTop: 12 }}>Missing Venues</h1>
        <p style={{ color: "#b91c1c" }}>Failed to load tournaments: {missingRes.error.message}</p>
      </main>
    );
  }

  const rows = ((missingRes.data ?? []) as TournamentRow[]).filter((r) => r?.id);
  let count = Number(rows[0]?.total_count ?? 0) || 0;
  if (!rows.length) {
    const countRes = await (supabaseAdmin as any).rpc("list_missing_venue_link_tournaments_v2", {
      p_limit: 1,
      p_offset: 0,
      p_state: state || null,
      p_q: q || null,
      p_status: tournamentStatus,
    });
    if (!countRes.error) {
      const countRows = (countRes.data ?? []) as TournamentRow[];
      count = Number(countRows[0]?.total_count ?? 0) || 0;
    }
  }
  const totalPages = count ? Math.max(1, Math.ceil(count / pageSize)) : 1;
  const tournamentIds = rows.map((r) => r.id);

  const [attrCandidatesResp, venueCandidatesResp] = await Promise.all([
    tournamentIds.length
      ? supabaseAdmin
          .from("tournament_attribute_candidates" as any)
          .select("tournament_id,attribute_key,attribute_value,confidence,source_url,created_at")
          .is("accepted_at", null)
          .is("rejected_at", null)
          .in("attribute_key", ["address", "venue_url"])
          .in("tournament_id", tournamentIds)
          .limit(5000)
      : Promise.resolve({ data: [] as any[] } as any),
    tournamentIds.length
      ? supabaseAdmin
          .from("tournament_venue_candidates" as any)
          .select("tournament_id,venue_name,address_text,venue_url,evidence_text,confidence,source_url,created_at")
          .is("accepted_at", null)
          .is("rejected_at", null)
          .in("tournament_id", tournamentIds)
          .limit(5000)
      : Promise.resolve({ data: [] as any[] } as any),
  ]);

  const bestAttrByTournament = new Map<string, { address?: AttrCandidate; venue_url?: AttrCandidate }>();
  for (const row of ((attrCandidatesResp.data ?? []) as AttrCandidate[]).filter((r) => r.tournament_id && r.attribute_key)) {
    const tid = String(row.tournament_id);
    const key = String(row.attribute_key);
    const current = bestAttrByTournament.get(tid) ?? {};
    const existing = (current as any)[key] as AttrCandidate | undefined;
    const existingScore = existing?.confidence ?? -1;
    const nextScore = row.confidence ?? 0;
    if (!existing || nextScore > existingScore) {
      (current as any)[key] = row;
      bestAttrByTournament.set(tid, current);
    }
  }

  const bestVenueByTournament = new Map<string, VenueCandidate>();
  for (const row of ((venueCandidatesResp.data ?? []) as VenueCandidate[]).filter((r) => r.tournament_id)) {
    const tid = String(row.tournament_id);
    const existing = bestVenueByTournament.get(tid);
    const existingScore = existing?.confidence ?? -1;
    const nextScore = row.confidence ?? 0;
    if (!existing || nextScore > existingScore) bestVenueByTournament.set(tid, row);
  }
  const paramsBase = new URLSearchParams();
  if (q) paramsBase.set("q", q);
  if (state) paramsBase.set("state", state);
  if (tournamentStatus !== "published") paramsBase.set("status", tournamentStatus);
  const exportHref = `/api/admin/tournaments/missing-venues/export${paramsBase.toString() ? `?${paramsBase.toString()}` : ""}`;

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "1rem" }}>
      <AdminNav />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Missing Venues</h1>
          <p style={{ margin: "6px 0 0", color: "#475569" }}>
            {tournamentStatus === "draft" ? (
              <>
                Draft tournaments (uploads queue) missing confirmed venue links (no <code>tournament_venues</code> rows with{" "}
                <code>is_inferred=false</code>). Run deep scan to extract venue/address candidates with confidence.
              </>
            ) : (
              <>
                Published canonical tournaments missing venue links (no <code>tournament_venues</code> rows with{" "}
                <code>is_inferred=false</code>). Run deep scan to extract venue/address candidates with confidence.
              </>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {tournamentStatus === "published" ? <USClubSoccerUrlButton limit={400} /> : null}
          <BulkDeepScanButton initialLimit={50} total={count} tournamentStatus={tournamentStatus} />
          <a
            href={exportHref}
            style={{
              textDecoration: "none",
              padding: "10px 14px",
              borderRadius: 10,
              background: "#ffffff",
              color: "#0f3d2e",
              fontWeight: 800,
              fontSize: 14,
              border: "1px solid #0f3d2e",
            }}
          >
            Export CSV
          </a>
          <Link
            href="/admin/tournaments/enrichment"
            style={{
              textDecoration: "none",
              padding: "10px 14px",
              borderRadius: 10,
              background: "#ffffff",
              color: "#1d4ed8",
              fontWeight: 800,
              fontSize: 14,
              border: "1px solid #93c5fd",
            }}
          >
            Open enrichment queue
          </Link>
        </div>
      </div>

      <form method="get" style={{ display: "flex", gap: 8, margin: "14px 0 12px", flexWrap: "wrap" }}>
        <input name="q" defaultValue={q} placeholder="Search tournament name" style={{ padding: 8, minWidth: 260 }} />
        <input
          name="state"
          defaultValue={state}
          placeholder="State (e.g. WA)"
          style={{ padding: 8, width: 140 }}
        />
        <select name="status" defaultValue={tournamentStatus} style={{ padding: 8, width: 170 }}>
          <option value="published">Published backlog</option>
          <option value="draft">Draft uploads</option>
        </select>
        <button type="submit" style={{ padding: "8px 12px" }}>
          Filter
        </button>
        <Link href="/admin/tournaments/missing-venues" style={{ alignSelf: "center" }}>
          Clear
        </Link>
        <span style={{ alignSelf: "center", color: "#475569", fontSize: 12 }}>
          {count ?? 0} total • page {Math.min(page, totalPages)} / {totalPages}
        </span>
      </form>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", background: "#f8fafc" }}>
                <th style={{ padding: "10px 12px", fontSize: 12, color: "#64748b" }}>Tournament</th>
                <th style={{ padding: "10px 12px", fontSize: 12, color: "#64748b" }}>Location</th>
                <th style={{ padding: "10px 12px", fontSize: 12, color: "#64748b" }}>URL</th>
                <th style={{ padding: "10px 12px", fontSize: 12, color: "#64748b" }}>Current candidates</th>
                <th style={{ padding: "10px 12px", fontSize: 12, color: "#64748b" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const url = clean(t.official_website_url) ?? clean(t.source_url);
                const title = t.name ?? t.slug ?? t.id;
                const loc = [t.city, t.state].filter(Boolean).join(", ") || "—";
                const bestAttr = bestAttrByTournament.get(t.id) ?? {};
                const bestVenue = bestVenueByTournament.get(t.id) ?? null;
                const addressCandidate = (bestAttr as any).address as AttrCandidate | undefined;
                const venueUrlCandidate = (bestAttr as any).venue_url as AttrCandidate | undefined;

                const venuesSearch = new URLSearchParams();
                venuesSearch.set("q", [t.name ?? "", t.city ?? "", t.state ?? ""].filter(Boolean).join(" "));

                return (
                  <tr key={t.id} style={{ borderTop: "1px solid #e5e7eb", verticalAlign: "top" }}>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "grid", gap: 4 }}>
                        <div style={{ fontWeight: 900 }}>
                          {url ? (
                            <a href={url} target="_blank" rel="noreferrer" style={{ color: "#111827", textDecoration: "none" }}>
                              {title}
                            </a>
                          ) : (
                            title
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>{t.id}</div>
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{loc}</td>
                    <td style={{ padding: "10px 12px", maxWidth: 360 }}>
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8", textDecoration: "none" }}>
                          {trunc(url, 60)}
                        </a>
                      ) : (
                        <span style={{ color: "#64748b" }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 12px", maxWidth: 360 }}>
                      <div style={{ display: "grid", gap: 6 }}>
                        <div style={{ fontSize: 12, color: "#111827" }}>
                          <strong>Venue:</strong>{" "}
                          {bestVenue ? (
                            <>
                              {trunc(bestVenue.venue_name, 44)} ({(bestVenue.confidence ?? 0).toFixed(2)})
                              <span
                                style={{
                                  marginLeft: 8,
                                  fontSize: 11,
                                  padding: "1px 6px",
                                  borderRadius: 999,
                                  border: "1px solid #e5e7eb",
                                  background: "#f8fafc",
                                  color: "#334155",
                                  fontWeight: 700,
                                }}
                                title={reasonFromEvidence(bestVenue.evidence_text) ?? "unknown"}
                              >
                                {(reasonFromEvidence(bestVenue.evidence_text) ?? "unknown").replaceAll("_", " ")}
                              </span>
                              {hasText(bestVenue.venue_url) ? (
                                <>
                                  {" "}
                                  <a
                                    href={bestVenue.venue_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ color: "#1d4ed8", textDecoration: "none" }}
                                    title="Open venue map image"
                                  >
                                    (map)
                                  </a>
                                </>
                              ) : null}
                            </>
                          ) : (
                            "—"
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: "#111827" }}>
                          <strong>Address:</strong>{" "}
                          {addressCandidate
                            ? `${trunc(addressCandidate.attribute_value, 44)} (${(addressCandidate.confidence ?? 0).toFixed(2)})`
                            : "—"}
                        </div>
                        <div style={{ fontSize: 12, color: "#111827" }}>
                          <strong>Venue URL:</strong>{" "}
                          {venueUrlCandidate
                            ? `${trunc(venueUrlCandidate.attribute_value, 44)} (${(venueUrlCandidate.confidence ?? 0).toFixed(2)})`
                            : "—"}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "grid", gap: 10 }}>
                        <DeepScanButton tournamentId={t.id} />
                        <a
                          href={`/admin/venues?${venuesSearch.toString()}`}
                          style={{ fontSize: 12, color: "#1d4ed8", textDecoration: "none" }}
                        >
                          Search venues
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginTop: 14, flexWrap: "wrap" }}>
        <Link
          href={`/admin/tournaments/missing-venues?${(() => {
            const p = new URLSearchParams(paramsBase);
            p.set("page", String(Math.max(1, page - 1)));
            return p.toString();
          })()}`}
          style={{
            pointerEvents: page <= 1 ? "none" : "auto",
            opacity: page <= 1 ? 0.5 : 1,
            textDecoration: "none",
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: "#fff",
            color: "#111827",
            fontWeight: 800,
          }}
        >
          Prev
        </Link>
        <Link
          href={`/admin/tournaments/missing-venues?${(() => {
            const p = new URLSearchParams(paramsBase);
            p.set("page", String(Math.min(totalPages, page + 1)));
            return p.toString();
          })()}`}
          style={{
            pointerEvents: page >= totalPages ? "none" : "auto",
            opacity: page >= totalPages ? 0.5 : 1,
            textDecoration: "none",
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: "#fff",
            color: "#111827",
            fontWeight: 800,
          }}
        >
          Next
        </Link>
      </div>
    </main>
  );
}
