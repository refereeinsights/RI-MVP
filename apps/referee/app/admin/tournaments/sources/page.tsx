import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  normalizeSourceUrl,
  upsertRegistry,
  getSkipReason,
  ensureRegistryRow,
  updateRegistrySweep,
  insertSourceLog,
} from "@/server/admin/sources";
import { createTournamentFromUrl } from "@/server/admin/pasteUrl";
import { SweepError, buildSweepSummary } from "@/server/admin/sweepDiagnostics";
import SourceLogsClient from "./SourceLogsClient";

type Filter = "all" | "untested" | "keep" | "ignored" | "needs_review";

export const runtime = "nodejs";

type SearchParams = { source_url?: string; notice?: string; filter?: Filter; sort?: string; dir?: string };

const SPORT_OPTIONS = [
  "soccer",
  "futsal",
  "basketball",
  "baseball",
  "softball",
  "lacrosse",
  "volleyball",
  "football",
  "wrestling",
  "hockey",
  "other",
] as const;

const SOURCE_TYPE_OPTIONS = [
  "tournament_platform",
  "governing_body",
  "league",
  "club",
  "directory",
] as const;
const TOURNAMENT_SPORTS = ["soccer", "basketball", "football"] as const;

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default async function SourcesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const notice = searchParams.notice ?? "";
  const selectedUrl = searchParams.source_url ? normalizeSourceUrl(searchParams.source_url).canonical : null;
  const filter: Filter = (searchParams.filter as Filter) || "all";
  const sort = searchParams.sort ?? "review_status";
  const dir = searchParams.dir === "asc" ? "asc" : "desc";

  const reviewPriority = [
    "needs_review",
    "untested",
    "keep",
    "seasonal",
    "low_yield",
    "pdf_only",
    "login_required",
    "paywalled",
    "js_only",
    "blocked_403",
    "dead",
    "deprecated",
    "duplicate_source",
  ];
  const priorityIndex = new Map(reviewPriority.map((s, i) => [s, i]));
  const getPriority = (status?: string | null) =>
    priorityIndex.get((status || "untested").toLowerCase()) ?? reviewPriority.length + 1;

  const registryRes = await supabaseAdmin
    .from("tournament_sources" as any)
    .select(
      "id,source_url,source_type,sport,state,city,notes,is_active,review_status,review_notes,ignore_until,last_tested_at,last_swept_at,last_sweep_status,last_sweep_summary,fetched_at"
    )
    .order("last_swept_at", { ascending: false })
    .order("fetched_at", { ascending: true });
  const registryRows = registryRes.data ?? [];

  const runsRes = selectedUrl
    ? await supabaseAdmin
        .from("tournament_sources" as any)
        .select("id,fetched_at,http_status,extracted_json,source_url,url")
        .eq("source_url", selectedUrl)
        .not("fetched_at", "is", null)
        .order("fetched_at", { ascending: false })
        .limit(10)
    : { data: [] as any[], error: null };
  const runRows = runsRes.data ?? [];

  async function upsertSource(formData: FormData) {
    "use server";
    await requireAdmin();
    const source_url = String(formData.get("source_url") || "").trim();
    if (!source_url) {
      redirect(`/admin/tournaments/sources?notice=${encodeURIComponent("Source URL is required")}`);
    }
    const source_type = String(formData.get("source_type") || "").trim() || null;
    const sport = String(formData.get("sport") || "").trim() || null;
    if (!source_type || !sport) {
      redirect(`/admin/tournaments/sources?notice=${encodeURIComponent("Sport and source type are required")}`);
    }
    const state = String(formData.get("state") || "").trim() || null;
    const city = String(formData.get("city") || "").trim() || null;
    const notes = String(formData.get("notes") || "").trim() || null;
    const is_active = String(formData.get("is_active") || "") === "on";
    const review_status = "untested";

    try {
      const { canonical } = normalizeSourceUrl(source_url);
      await upsertRegistry({
        source_url: canonical,
        source_type,
        sport,
        state,
        city,
        notes,
        is_active,
        review_status,
      });
      redirect(
        `/admin/tournaments/sources?notice=${encodeURIComponent("Saved source")}&source_url=${encodeURIComponent(
          canonical
        )}`
      );
    } catch (err: any) {
      if (err?.digest) throw err;
      redirect(
        `/admin/tournaments/sources?notice=${encodeURIComponent(
          `Save failed: ${err?.message ?? "unknown error"}`
        )}`
      );
    }
  }

  async function updateStatus(formData: FormData) {
    "use server";
    await requireAdmin();
    const id = String(formData.get("id") || "");
    const review_status = String(formData.get("review_status") || "untested");
    const review_notes = String(formData.get("review_notes") || "").trim() || null;
    const is_active = String(formData.get("is_active") || "") === "on";
    const ignore_until = String(formData.get("ignore_until") || "").trim() || null;
    const { error } = await supabaseAdmin
      .from("tournament_sources" as any)
      .update({ review_status, review_notes, is_active, ignore_until: ignore_until || null })
      .eq("id", id)
      .is("tournament_id", null);
    const noticeMsg = error ? `Status update failed: ${error.message}` : "Updated source status";
    redirect(
      `/admin/tournaments/sources?notice=${encodeURIComponent(noticeMsg)}${
        selectedUrl ? `&source_url=${encodeURIComponent(selectedUrl)}` : ""
      }`
    );
  }

  async function quickAction(formData: FormData) {
    "use server";
    await requireAdmin();
    const id = String(formData.get("id") || "");
    const action = String(formData.get("action") || "");
    const redirectUrl = formData.get("redirect") as string | null;
    const updates: any = {};
    if (action === "keep") {
      updates.review_status = "keep";
      updates.is_active = true;
    } else if (action === "dead") {
      updates.review_status = "dead";
      updates.is_active = false;
    } else if (action === "login") {
      updates.review_status = "login_required";
      updates.is_active = false;
    } else if (action === "js_only") {
      updates.review_status = "js_only";
      updates.is_active = false;
    } else if (action === "paywalled") {
      updates.review_status = "paywalled";
      updates.is_active = false;
    } else if (action === "blocked") {
      updates.review_status = "blocked_403";
      const now = new Date();
      now.setDate(now.getDate() + 7);
      updates.ignore_until = now.toISOString();
      updates.is_active = false;
    } else if (action === "clear_block") {
      updates.review_status = "needs_review";
      updates.ignore_until = null;
      updates.is_active = true;
    }
    if (!Object.keys(updates).length) {
      redirect(redirectUrl || "/admin/tournaments/sources");
    }
    const { error } = await supabaseAdmin
      .from("tournament_sources" as any)
      .update(updates)
      .eq("id", id)
      .is("tournament_id", null);
    const msg = error ? `Quick action failed: ${error.message}` : "Updated source";
    redirect(`${redirectUrl || "/admin/tournaments/sources"}?notice=${encodeURIComponent(msg)}`);
  }

  async function sweepSourceAction(formData: FormData) {
    "use server";
    await requireAdmin();
    const id = String(formData.get("id") || "");
    const sourceUrl = String(formData.get("source_url") || "").trim();
    const sportRaw = String(formData.get("sport") || "soccer").toLowerCase();
    const overrideSkip = String(formData.get("override_skip") || "") === "on";
    if (!id || !sourceUrl) {
      redirect(`/admin/tournaments/sources?notice=${encodeURIComponent("Missing source URL")}`);
    }

    const sport = TOURNAMENT_SPORTS.includes(sportRaw as any) ? (sportRaw as any) : "soccer";
    const { canonical, normalized, host } = normalizeSourceUrl(sourceUrl);
    const { data: row, error: rowError } = await supabaseAdmin
      .from("tournament_sources" as any)
      .select("id,source_url,url,is_active,review_status,review_notes,ignore_until")
      .eq("id", id)
      .maybeSingle();
    const registryRow = row as any;
    if (rowError || !registryRow) {
      redirect(`/admin/tournaments/sources?notice=${encodeURIComponent("Source not found")}`);
    }
    await supabaseAdmin
      .from("tournament_sources" as any)
      .update({
        source_url: canonical,
        url: canonical,
        normalized_url: normalized,
        normalized_host: host,
      })
      .eq("id", registryRow.id);
    const skipReason = getSkipReason(registryRow);
    if (skipReason && !overrideSkip) {
      await updateRegistrySweep(registryRow.id, "warn", `Skipped: ${skipReason}`);
      return redirect(
        `/admin/tournaments/sources?notice=${encodeURIComponent(
          `Sweep skipped: ${skipReason}. Update source status or enable override.`
        )}&source_url=${encodeURIComponent(canonical)}`
      );
    }

    await supabaseAdmin
      .from("tournament_sources" as any)
      .update({ last_tested_at: new Date().toISOString() })
      .eq("id", registryRow.id);

    const startedAt = Date.now();
    try {
      const res = await createTournamentFromUrl({
        url: canonical,
        sport,
        status: "draft",
        source: "external_crawl",
      });
      const payload = {
        version: 1,
        source_url: canonical,
        final_url: res.diagnostics?.final_url ?? null,
        http_status: res.diagnostics?.status ?? null,
        error_code: null,
        message: "Sweep succeeded",
        content_type: res.diagnostics?.content_type ?? null,
        bytes: res.diagnostics?.bytes ?? null,
        timing_ms: Date.now() - startedAt,
        redirect_count: res.diagnostics?.redirect_count ?? null,
        redirect_chain: res.diagnostics?.redirect_chain ?? [],
        location_header: res.diagnostics?.location_header ?? null,
        extracted_count: 1,
      };
      const logId = await insertSourceLog({
        source_id: registryRow.id,
        action: "sweep",
        level: "info",
        payload,
      });
      await updateRegistrySweep(
        registryRow.id,
        "ok",
        buildSweepSummary(null, "Sweep succeeded", res.diagnostics ?? {}, { log_id: logId })
      );
      redirect(
        `/admin/tournaments/sources?notice=${encodeURIComponent(
          `Created "${res.meta.name ?? res.slug}" and queued enrichment.`
        )}&source_url=${encodeURIComponent(canonical)}`
      );
    } catch (err: any) {
      const timingMs = Date.now() - startedAt;
      if (err?.digest && String(err.digest).includes("NEXT_REDIRECT")) {
        throw err;
      }
      if (err instanceof SweepError) {
        const payload = {
          version: 1,
          source_url: canonical,
          final_url: err.diagnostics?.final_url ?? null,
          http_status: err.diagnostics?.status ?? null,
          error_code: err.code,
          message: err.message,
          content_type: err.diagnostics?.content_type ?? null,
          bytes: err.diagnostics?.bytes ?? null,
          timing_ms: timingMs,
          redirect_count: err.diagnostics?.redirect_count ?? null,
          redirect_chain: err.diagnostics?.redirect_chain ?? [],
          location_header: err.diagnostics?.location_header ?? null,
          extracted_count: null,
        };
        const logId = await insertSourceLog({
          source_id: registryRow.id,
          action: "sweep",
          level: "error",
          payload,
        });
        await updateRegistrySweep(
          registryRow.id,
          err.code,
          buildSweepSummary(err.code, err.message, err.diagnostics, { log_id: logId })
        );
      } else {
        const legacyMessage = String(err?.message ?? "");
        if (legacyMessage === "failed_to_fetch_html") {
          const payload = {
            version: 1,
            source_url: canonical,
            final_url: null,
            http_status: null,
            error_code: "fetch_failed",
            message: "Request failed",
            content_type: null,
            bytes: null,
            timing_ms: timingMs,
            redirect_count: null,
            redirect_chain: [],
            location_header: null,
            extracted_count: null,
          };
          const logId = await insertSourceLog({
            source_id: registryRow.id,
            action: "sweep",
            level: "error",
            payload,
          });
          await updateRegistrySweep(
            registryRow.id,
            "fetch_failed",
            buildSweepSummary("fetch_failed", payload.message, {}, { log_id: logId })
          );
        } else {
          const payload = {
            version: 1,
            source_url: canonical,
            final_url: null,
            http_status: null,
            error_code: "extractor_error",
            message: legacyMessage || "unknown error",
            content_type: null,
            bytes: null,
            timing_ms: timingMs,
            redirect_count: null,
            redirect_chain: [],
            location_header: null,
            extracted_count: null,
          };
          const logId = await insertSourceLog({
            source_id: registryRow.id,
            action: "sweep",
            level: "error",
            payload,
          });
          await updateRegistrySweep(
            registryRow.id,
            "extractor_error",
            buildSweepSummary("extractor_error", payload.message, {}, { log_id: logId })
          );
        }
      }
      redirect(
        `/admin/tournaments/sources?notice=${encodeURIComponent(
          `Sweep failed: ${err?.message ?? "unknown error"}`
        )}&source_url=${encodeURIComponent(canonical)}`
      );
    }
  }

  const filtered = registryRows.filter((row: any) => {
    if (filter === "untested") return (row.review_status || "untested") === "untested";
    if (filter === "keep") return (row.review_status || "") === "keep";
    if (filter === "needs_review") return (row.review_status || "") === "needs_review";
    if (filter === "ignored") {
      const reason = getSkipReason(row);
      return !!reason;
    }
    return true;
  });

  const sorted = filtered.slice().sort((a: any, b: any) => {
    const activeRankA = a.is_active ? 0 : 1;
    const activeRankB = b.is_active ? 0 : 1;
    if (sort === "review_status") {
      if (activeRankA !== activeRankB) return activeRankA - activeRankB;
      const prA = getPriority(a.review_status);
      const prB = getPriority(b.review_status);
      if (prA !== prB) return prA - prB;
      const aTime = a.last_swept_at ? new Date(a.last_swept_at).getTime() : 0;
      const bTime = b.last_swept_at ? new Date(b.last_swept_at).getTime() : 0;
      return bTime - aTime;
    }
    if (sort === "last_swept_at") {
      const aTime = a.last_swept_at ? new Date(a.last_swept_at).getTime() : 0;
      const bTime = b.last_swept_at ? new Date(b.last_swept_at).getTime() : 0;
      return dir === "asc" ? aTime - bTime : bTime - aTime;
    }
    if (sort === "source_url") {
      const cmp = String(a.source_url || "").localeCompare(String(b.source_url || ""), undefined, { sensitivity: "base" });
      return dir === "asc" ? cmp : -cmp;
    }
    return 0;
  });

  const buildSortHref = (key: string) => {
    const nextDir = sort === key && dir === "asc" ? "desc" : "asc";
    const params = new URLSearchParams();
    if (filter) params.set("filter", filter);
    if (selectedUrl) params.set("source_url", selectedUrl);
    params.set("sort", key);
    params.set("dir", nextDir);
    return `/admin/tournaments/sources?${params.toString()}`;
  };

  return (
    <div style={{ padding: 24 }}>
      <AdminNav />
      <h1 style={{ fontSize: 20, fontWeight: 900, marginBottom: 12 }}>Sources</h1>
      {notice && (
        <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", padding: 8, borderRadius: 8, marginBottom: 12 }}>
          {notice}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        {(["all", "untested", "keep", "ignored", "needs_review"] as Filter[]).map((f) => (
          <Link
            key={f}
            href={`/admin/tournaments/sources?filter=${f}`}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: filter === f ? "#e0f2fe" : "#f9fafb",
              color: "#0f172a",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            {f}
          </Link>
        ))}
        <Link
          href="/admin/tournaments/sources/discover"
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #0f172a",
            background: "#0f172a",
            color: "#fff",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Discover
        </Link>
        <a
          href="/api/admin/tournaments/sources/export"
          style={{
            marginLeft: "auto",
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#0f172a",
            color: "#fff",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Export CSV
        </a>
      </div>

      <div style={{ display: "grid", gap: 16, marginBottom: 16 }}>
        <form action={upsertSource} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Add / update source</h2>
          <div style={{ display: "grid", gap: 8, marginTop: 8, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Source URL *
              <input
                name="source_url"
                defaultValue={selectedUrl ?? ""}
                required
                style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Source type
              <select name="source_type" required defaultValue="" style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}>
                <option value="">Select type</option>
                {SOURCE_TYPE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Sport
              <select name="sport" required defaultValue="" style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}>
                <option value="">Select sport</option>
                {SPORT_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              State
              <input name="state" placeholder="WA" style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              City
              <input name="city" placeholder="Seattle" style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, fontWeight: 700 }}>
              <input type="checkbox" name="is_active" defaultChecked />
              Active
            </label>
          </div>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700, marginTop: 8 }}>
            Notes
            <textarea
              name="notes"
              rows={2}
              style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db", width: "100%" }}
              placeholder="Internal notes"
            />
          </label>
          <button
            type="submit"
            style={{
              marginTop: 10,
              padding: "10px 14px",
              borderRadius: 10,
              border: "none",
              background: "#0f172a",
              color: "#fff",
              fontWeight: 800,
            }}
          >
            Save source
          </button>
        </form>

        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Registry</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
            <thead>
              <tr>
                {[
                  { key: "source_url", label: "Source URL", sortable: true },
                  { key: "source_type", label: "Type" },
                  { key: "sport", label: "Sport" },
                  { key: "state", label: "State" },
                  { key: "city", label: "City" },
                  { key: "review_status", label: "Status", sortable: true },
                  { key: "is_active", label: "Active" },
                  { key: "ignore_until", label: "Ignore until" },
                  { key: "last_tested_at", label: "Last tested" },
                  { key: "last_swept_at", label: "Last sweep", sortable: true },
                  { key: "summary", label: "Summary" },
                  { key: "actions", label: "Actions" },
                ].map((col) => (
                  <th key={col.label} style={{ textAlign: "left", padding: "6px 4px", borderBottom: "1px solid #eee" }}>
                    {col.sortable ? (
                      <Link
                        href={buildSortHref(col.key)}
                        style={{ color: "#0f172a", textDecoration: "none", fontWeight: 800 }}
                      >
                        {col.label}
                      </Link>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row: any) => {
                const reason = getSkipReason(row);
                const ignore = !!reason;
                return (
                  <tr key={row.id} style={ignore ? { opacity: 0.65 } : undefined}>
                    <td style={{ padding: "6px 4px" }}>
                      <Link href={`/admin/tournaments/sources?source_url=${encodeURIComponent(row.source_url)}`} style={{ color: "#0f172a", fontWeight: 700 }}>
                        {row.source_url}
                      </Link>
                    </td>
                  <td style={{ padding: "6px 4px" }}>{row.source_type || "—"}</td>
                  <td style={{ padding: "6px 4px" }}>{row.sport || "—"}</td>
                  <td style={{ padding: "6px 4px" }}>{row.state || "—"}</td>
                  <td style={{ padding: "6px 4px" }}>{row.city || "—"}</td>
                  <td style={{ padding: "6px 4px" }}>
                    <form action={updateStatus} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input type="hidden" name="id" value={row.id} />
                      <select
                        name="review_status"
                        defaultValue={row.review_status || "untested"}
                        style={{ padding: 6, borderRadius: 6, border: "1px solid #d1d5db" }}
                      >
                        {[
                          "untested",
                          "keep",
                          "needs_review",
                          "low_yield",
                          "js_only",
                          "login_required",
                          "dead",
                          "pdf_only",
                          "paywalled",
                          "blocked_403",
                          "duplicate_source",
                          "seasonal",
                          "deprecated",
                        ].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <label style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 11 }}>
                        <input type="checkbox" name="is_active" defaultChecked={!!row.is_active} />
                        active
                      </label>
                      <input type="hidden" name="review_notes" value={row.review_notes ?? ""} />
                      <input type="hidden" name="ignore_until" value={row.ignore_until ?? ""} />
                      <button
                        type="submit"
                        style={{
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: "1px solid #e5e7eb",
                          background: "#f3f4f6",
                          fontSize: 12,
                        }}
                      >
                        Save
                      </button>
                    </form>
                  </td>
                  <td style={{ padding: "6px 4px" }}>{row.is_active ? "Yes" : "No"}</td>
                  <td style={{ padding: "6px 4px" }}>{row.ignore_until ? new Date(row.ignore_until).toLocaleDateString() : "—"}</td>
                  <td style={{ padding: "6px 4px" }}>{formatDate(row.last_tested_at)}</td>
                  <td style={{ padding: "6px 4px" }}>
                    {formatDate(row.last_swept_at)}
                    {row.last_sweep_status ? (
                      <>
                        {" "}
                        <SourceLogsClient
                          sourceId={row.id}
                          sourceUrl={row.source_url}
                          status={row.last_sweep_status}
                          compact
                        />
                      </>
                    ) : null}
                  </td>
                  <td style={{ padding: "6px 4px", maxWidth: 260 }}>
                    {row.last_sweep_summary ? (() => {
                      let parsed: any = null;
                      try {
                        parsed = JSON.parse(row.last_sweep_summary);
                      } catch {
                        parsed = null;
                      }
                      if (!parsed || (!parsed.error_code && !parsed.message)) return row.last_sweep_summary;
                      const codeLabel = parsed.error_code ?? "ok";
                      return (
                        <div style={{ display: "grid", gap: 6 }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 800,
                                padding: "2px 6px",
                                borderRadius: 999,
                                border: "1px solid #0f172a",
                                background: "#f8fafc",
                                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
                              }}
                            >
                              {codeLabel}
                            </span>
                            <span style={{ fontSize: 12 }}>{parsed.message}</span>
                          </div>
                          <details>
                            <summary style={{ cursor: "pointer", fontSize: 11 }}>Details</summary>
                            <pre style={{ margin: "6px 0 0", fontSize: 11, whiteSpace: "pre-wrap" }}>
                              {JSON.stringify(parsed, null, 2)}
                            </pre>
                          </details>
                        </div>
                      );
                    })() : "—"}
                  </td>
                    <td style={{ padding: "6px 4px" }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        {ignore ? (
                          <span style={{ color: "#991b1b", fontWeight: 700 }}>{reason}</span>
                        ) : (
                          <form action={sweepSourceAction}>
                            <input type="hidden" name="id" value={row.id} />
                            <input type="hidden" name="source_url" value={row.source_url} />
                            <input type="hidden" name="sport" value={row.sport ?? "soccer"} />
                            <button
                              type="submit"
                              style={{
                                padding: "4px 6px",
                                borderRadius: 6,
                                border: "1px solid #2563eb",
                                background: "#eff6ff",
                                color: "#1d4ed8",
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              Sweep now
                            </button>
                          </form>
                        )}
                        <SourceLogsClient sourceId={row.id} sourceUrl={row.source_url} />
                        <form action={quickAction}>
                          <input type="hidden" name="id" value={row.id} />
                          <input type="hidden" name="redirect" value={`/admin/tournaments/sources?filter=${filter}`} />
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {[
                              ["keep", "Keep"],
                              ["dead", "Dead"],
                              ["login", "Login"],
                              ["js_only", "JS"],
                              ["paywalled", "Paywall"],
                              ["blocked", "Block7d"],
                              ["clear_block", "Clear"],
                            ].map(([action, label]) => (
                              <button
                                key={action}
                                name="action"
                                value={action}
                                type="submit"
                                style={{
                                  padding: "4px 6px",
                                  borderRadius: 6,
                                  border: "1px solid #d1d5db",
                                  background: "#f9fafb",
                                  fontSize: 11,
                                }}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr>
                  <td colSpan={11} style={{ padding: 8, color: "#666" }}>
                    No sources yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {selectedUrl && (
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Recent runs</h2>
            <div style={{ fontSize: 13, color: "#374151", marginBottom: 6 }}>{selectedUrl}</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {["Fetched", "HTTP", "Discovered", "Imported", "Warnings"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "6px 4px", borderBottom: "1px solid #eee" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runRows.map((row: any) => {
                  const ex = row.extracted_json || {};
                  const warnings = Array.isArray(ex.warnings) ? ex.warnings.join(" | ") : ex.warnings || "";
                  return (
                    <tr key={row.id}>
                      <td style={{ padding: "6px 4px" }}>{formatDate(row.fetched_at)}</td>
                      <td style={{ padding: "6px 4px" }}>{row.http_status ?? "—"}</td>
                      <td style={{ padding: "6px 4px" }}>{ex.discovered_count ?? "—"}</td>
                      <td style={{ padding: "6px 4px" }}>{ex.imported_count ?? "—"}</td>
                      <td style={{ padding: "6px 4px" }}>{warnings || "—"}</td>
                    </tr>
                  );
                })}
                {!runRows.length && (
                  <tr>
                    <td colSpan={5} style={{ padding: 8, color: "#666" }}>
                      No runs for this source.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
