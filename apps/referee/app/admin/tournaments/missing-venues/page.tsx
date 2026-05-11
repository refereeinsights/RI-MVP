import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import AdminNav from "@/components/admin/AdminNav";
import { adminDeleteTournament, requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import DeepScanButton from "./DeepScanButton";
import BulkDeepScanButton from "./BulkDeepScanButton";
import USClubSoccerUrlButton from "./USClubSoccerUrlButton";
import PerplexityVenueButton from "./PerplexityVenueButton";
import PromoteInferredButton from "./PromoteInferredButton";

export const runtime = "nodejs";

type SearchParams = {
  page?: string;
  q?: string;
  state?: string;
  status?: string;
  zip?: string;
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

type PerplexityBatch = {
  id: string;
  created_at: string | null;
  notes: string | null;
};

type InferredVenueLink = {
  tournament_id: string | null;
  venue_id: string | null;
  inference_method: string | null;
  venues: { id: string | null; name: string | null } | null;
};

const VENUE_REASON_CODES = new Set([
  "jsonld_location",
  "anchor_full_address",
  "page_text_address",
  "map_link",
  "provider_perfectgame_locations",
  "perplexity_search",
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

function asText(value: unknown) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v ? v : null;
}

function redirectToMissingVenues(formData: FormData, notice?: string) {
  const search = new URLSearchParams();
  const page = asText(formData.get("page"));
  const q = asText(formData.get("q"));
  const state = asText(formData.get("state"));
  const zip = asText(formData.get("zip"));
  const status = asText(formData.get("status"));

  if (page) search.set("page", page);
  if (q) search.set("q", q);
  if (state) search.set("state", state);
  if (zip) search.set("zip", zip);
  if (status) search.set("status", status);
  if (notice) search.set("notice", notice);

  redirect(`/admin/tournaments/missing-venues${search.toString() ? `?${search.toString()}` : ""}`);
}

async function deleteTournamentAction(formData: FormData) {
  "use server";
  await requireAdmin();

  const tournamentId = asText(formData.get("tournament_id"));
  if (!tournamentId) redirectToMissingVenues(formData, "Missing tournament id");

  const confirmed = asText(formData.get("confirm_delete")) === "on";
  if (!confirmed) redirectToMissingVenues(formData, "Confirm delete to proceed");

  await adminDeleteTournament(tournamentId);

  revalidatePath("/admin/tournaments/missing-venues");
  revalidatePath("/admin");
  revalidatePath("/tournaments");
  redirectToMissingVenues(formData, "Tournament deleted");
}

export default async function MissingVenuesPage({ searchParams }: { searchParams?: SearchParams }) {
  await requireAdmin();

  const page = Math.max(1, Number(searchParams?.page ?? "1") || 1);
  const q = (searchParams?.q ?? "").trim();
  const state = (searchParams?.state ?? "").trim().toUpperCase();
  const zipRaw = (searchParams?.zip ?? "").trim();
  const zip = zipRaw.replace(/\D+/g, "").slice(0, 5);
  const tournamentStatusRaw = (searchParams?.status ?? "published").trim().toLowerCase();
  const tournamentStatus = tournamentStatusRaw === "draft" ? "draft" : "published";

  const pageSize = 50;
  const offset = (page - 1) * pageSize;
  const missingRes = await (supabaseAdmin as any).rpc("list_missing_venue_link_tournaments_v2", {
    p_limit: pageSize,
    p_offset: offset,
    p_state: state || null,
    p_q: q || null,
    p_zip: zip || null,
    p_status: tournamentStatus,
  });

  if (missingRes.error) {
    const msg = String(missingRes.error.message ?? "");
    const looksLikeRpcV2Missing =
      /list_missing_venue_link_tournaments_v2/i.test(msg) && /schema cache/i.test(msg) && /could not find the function/i.test(msg);

    return (
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "1rem" }}>
        <AdminNav />
        <h1 style={{ marginTop: 12 }}>Missing Venues</h1>
        <p style={{ color: "#b91c1c" }}>Failed to load tournaments: {missingRes.error.message}</p>
        {looksLikeRpcV2Missing ? (
          <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: "#fff7ed", border: "1px solid #fdba74" }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Fix</div>
            <div style={{ color: "#7c2d12", fontSize: 13, lineHeight: 1.4 }}>
              This page is calling a new RPC: <code>public.list_missing_venue_link_tournaments_v2</code>. It looks like your
              Supabase DB/API hasn&apos;t been updated yet.
              <br />
              Apply the migration and reload the PostgREST schema cache, then refresh this page.
              <br />
              Migration: <code>supabase/migrations/20260402_missing_venues_include_drafts.sql</code>
              <br />
              Supabase dashboard: Settings → API → <b>Reload schema</b> (or run <code>NOTIFY pgrst, 'reload schema';</code>).
            </div>
          </div>
        ) : null}
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
      p_zip: zip || null,
      p_status: tournamentStatus,
    });
    if (!countRes.error) {
      const countRows = (countRes.data ?? []) as TournamentRow[];
      count = Number(countRows[0]?.total_count ?? 0) || 0;
    }
  }
  const totalPages = count ? Math.max(1, Math.ceil(count / pageSize)) : 1;
  const tournamentIds = rows.map((r) => r.id);

  const [attrCandidatesResp, venueCandidatesResp, perplexityBatchesResp, inferredLinksResp] = await Promise.all([
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
    tournamentIds.length
      ? supabaseAdmin
          .from("discovery_batches" as any)
          .select("id,created_at,notes")
          .in(
            "notes",
            tournamentIds.map((id) => `venue_search:${id}`)
          )
          .limit(5000)
      : Promise.resolve({ data: [] as any[] } as any),
    tournamentIds.length
      ? supabaseAdmin
          .from("tournament_venues" as any)
          .select("tournament_id,venue_id,inference_method,venues(id,name)")
          .eq("is_inferred", true)
          .in("tournament_id", tournamentIds)
          .limit(1000)
      : Promise.resolve({ data: [] as any[] } as any),
  ]);

  const inferredByTournament = new Map<string, InferredVenueLink[]>();
  for (const row of ((inferredLinksResp.data ?? []) as InferredVenueLink[]).filter((r) => r.tournament_id && r.venue_id)) {
    const tid = String(row.tournament_id);
    const arr = inferredByTournament.get(tid) ?? [];
    arr.push(row);
    inferredByTournament.set(tid, arr);
  }

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

  const venueStatsByTournament = new Map<
    string,
    {
      deepScanCount: number;
      perplexityCount: number;
      lastDeepScanAt: string | null;
      lastPerplexityCandidateAt: string | null;
    }
  >();
  for (const row of ((venueCandidatesResp.data ?? []) as VenueCandidate[]).filter((r) => r.tournament_id)) {
    const tid = String(row.tournament_id);
    const evidenceReason = reasonFromEvidence(row.evidence_text);
    const isPerplexity = evidenceReason === "perplexity_search";
    const createdAt = row.created_at ? String(row.created_at) : null;

    const current = venueStatsByTournament.get(tid) ?? {
      deepScanCount: 0,
      perplexityCount: 0,
      lastDeepScanAt: null as string | null,
      lastPerplexityCandidateAt: null as string | null,
    };
    if (isPerplexity) {
      current.perplexityCount += 1;
      if (!current.lastPerplexityCandidateAt || (createdAt && createdAt > current.lastPerplexityCandidateAt)) {
        current.lastPerplexityCandidateAt = createdAt;
      }
    } else {
      current.deepScanCount += 1;
      if (!current.lastDeepScanAt || (createdAt && createdAt > current.lastDeepScanAt)) {
        current.lastDeepScanAt = createdAt;
      }
    }
    venueStatsByTournament.set(tid, current);
  }

  const perplexityBatchByTournament = new Map<string, PerplexityBatch>();
  for (const row of ((perplexityBatchesResp.data ?? []) as PerplexityBatch[]).filter((r) => r?.id && r?.notes)) {
    const notes = String(row.notes ?? "");
    if (!notes.startsWith("venue_search:")) continue;
    const tid = notes.slice("venue_search:".length).trim();
    if (!tid) continue;

    const existing = perplexityBatchByTournament.get(tid);
    const existingAt = existing?.created_at ? String(existing.created_at) : "";
    const nextAt = row.created_at ? String(row.created_at) : "";
    if (!existing || (nextAt && nextAt > existingAt)) perplexityBatchByTournament.set(tid, row);
  }

  function shortWhen(value: string | null | undefined): string | null {
    const v = String(value ?? "").trim();
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  const paramsBase = new URLSearchParams();
  if (q) paramsBase.set("q", q);
  if (state) paramsBase.set("state", state);
  if (zip) paramsBase.set("zip", zip);
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
        <input
          name="zip"
          defaultValue={zipRaw}
          placeholder="ZIP (e.g. 98052)"
          style={{ padding: 8, width: 160 }}
          inputMode="numeric"
          pattern="\\d{5}"
          maxLength={5}
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
                const venueStats = venueStatsByTournament.get(t.id) ?? null;
                const perplexityBatch = perplexityBatchByTournament.get(t.id) ?? null;
                const inferredLinks = inferredByTournament.get(t.id) ?? [];

                const venuesSearch = new URLSearchParams();
                venuesSearch.set("q", [t.name ?? "", t.city ?? "", t.state ?? ""].filter(Boolean).join(" "));

                const editHref = `/admin?tab=tournament-listings&q=${encodeURIComponent(t.slug ?? t.name ?? t.id)}#tournament-listings`;

                return (
                  <tr key={t.id} id={`tournament-row-${t.id}`} style={{ borderTop: "1px solid #e5e7eb", verticalAlign: "top" }}>
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
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          <a
                            href={editHref}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              padding: "2px 8px",
                              borderRadius: 6,
                              border: "1px solid #2563eb",
                              background: "#fff",
                              color: "#2563eb",
                              fontWeight: 700,
                              fontSize: 11,
                              textDecoration: "none",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Edit ↗
                          </a>
                          <form action={deleteTournamentAction} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                            <input type="hidden" name="tournament_id" value={t.id} />
                            <input type="hidden" name="page" value={String(page)} />
                            <input type="hidden" name="q" value={q} />
                            <input type="hidden" name="state" value={state} />
                            <input type="hidden" name="zip" value={zipRaw} />
                            <input type="hidden" name="status" value={tournamentStatus} />
                            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800 }}>
                              <input type="checkbox" name="confirm_delete" />
                              Confirm delete
                            </label>
                            <button
                              type="submit"
                              style={{
                                padding: "2px 8px",
                                borderRadius: 6,
                                border: "1px solid #b00020",
                                background: "#fff",
                                color: "#b00020",
                                fontWeight: 900,
                                fontSize: 11,
                                textDecoration: "none",
                                whiteSpace: "nowrap",
                                cursor: "pointer",
                              }}
                            >
                              Delete
                            </button>
                          </form>
                        </div>
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
                        <div style={{ fontSize: 12, color: "#475569", display: "grid", gap: 2 }}>
                          <div>
                            <strong>Deep scan:</strong>{" "}
                            {venueStats?.deepScanCount ? (
                              <>
                                {venueStats.deepScanCount} cand{venueStats.deepScanCount === 1 ? "" : "s"}
                                {venueStats.lastDeepScanAt ? ` • ${shortWhen(venueStats.lastDeepScanAt)}` : ""}
                              </>
                            ) : (
                              "—"
                            )}
                          </div>
                          <div>
                            <strong>Perplexity:</strong>{" "}
                            {perplexityBatch ? (
                              <>
                                ran{perplexityBatch.created_at ? ` • ${shortWhen(perplexityBatch.created_at)}` : ""}
                                {" • "}
                                {venueStats?.perplexityCount ? (
                                  <>
                                    {venueStats.perplexityCount} cand{venueStats.perplexityCount === 1 ? "" : "s"}
                                  </>
                                ) : (
                                  "0 cand"
                                )}
                              </>
                            ) : (
                              "—"
                            )}
                          </div>
                        </div>
                        <DeepScanButton tournamentId={t.id} />
                        <PerplexityVenueButton tournamentId={t.id} />
                        <a
                          href={`/admin/venues?${venuesSearch.toString()}`}
                          style={{ fontSize: 12, color: "#1d4ed8", textDecoration: "none" }}
                        >
                          Search venues
                        </a>
                        {inferredLinks.length > 0 ? (
                          <div style={{ display: "grid", gap: 6, borderTop: "1px solid #e5e7eb", paddingTop: 8 }}>
                            {inferredLinks.map((link) => (
                              <PromoteInferredButton
                                key={String(link.venue_id)}
                                tournamentId={t.id}
                                venueId={String(link.venue_id)}
                                venueName={link.venues?.name ?? String(link.venue_id)}
                                inferenceMethod={link.inference_method}
                              />
                            ))}
                          </div>
                        ) : null}
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
