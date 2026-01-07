import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import Link from "next/link";
import { redirect } from "next/navigation";
import { normalizeSourceUrl, upsertRegistry } from "@/server/admin/sources";

const IGNORE_STATUSES = new Set([
  "dead",
  "login_required",
  "paywalled",
  "js_only",
  "blocked_403",
  "deprecated",
  "duplicate_source",
]);

export const runtime = "nodejs";

type SearchParams = { source_url?: string; notice?: string };

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default async function SourcesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const notice = searchParams.notice ?? "";
  const selectedUrl = searchParams.source_url ? normalizeSourceUrl(searchParams.source_url).canonical : null;

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
      .eq("id", id);
    const noticeMsg = error ? `Status update failed: ${error.message}` : "Updated source status";
    redirect(`/admin/tournaments/sources?notice=${encodeURIComponent(noticeMsg)}${selectedUrl ? `&source_url=${encodeURIComponent(selectedUrl)}` : ""}`);
  }

  return (
    <div style={{ padding: 24 }}>
      <AdminNav />
      <h1 style={{ fontSize: 20, fontWeight: 900, marginBottom: 12 }}>Sources</h1>
      {notice && (
        <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", padding: 8, borderRadius: 8, marginBottom: 12 }}>
          {notice}
        </div>
      )}

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
              <select name="source_type" defaultValue="" style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}>
                <option value="">(auto)</option>
                <option value="venue_calendar">Venue calendar</option>
                <option value="club_calendar">Club calendar</option>
                <option value="league_calendar">League calendar</option>
                <option value="series_site">Series site</option>
                <option value="platform_listing">Platform listing</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Sport
              <input name="sport" placeholder="soccer" style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }} />
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
              {registryRows.map((row: any) => {
                const ignore =
                  !row.is_active ||
                  IGNORE_STATUSES.has(row.review_status) ||
                  (row.ignore_until && new Date(row.ignore_until) > new Date());
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
                  <td style={{ padding: "6px 4px" }}>{formatDate(row.last_tested_at)}</td>
                  <td style={{ padding: "6px 4px" }}>
                    {formatDate(row.last_swept_at)}
                    {row.last_sweep_status ? ` (${row.last_sweep_status})` : ""}
                  </td>
                  <td style={{ padding: "6px 4px", maxWidth: 220 }}>{row.last_sweep_summary || "—"}</td>
                    <td style={{ padding: "6px 4px" }}>
                      {ignore ? (
                        <span style={{ color: "#991b1b", fontWeight: 700 }}>
                          {row.is_active ? row.review_status || "ignored" : "inactive"}
                          {row.ignore_until ? ` (until ${new Date(row.ignore_until).toLocaleDateString()})` : ""}
                        </span>
                      ) : (
                        <Link
                          href={`/admin?tab=tournament-uploads&fallback_source_url=${encodeURIComponent(row.source_url)}`}
                          style={{ color: "#2563eb", fontWeight: 700 }}
                        >
                          Sweep
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!registryRows.length && (
                <tr>
                  <td colSpan={9} style={{ padding: 8, color: "#666" }}>
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
