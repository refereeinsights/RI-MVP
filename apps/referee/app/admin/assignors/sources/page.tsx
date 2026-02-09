import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { normalizeStateAbbr } from "@/lib/usStates";

export const runtime = "nodejs";

type SearchParams = {
  notice?: string;
  error?: string;
  run_id?: string;
};

type AssignorSource = {
  id: string;
  source_name: string | null;
  source_url: string | null;
  source_kind: string | null;
  default_sport: string | null;
  default_state: string | null;
  created_at: string | null;
};

type CrawlRun = {
  id: string;
  source_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  status: string | null;
  query_text: string | null;
  query_payload?: any;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function extractAssignorCount(data: any) {
  if (typeof data === "number") return data;
  if (!data) return null;
  if (typeof data === "object") {
    if (typeof data.inserted === "number") return data.inserted;
    if (typeof data.count === "number") return data.count;
    if (typeof data.processed === "number") return data.processed;
    if (typeof data.assignors === "number") return data.assignors;
    if (Array.isArray(data) && typeof data[0] === "number") return data[0];
  }
  return null;
}

function AssignorAdminNav() {
  return (
    <div style={{ display: "flex", gap: 10, margin: "12px 0 18px" }}>
      {[
        { href: "/admin/assignors", label: "Directory" },
        { href: "/admin/assignors/review", label: "Review" },
        { href: "/admin/assignors/zip-missing", label: "Missing ZIPs" },
        { href: "/admin/assignors/sources", label: "Sources" },
      ].map((item) => (
        <a
          key={item.href}
          href={item.href}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: item.href.endsWith("/sources") ? "#0f172a" : "#f9fafb",
            color: item.href.endsWith("/sources") ? "#fff" : "#0f172a",
            fontWeight: 700,
            textDecoration: "none",
            fontSize: 13,
          }}
        >
          {item.label}
        </a>
      ))}
    </div>
  );
}

