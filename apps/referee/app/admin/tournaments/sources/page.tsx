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
} from "@/server/admin/sources";
import { createTournamentFromUrl } from "@/server/admin/pasteUrl";

type Filter = "all" | "untested" | "keep" | "ignored" | "needs_review";

export const runtime = "nodejs";

type SearchParams = { source_url?: string; notice?: string; filter?: Filter };

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
    const { canonical } = normalizeSourceUrl(sourceUrl);
    const { row } = await ensureRegistryRow(canonical, {
      source_url: canonical,
      source_type: null,
      sport,
      is_active: true,
    });
    const skipReason = getSkipReason(row);
    if (skipReason && !overrideSkip) {
      await updateRegistrySweep(row.id, "warn", `Skipped: ${skipReason}`);
      return redirect(
        `/admin/tournaments/sources?notice=${encodeURIComponent(
          `Sweep skipped: ${skipReason}. Update source status or enable override.`
        )}&source_url=${encodeURIComponent(canonical)}`
      );
    }

    await supabaseAdmin
      .from("tournament_sources" as any)
      .update({ last_tested_at: new Date().toISOString() })
      .eq("id", row.id);

    try {
      const res = await createTournamentFromUrl({
        url: canonical,
        sport,
        status: "draft",
        source: "external_crawl",
      });
      await updateRegistrySweep(row.id, "ok", `Created "${res.meta.name ?? res.slug}"`);
      redirect(
        `/admin/tournaments/sources?notice=${encodeURIComponent(
          `Created "${res.meta.name ?? res.slug}" and queued enrichment.`
        )}&source_url=${encodeURIComponent(canonical)}`
      );
    } catch (err: any) {
      await updateRegistrySweep(
        row.id,
        "error",
        `Sweep failed: ${String(err?.message ?? "unknown error").slice(0, 180)}`
      );
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
                  "Source URL",
                  "Type",
                  "Sport",
                  "State",
                  "City",
                  "Status",
                  "Active",
                  "Ignore until",
                  "Last tested",
                  "Last sweep",
                  "Summary",
                  "Actions",
                ].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 4px", borderBottom: "1px solid #eee" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row: any) => {
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
                    {row.last_sweep_status ? ` (${row.last_sweep_status})` : ""}
                  </td>
                  <td style={{ padding: "6px 4px", maxWidth: 220 }}>{row.last_sweep_summary || "—"}</td>
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
