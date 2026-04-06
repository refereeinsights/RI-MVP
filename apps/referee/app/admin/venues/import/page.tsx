import Link from "next/link";
import { redirect } from "next/navigation";

import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { parseCsv } from "@/lib/tournaments/importUtils";
import { runVenueCsvImport } from "@/server/admin/venueImport";
import { runVenueSweepToDraftUploads } from "@/server/admin/venueSweep";

export const runtime = "nodejs";

type PageProps = {
  searchParams?: {
    run_id?: string;
    notice?: string;
  };
};

function redirectWithNoticeAndQuery(
  target: string,
  notice: string,
  extraQuery: Record<string, string | number | null | undefined>
): never {
  const [path, qs] = target.split("?");
  const params = new URLSearchParams(qs ?? "");
  for (const [key, val] of Object.entries(extraQuery)) {
    if (val === null || val === undefined || val === "") params.delete(key);
    else params.set(key, String(val));
  }
  params.set("notice", notice);
  redirect(`${path}?${params.toString()}`);
}

export default async function AdminVenueImportPage({ searchParams }: PageProps) {
  await requireAdmin();

  const runId = String(searchParams?.run_id ?? "").trim() || null;
  const notice = String(searchParams?.notice ?? "").trim() || null;

  async function importVenuesAction(formData: FormData) {
    "use server";
    const user = await requireAdmin();
    const file = formData.get("upload") as File | null;
    const mode = String(formData.get("mode") || "dry_run");

    if (!file || file.size === 0) {
      redirectWithNoticeAndQuery("/admin/venues/import", "CSV file missing.", {});
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const contents = buffer.toString("utf8");
    const { rows } = parseCsv(contents);
    if (!rows.length) {
      redirectWithNoticeAndQuery("/admin/venues/import", "CSV parsed but contained zero rows.", {});
    }

    const dryRun = mode !== "apply";
    const res = await runVenueCsvImport({
      createdBy: user.id,
      filename: file.name,
      dryRun,
      rows,
    }).catch((err: any) => {
      const message = String(err?.message ?? "unknown error");
      redirectWithNoticeAndQuery("/admin/venues/import", `Import failed: ${message}`, {});
    });

    redirectWithNoticeAndQuery(
      "/admin/venues/import",
      dryRun ? `Dry run complete: ${res.summary}` : `Import complete: ${res.summary}`,
      { run_id: res.run_id }
    );
  }

  async function sweepVenueAction(formData: FormData) {
    "use server";
    const user = await requireAdmin();
    const run_id = String(formData.get("run_id") ?? "").trim();
    const row_number = Number(formData.get("row_number") ?? 0);
    const venue_id = String(formData.get("venue_id") ?? "").trim();

    if (!run_id || !Number.isFinite(row_number) || row_number <= 0 || !venue_id) {
      redirectWithNoticeAndQuery("/admin/venues/import", "Sweep failed: missing parameters.", { run_id });
    }

    const res = await runVenueSweepToDraftUploads({ venueId: venue_id, createdBy: user.id }).catch((err: any) => ({
      ok: false as const,
      reason: String(err?.message ?? "unknown_error"),
    }));

    const payload: any = {
      sweep_ran_at: new Date().toISOString(),
    };
    if ((res as any)?.ok) {
      payload.sweep_result = res;
      payload.sweep_error = null;
    } else {
      payload.sweep_result = null;
      payload.sweep_error = String((res as any)?.reason ?? "sweep_failed");
    }

    await supabaseAdmin
      .from("venue_import_run_rows" as any)
      .update(payload)
      .eq("run_id", run_id)
      .eq("row_number", row_number);

    if ((res as any)?.ok) {
      const summary = `Venue sweep: sources+${(res as any).inserted_sources ?? 0}, tournaments+${(res as any).imported_tournaments ?? 0}`;
      redirectWithNoticeAndQuery("/admin/venues/import", summary, { run_id });
    }

    redirectWithNoticeAndQuery("/admin/venues/import", `Venue sweep failed: ${(res as any)?.reason ?? "unknown error"}`, { run_id });
  }

  const run = runId
    ? await supabaseAdmin.from("venue_import_runs" as any).select("*").eq("id", runId).maybeSingle()
    : null;
  const runData = (run as any)?.data as any | null;

  const rows =
    runId && runData?.id
      ? await supabaseAdmin
          .from("venue_import_run_rows" as any)
          .select(
            "row_number,venue_name,venue_address,city,state,zip,sport,venue_url,action,matched_venue_id,reason,sweep_ran_at,sweep_result,sweep_error"
          )
          .eq("run_id", runId)
          .order("row_number", { ascending: true })
          .limit(250)
      : null;

  return (
    <div style={{ padding: 18 }}>
      <AdminNav />
      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>Venue CSV Import</h1>
      <p style={{ color: "#374151", marginTop: 0, maxWidth: 900 }}>
        Upload a venues-only CSV. Default is a dry run (no inserts). Rows that look like possible duplicates will be flagged as{" "}
        <code>needs_review</code> instead of auto-inserted.
      </p>

      {notice ? (
        <div style={{ padding: 12, border: "1px solid #bfdbfe", background: "#eff6ff", borderRadius: 10, marginBottom: 12 }}>
          <strong>Notice:</strong> {notice}
        </div>
      ) : null}

      <form action={importVenuesAction} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        <input type="file" name="upload" accept=".csv,text/csv" />
        <button type="submit" name="mode" value="dry_run" style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}>
          Dry run
        </button>
        <button
          type="submit"
          name="mode"
          value="apply"
          style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #111827", background: "#111827", color: "white" }}
        >
          Import (insert new)
        </button>
        <span style={{ color: "#6b7280", fontSize: 13 }}>
          Primary columns: <code>venue_name</code>, <code>venue_address</code>. Aliases: <code>name</code>, <code>address</code>,{" "}
          <code>website/url</code> → <code>venue_url</code>.
        </span>
      </form>

      {runId && runData ? (
        <div style={{ marginBottom: 16, border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 800 }}>Run</div>
              <div style={{ fontFamily: "monospace", fontSize: 12 }}>{runId}</div>
              <div style={{ color: "#6b7280", fontSize: 13 }}>
                {runData.filename ? (
                  <>
                    File: <code>{runData.filename}</code>
                  </>
                ) : null}
              </div>
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Total</div>
                <div style={{ fontWeight: 900 }}>{runData.total_rows ?? 0}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Inserted</div>
                <div style={{ fontWeight: 900 }}>{runData.inserted ?? 0}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Existing</div>
                <div style={{ fontWeight: 900 }}>{runData.skipped_existing ?? 0}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Needs review</div>
                <div style={{ fontWeight: 900 }}>{runData.needs_review ?? 0}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Invalid</div>
                <div style={{ fontWeight: 900 }}>{runData.invalid ?? 0}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Errors</div>
                <div style={{ fontWeight: 900 }}>{runData.parse_errors ?? 0}</div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Link
              href={`/api/admin/venues/import/export?run_id=${encodeURIComponent(runId)}`}
              style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #e5e7eb", textDecoration: "none" }}
            >
              Download results CSV
            </Link>
            {runData.summary ? <span style={{ color: "#6b7280", fontSize: 13 }}>{runData.summary}</span> : null}
          </div>
        </div>
      ) : null}

      {rows?.data?.length ? (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: 10, background: "#f9fafb", fontWeight: 800 }}>
            First {rows.data.length} rows
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f3f4f6" }}>
                {["#", "Venue", "City/State", "Action", "Matched", "Sweep", "Reason"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: 8, fontSize: 12, color: "#374151", borderBottom: "1px solid #e5e7eb" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.data.map((r: any) => (
                <tr key={r.row_number} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: 8, fontFamily: "monospace", fontSize: 12, color: "#6b7280" }}>{r.row_number}</td>
                  <td style={{ padding: 8 }}>
                    <div style={{ fontWeight: 800 }}>{r.venue_name}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>{r.venue_address}</div>
                  </td>
                  <td style={{ padding: 8, fontSize: 13 }}>
                    {(r.city ?? "").trim() || "—"}, {(r.state ?? "").trim() || "—"}{" "}
                    {r.zip ? <span style={{ color: "#6b7280" }}> {r.zip}</span> : null}
                  </td>
                  <td style={{ padding: 8, fontFamily: "monospace", fontSize: 12 }}>{r.action}</td>
                  <td style={{ padding: 8, fontFamily: "monospace", fontSize: 12 }}>
                    {r.matched_venue_id ? <Link href={`/admin/venues/${r.matched_venue_id}`}>{r.matched_venue_id.slice(0, 8)}</Link> : "—"}
                  </td>
                  <td style={{ padding: 8, fontSize: 12 }}>
                    {r.matched_venue_id && (r.action === "inserted" || r.action === "skipped_existing") ? (
                      <form action={sweepVenueAction}>
                        <input type="hidden" name="run_id" value={runId ?? ""} />
                        <input type="hidden" name="row_number" value={String(r.row_number)} />
                        <input type="hidden" name="venue_id" value={String(r.matched_venue_id)} />
                        <button
                          type="submit"
                          style={{
                            padding: "6px 10px",
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                            background: "white",
                            cursor: "pointer",
                          }}
                        >
                          Sweep venue
                        </button>
                      </form>
                    ) : (
                      <span style={{ color: "#9ca3af" }}>—</span>
                    )}
                    {r.sweep_error ? (
                      <div style={{ marginTop: 6, color: "#b91c1c", fontSize: 11 }}>error</div>
                    ) : r.sweep_result?.imported_tournaments ? (
                      <div style={{ marginTop: 6, color: "#065f46", fontSize: 11 }}>
                        +{r.sweep_result.imported_tournaments} tournaments
                      </div>
                    ) : r.sweep_ran_at ? (
                      <div style={{ marginTop: 6, color: "#6b7280", fontSize: 11 }}>swept</div>
                    ) : null}
                  </td>
                  <td style={{ padding: 8, fontSize: 12, color: "#6b7280" }}>
                    <div>{r.reason ?? ""}</div>
                    {r.sweep_error ? <div style={{ marginTop: 4 }}>sweep_error: {r.sweep_error}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : runId ? (
        <div style={{ color: "#6b7280" }}>No rows found for this run id.</div>
      ) : null}
    </div>
  );
}