export default async function AssignorSourcesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const notice = searchParams.notice ?? "";
  const error = searchParams.error ?? "";
  const runIdNotice = searchParams.run_id ?? "";

  const { data: sourceRows } = await supabaseAdmin
    .from("assignor_sources" as any)
    .select("id,source_name,source_url,source_kind,default_sport,default_state,created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  const sources = (sourceRows ?? []) as AssignorSource[];
  const sourceIds = sources.map((s) => s.id);

  const { data: runRows } = sourceIds.length
    ? await supabaseAdmin
        .from("assignor_crawl_runs" as any)
        .select("id,source_id,started_at,finished_at,status,query_text,query_payload")
        .in("source_id", sourceIds)
        .order("started_at", { ascending: false })
        .limit(400)
    : { data: [] as any[] };

  const runsBySource = new Map<string, CrawlRun[]>();
  (runRows ?? []).forEach((run: any) => {
    if (!run.source_id) return;
    const list = runsBySource.get(run.source_id) ?? [];
    if (list.length < 20) {
      list.push(run as CrawlRun);
      runsBySource.set(run.source_id, list);
    }
  });

  async function processRunAction(formData: FormData) {
    "use server";
    await requireAdmin();
    const run_id = String(formData.get("run_id") || "");
    if (!run_id) return;
    const { data: rpcData, error: rpcError } = await (supabaseAdmin as any).rpc("process_assignor_crawl_run", {
      p_crawl_run_id: run_id,
    });
    if (rpcError) {
      console.error("process_assignor_crawl_run failed", rpcError);
      redirect("/admin/assignors/sources?error=process_run");
    }
    const { data: sourceRows } = await supabaseAdmin
      .from("assignor_source_records" as any)
      .select("assignor_id,raw")
      .eq("crawl_run_id", run_id);
    const assignorIds = Array.from(
      new Set((sourceRows ?? []).map((row: any) => row.assignor_id).filter(Boolean))
    ) as string[];
    if (assignorIds.length) {
      await supabaseAdmin
        .from("assignors" as any)
        .update({ review_status: "needs_review" })
        .in("id", assignorIds);
    }
    for (const row of sourceRows ?? []) {
      const assignorId = (row as any)?.assignor_id ?? null;
      const rawState = (row as any)?.raw?.state ?? null;
      const normalized = normalizeStateAbbr(rawState);
      if (assignorId && normalized) {
        await supabaseAdmin.from("assignors" as any).update({ base_state: normalized }).eq("id", assignorId);
      }
    }
    revalidatePath("/admin/assignors/sources");
    revalidatePath("/admin/assignors");
    const extracted = extractAssignorCount(rpcData);
    const noticeBase = extracted != null ? `Run processed: ${extracted} assignor(s)` : "Run processed";
    const notice = assignorIds.length ? `${noticeBase} • ${assignorIds.length} queued for review` : noticeBase;
    redirect(`/admin/assignors/sources?notice=${encodeURIComponent(notice)}&run_id=${run_id}`);
  }

  async function createRunAction(formData: FormData) {
    "use server";
    await requireAdmin();
    const source_id = String(formData.get("source_id") || "");
    const query_text = String(formData.get("query_text") || "").trim() || null;
    const payloadRaw = String(formData.get("query_payload") || "").trim();
    let query_payload: Record<string, any> | null = null;
    if (payloadRaw) {
      try {
        query_payload = JSON.parse(payloadRaw);
      } catch (err) {
        console.error("Invalid query payload JSON", err);
        redirect("/admin/assignors/sources?error=payload_json");
      }
    }

    const { data: sourceRow } = await supabaseAdmin
      .from("assignor_sources" as any)
      .select("id,default_sport,default_state")
      .eq("id", source_id)
      .maybeSingle();

    const defaultSport = typeof (sourceRow as any)?.default_sport === "string" ? (sourceRow as any).default_sport : "";
    const defaultState = typeof (sourceRow as any)?.default_state === "string" ? (sourceRow as any).default_state : "";
    if (!defaultSport) {
      redirect("/admin/assignors/sources?error=missing_source_sport");
    }

    const { data: createdRun, error: insertError } = await supabaseAdmin
      .from("assignor_crawl_runs" as any)
      .insert({
        source_id,
        query_text,
        query_payload,
        status: "running",
      })
      .select("id");

    if (insertError) {
      console.error("assignor_crawl_runs insert failed", insertError);
      redirect("/admin/assignors/sources?error=create_run");
    }
    const runId = (createdRun as any)?.[0]?.id;
    if (!runId) {
      revalidatePath("/admin/assignors/sources");
      redirect("/admin/assignors/sources?notice=Run%20created");
    }

    const queries: string[] = [];
    if (query_text) queries.push(query_text);
    if (query_payload) {
      const payloadQueries = Array.isArray((query_payload as any).queries)
        ? (query_payload as any).queries.map((q: any) => String(q || "").trim()).filter(Boolean)
        : [];
      if (payloadQueries.length) queries.push(...payloadQueries);
      const payloadQ = String((query_payload as any).q ?? "").trim();
      if (payloadQ) queries.push(payloadQ);
    }
    const uniqueQueries = Array.from(new Set(queries)).filter(Boolean);
    if (!uniqueQueries.length) {
      redirect(`/admin/assignors/sources?error=missing_query&run_id=${runId}`);
    }

    const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
    const resp = await fetch(`${baseUrl}/api/atlas/discover-and-queue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookies().toString(),
      },
      body: JSON.stringify({
        queries: uniqueQueries,
        sport: defaultSport,
        state: defaultState,
        target: "assignor",
        crawl_run_id: runId,
      }),
    });
    const discoveryJson = await resp.json().catch(() => null);
    if (!resp.ok || discoveryJson?.error) {
      const msg = encodeURIComponent(String(discoveryJson?.error ?? `HTTP ${resp.status}`).slice(0, 180));
      await supabaseAdmin
        .from("assignor_crawl_runs" as any)
        .update({ status: "failed", finished_at: new Date().toISOString() })
        .eq("id", runId);
      redirect(`/admin/assignors/sources?error=${msg}&run_id=${runId}`);
    }

    await supabaseAdmin
      .from("assignor_crawl_runs" as any)
      .update({ status: "success", finished_at: new Date().toISOString() })
      .eq("id", runId);

    const { data: sourceRows } = await supabaseAdmin
      .from("assignor_source_records" as any)
      .select("id")
      .eq("crawl_run_id", runId)
      .eq("review_status", "needs_review");
    const reviewCount = sourceRows?.length ?? 0;

    revalidatePath("/admin/assignors/sources");
    revalidatePath("/admin/assignors/review");
    const inserted = Number(discoveryJson?.inserted ?? 0);
    const discoveryNote = Number.isFinite(inserted) ? ` • ${inserted} URL(s) discovered` : "";
    const reviewNote = ` • ${reviewCount} record(s) ready for review`;
    redirect(
      `/admin/assignors/sources?notice=${encodeURIComponent(`Crawl complete${discoveryNote}${reviewNote}`)}&run_id=${runId}`
    );
  }

  async function runCnraCrawlAction(formData: FormData) {
    "use server";
    await requireAdmin();
    const source_id = String(formData.get("source_id") || "");
    const zip = String(formData.get("zip") || "").trim();
    const radiusRaw = String(formData.get("radius_miles") || "").trim();
    const cookie = String(formData.get("cookie") || "").trim();
    const radius_miles = Number(radiusRaw);
    if (!source_id || !zip || !Number.isFinite(radius_miles)) {
      redirect("/admin/assignors/sources?error=cnra_input");
    }
    const body: Record<string, any> = { zip, radius_miles, source_id };
    if (cookie) body.cookie = cookie;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (!supabaseUrl || !serviceKey) {
      redirect("/admin/assignors/sources?error=missing_supabase_env");
    }
    const resp = await fetch(`${supabaseUrl}/functions/v1/assignor-crawl-cnra`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    const data = text ? JSON.parse(text) : {};
    if (!resp.ok || data?.error) {
      const msg = encodeURIComponent(String(data?.error ?? `HTTP ${resp.status}`).slice(0, 180));
      redirect(`/admin/assignors/sources?error=${msg}`);
    }
    revalidatePath("/admin/assignors/sources");
    revalidatePath("/admin/assignors/review");
    const inserted = data?.inserted ?? 0;
    redirect(`/admin/assignors/sources?notice=${encodeURIComponent(`CNRA inserted ${inserted} records`)}`);
  }

  return (
    <div style={{ padding: 24 }}>
      <AdminNav />
      <h1 style={{ fontSize: 20, fontWeight: 900, marginBottom: 4 }}>Assignor Sources</h1>
      <AssignorAdminNav />
      {notice ? (
        <div style={{ background: "#ecfccb", border: "1px solid #bef264", padding: 8, borderRadius: 8, marginBottom: 10 }}>
          {notice}
        </div>
      ) : null}
      {error ? (
        <div style={{ background: "#fee2e2", border: "1px solid #fecaca", padding: 8, borderRadius: 8, marginBottom: 10 }}>
          {`Action failed: ${decodeURIComponent(error)}`}
        </div>
      ) : null}

      {sources.length === 0 ? (
        <div style={{ color: "#555" }}>No active sources.</div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {sources.map((source) => {
            const runs = runsBySource.get(source.id) ?? [];
            const isCnra = source.source_url === "https://www.cnra.net/assignor/";
            const cnraSearches = isCnra
              ? (() => {
                  const uniqueByZip = new Map<string, any>();
                  const ordered: any[] = [];
                  for (const run of runs) {
                    const zip = run.query_payload?.zip ?? null;
                    const radius = run.query_payload?.radius_miles ?? null;
                    if (!zip || !radius) continue;
                    if (uniqueByZip.has(zip)) continue;
                    const row = {
                      id: run.id,
                      started_at: run.started_at,
                      status: run.status,
                      zip,
                      radius,
                    };
                    uniqueByZip.set(zip, row);
                    ordered.push(row);
                  }
                  return ordered.slice(0, 10);
                })()
              : [];
            return (
              <div key={source.id} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14, background: "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>{source.source_name ?? "Unnamed source"}</div>
                    <div style={{ color: "#555", fontSize: 13 }}>
                      {source.source_kind ?? "—"} {source.default_sport ? `• ${source.default_sport}` : ""}{" "}
                      {source.default_state ? `• ${source.default_state}` : ""}
                    </div>
                    {source.source_url ? (
                      <a href={source.source_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#0f172a" }}>
                        {source.source_url}
                      </a>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 12, color: "#555" }}>Created: {formatDate(source.created_at)}</div>
                </div>

                {isCnra ? (
                  <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>Run CNRA crawl</div>
                    <form action={runCnraCrawlAction} style={{ display: "grid", gap: 8 }}>
                      <input type="hidden" name="source_id" value={source.id} />
                      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
                        <label style={{ fontSize: 12, fontWeight: 700 }}>
                          Zip
                          <input name="zip" placeholder="94110" style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }} />
                        </label>
                        <label style={{ fontSize: 12, fontWeight: 700 }}>
                          Radius (miles)
                          <input
                            name="radius_miles"
                            type="number"
                            min={1}
                            max={200}
                            defaultValue={50}
                            style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                          />
                        </label>
                        <label style={{ fontSize: 12, fontWeight: 700 }}>
                          Cookie (optional)
                          <input
                            name="cookie"
                            type="password"
                            placeholder="cf_clearance=..."
                            style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                          />
                        </label>
                      </div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>
                        Optional: only if CNRA blocks the request.
                      </div>
                      <button
                        style={{
                          justifySelf: "flex-start",
                          padding: "8px 12px",
                          borderRadius: 8,
                          border: "none",
                          background: "#0f172a",
                          color: "#fff",
                          fontWeight: 800,
                        }}
                      >
                        Run CNRA Crawl
                      </button>
                    </form>
                    {cnraSearches.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Recent CNRA searches</div>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                          <thead>
                            <tr>
                              {["Zip", "Radius (mi)", "Started", "Status"].map((h) => (
                                <th key={h} style={{ textAlign: "left", padding: "6px 4px", borderBottom: "1px solid #e2e8f0" }}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {cnraSearches.map((row) => (
                              <tr key={row.id}>
                                <td style={{ padding: "6px 4px" }}>{row.zip}</td>
                                <td style={{ padding: "6px 4px" }}>{row.radius}</td>
                                <td style={{ padding: "6px 4px" }}>{formatDate(row.started_at)}</td>
                                <td style={{ padding: "6px 4px" }}>{row.status ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : null}

                <div style={{ marginTop: 10, borderTop: "1px solid #eee", paddingTop: 10 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Recent crawl runs</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr>
                        {["Started", "Finished", "Status", "Query", ""].map((h) => (
                          <th key={h} style={{ textAlign: "left", padding: "6px 4px", borderBottom: "1px solid #eee" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {runs.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ padding: 8, color: "#666" }}>
                            No crawl runs yet.
                          </td>
                        </tr>
                      ) : (
                        runs.map((run) => (
                          <tr key={run.id}>
                            <td style={{ padding: "6px 4px" }}>{formatDate(run.started_at)}</td>
                            <td style={{ padding: "6px 4px" }}>{formatDate(run.finished_at)}</td>
                            <td style={{ padding: "6px 4px" }}>{run.status ?? "—"}</td>
                            <td style={{ padding: "6px 4px", maxWidth: 320 }}>{run.query_text ?? "—"}</td>
                            <td style={{ padding: "6px 4px" }}>
                              <form action={processRunAction}>
                                <input type="hidden" name="run_id" value={run.id} />
                                <button
                                  style={{
                                    padding: "6px 10px",
                                    borderRadius: 8,
                                    border: "1px solid #0f172a",
                                    background: "#0f172a",
                                    color: "#fff",
                                    fontWeight: 700,
                                    fontSize: 12,
                                  }}
                                >
                                  Process Run
                                </button>
                              </form>
                              {notice && runIdNotice === run.id ? (
                                <div style={{ marginTop: 6, fontSize: 12, color: "#166534" }}>
                                  {notice}
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 12 }}>
                  <form action={createRunAction} style={{ display: "grid", gap: 8 }}>
                    <input type="hidden" name="source_id" value={source.id} />
                    <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
                      <label style={{ fontSize: 12, fontWeight: 700 }}>
                        Query text
                        <input name="query_text" style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }} />
                      </label>
                      <label style={{ fontSize: 12, fontWeight: 700 }}>
                        Query payload (JSON)
                        <textarea
                          name="query_payload"
                          rows={2}
                          placeholder='{"q":"example"}'
                          style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                        />
                      </label>
                    </div>
                    <button
                      style={{
                        justifySelf: "flex-start",
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "none",
                        background: "#111827",
                        color: "#fff",
                        fontWeight: 800,
                      }}
                    >
                      Create & Crawl Run
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
