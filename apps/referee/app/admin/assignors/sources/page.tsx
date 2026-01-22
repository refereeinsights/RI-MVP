import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const runtime = "nodejs";

type SearchParams = {
  notice?: string;
  error?: string;
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
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function AssignorAdminNav() {
  return (
    <div style={{ display: "flex", gap: 10, margin: "12px 0 18px" }}>
      {[
        { href: "/admin/assignors", label: "Directory" },
        { href: "/admin/assignors/review", label: "Review" },
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
        .select("id,source_id,started_at,finished_at,status,query_text")
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
    const { error: rpcError } = await (supabaseAdmin as any).rpc("process_assignor_crawl_run", {
      p_crawl_run_id: run_id,
    });
    if (rpcError) {
      console.error("process_assignor_crawl_run failed", rpcError);
      redirect("/admin/assignors/sources?error=process_run");
    }
    revalidatePath("/admin/assignors/sources");
    revalidatePath("/admin/assignors");
    redirect("/admin/assignors/sources?notice=Run%20processed");
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

    const { error: insertError } = await supabaseAdmin
      .from("assignor_crawl_runs" as any)
      .insert({
        source_id,
        query_text,
        query_payload,
        status: "running",
      });

    if (insertError) {
      console.error("assignor_crawl_runs insert failed", insertError);
      redirect("/admin/assignors/sources?error=create_run");
    }
    revalidatePath("/admin/assignors/sources");
    redirect("/admin/assignors/sources?notice=Run%20created");
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
    const { data, error: invokeError } = await (supabaseAdmin as any).functions.invoke(
      "assignor-crawl-cnra",
      { body }
    );
    if (invokeError) {
      console.error("assignor-crawl-cnra failed", invokeError);
      redirect("/admin/assignors/sources?error=cnra_invoke");
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
          Action failed. Try again.
        </div>
      ) : null}

      {sources.length === 0 ? (
        <div style={{ color: "#555" }}>No active sources.</div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {sources.map((source) => {
            const runs = runsBySource.get(source.id) ?? [];
            const isCnra = source.source_url === "https://www.cnra.net/assignor/";
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
                      Create Crawl Run
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
