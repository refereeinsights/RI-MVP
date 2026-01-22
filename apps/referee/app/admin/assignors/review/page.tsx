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

type AssignorSourceRecord = {
  id: string;
  created_at: string | null;
  confidence: number | null;
  review_status: string | null;
  crawl_run_id: string | null;
  source_id: string | null;
  raw: Record<string, any> | null;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function parseIds(formData: FormData) {
  return formData
    .getAll("record_ids")
    .map((value) => String(value))
    .filter(Boolean);
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
            background: item.href.endsWith("/review") ? "#0f172a" : "#f9fafb",
            color: item.href.endsWith("/review") ? "#fff" : "#0f172a",
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

export default async function AssignorReviewPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();

  const notice = searchParams.notice ?? "";
  const error = searchParams.error ?? "";

  const { data: recordRows } = await supabaseAdmin
    .from("assignor_source_records" as any)
    .select("id,created_at,confidence,review_status,crawl_run_id,source_id,raw")
    .eq("review_status", "needs_review")
    .order("created_at", { ascending: false })
    .limit(100);

  const records = (recordRows ?? []) as AssignorSourceRecord[];
  const sourceIds = Array.from(new Set(records.map((r) => r.source_id).filter(Boolean))) as string[];
  const { data: sources } = sourceIds.length
    ? await supabaseAdmin
        .from("assignor_sources" as any)
        .select("id,source_name,source_url")
        .in("id", sourceIds)
    : { data: [] as any[] };

  const sourceMap = new Map(
    (sources ?? []).map((row: any) => [
      row.id,
      { name: row.source_name ?? "Unknown source", url: row.source_url ?? null },
    ])
  );

  async function approveAction(formData: FormData) {
    "use server";
    await requireAdmin();
    const id = String(formData.get("id") || "");
    if (!id) return;
    const { error: rpcError } = await (supabaseAdmin as any).rpc("process_assignor_source_record", {
      p_source_record_id: id,
    });
    if (rpcError) {
      console.error("process_assignor_source_record failed", rpcError);
      redirect("/admin/assignors/review?error=approve");
    }
    revalidatePath("/admin/assignors/review");
    revalidatePath("/admin/assignors");
    redirect("/admin/assignors/review?notice=Approved");
  }

  async function bulkApproveAction(formData: FormData) {
    "use server";
    await requireAdmin();
    const ids = parseIds(formData);
    if (!ids.length) return;
    for (const id of ids) {
      const { error: rpcError } = await (supabaseAdmin as any).rpc("process_assignor_source_record", {
        p_source_record_id: id,
      });
      if (rpcError) {
        console.error("bulk process_assignor_source_record failed", rpcError);
        redirect("/admin/assignors/review?error=approve");
      }
    }
    revalidatePath("/admin/assignors/review");
    revalidatePath("/admin/assignors");
    redirect("/admin/assignors/review?notice=Approved");
  }

  async function rejectAction(formData: FormData) {
    "use server";
    await requireAdmin();
    const id = String(formData.get("id") || "");
    if (!id) return;
    const { error: updateError } = await supabaseAdmin
      .from("assignor_source_records" as any)
      .update({ review_status: "rejected" })
      .eq("id", id);
    if (updateError) {
      console.error("assignor_source_records reject failed", updateError);
      redirect("/admin/assignors/review?error=reject");
    }
    revalidatePath("/admin/assignors/review");
    redirect("/admin/assignors/review?notice=Rejected");
  }

  async function bulkRejectAction(formData: FormData) {
    "use server";
    await requireAdmin();
    const ids = parseIds(formData);
    if (!ids.length) return;
    const { error: updateError } = await supabaseAdmin
      .from("assignor_source_records" as any)
      .update({ review_status: "rejected" })
      .in("id", ids);
    if (updateError) {
      console.error("bulk reject failed", updateError);
      redirect("/admin/assignors/review?error=reject");
    }
    revalidatePath("/admin/assignors/review");
    redirect("/admin/assignors/review?notice=Rejected");
  }

  async function blockAction(formData: FormData) {
    "use server";
    await requireAdmin();
    const id = String(formData.get("id") || "");
    if (!id) return;
    const { error: updateError } = await supabaseAdmin
      .from("assignor_source_records" as any)
      .update({ review_status: "blocked" })
      .eq("id", id);
    if (updateError) {
      console.error("assignor_source_records block failed", updateError);
      redirect("/admin/assignors/review?error=block");
    }
    revalidatePath("/admin/assignors/review");
    redirect("/admin/assignors/review?notice=Blocked");
  }

  async function bulkBlockAction(formData: FormData) {
    "use server";
    await requireAdmin();
    const ids = parseIds(formData);
    if (!ids.length) return;
    const { error: updateError } = await supabaseAdmin
      .from("assignor_source_records" as any)
      .update({ review_status: "blocked" })
      .in("id", ids);
    if (updateError) {
      console.error("bulk block failed", updateError);
      redirect("/admin/assignors/review?error=block");
    }
    revalidatePath("/admin/assignors/review");
    redirect("/admin/assignors/review?notice=Blocked");
  }

  async function processRunAction(formData: FormData) {
    "use server";
    await requireAdmin();
    const crawl_run_id = String(formData.get("crawl_run_id") || "");
    if (!crawl_run_id) return;
    const { error: rpcError } = await (supabaseAdmin as any).rpc("process_assignor_crawl_run", {
      p_crawl_run_id: crawl_run_id,
    });
    if (rpcError) {
      console.error("process_assignor_crawl_run failed", rpcError);
      redirect("/admin/assignors/review?error=process_run");
    }
    revalidatePath("/admin/assignors/review");
    revalidatePath("/admin/assignors");
    redirect("/admin/assignors/review?notice=Run%20processed");
  }

  return (
    <div style={{ padding: 24 }}>
      <AdminNav />
      <h1 style={{ fontSize: 20, fontWeight: 900, marginBottom: 4 }}>Assignor Review Queue</h1>
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

      <form
        id="bulk-assignor-review"
        action={bulkApproveAction}
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 12,
          alignItems: "center",
        }}
      >
        <button
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "none",
            background: "#0a7a2f",
            color: "#fff",
            fontWeight: 800,
          }}
        >
          Approve &amp; Upsert selected
        </button>
        <button
          formAction={bulkRejectAction}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #b91c1c",
            background: "#fff",
            color: "#b91c1c",
            fontWeight: 800,
          }}
        >
          Reject selected
        </button>
        <button
          formAction={bulkBlockAction}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #6b7280",
            background: "#f3f4f6",
            color: "#111827",
            fontWeight: 800,
          }}
        >
          Block selected
        </button>
        <div style={{ fontSize: 12, color: "#555" }}>
          Select rows below to enable bulk actions.
        </div>
      </form>

      {records.length === 0 ? (
        <div style={{ color: "#555" }}>No records waiting for review.</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {records.map((record) => {
            const raw = record.raw ?? {};
            const source = record.source_id ? sourceMap.get(record.source_id) : null;
            const orgName = raw.organization ?? raw.org_name ?? raw.org ?? null;
            return (
              <div
                key={record.id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 12,
                  padding: 14,
                  background: "#fff",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 260 }}>
                    <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                      <input type="checkbox" name="record_ids" value={record.id} form="bulk-assignor-review" />
                      Select
                    </label>
                    <div style={{ fontWeight: 900, fontSize: 16 }}>{raw.name ?? "Unnamed assignor"}</div>
                    <div style={{ color: "#555", fontSize: 13 }}>
                      {raw.email ?? "—"} {raw.phone ? `• ${raw.phone}` : ""}
                    </div>
                    <div style={{ color: "#555", fontSize: 13 }}>
                      {raw.city ?? "—"}, {raw.state ?? "—"} {raw.sport ? `• ${raw.sport}` : ""}
                    </div>
                    {orgName ? (
                      <div style={{ color: "#555", fontSize: 13 }}>Org: {orgName}</div>
                    ) : null}
                  </div>
                  <div style={{ minWidth: 200, fontSize: 13, color: "#333" }}>
                    <div>Confidence: {record.confidence ?? "—"}</div>
                    <div>Created: {formatDate(record.created_at)}</div>
                    <div>Crawl run: {record.crawl_run_id ?? "—"}</div>
                    <div>Source: {source?.name ?? "—"}</div>
                    {source?.url ? (
                      <a href={source.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#0f172a" }}>
                        Open source URL
                      </a>
                    ) : null}
                  </div>
                </div>

                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <form action={approveAction}>
                    <input type="hidden" name="id" value={record.id} />
                    <button
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "none",
                        background: "#0a7a2f",
                        color: "#fff",
                        fontWeight: 800,
                      }}
                    >
                      Approve &amp; Upsert
                    </button>
                  </form>
                  <form action={rejectAction}>
                    <input type="hidden" name="id" value={record.id} />
                    <button
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #b91c1c",
                        background: "#fff",
                        color: "#b91c1c",
                        fontWeight: 800,
                      }}
                    >
                      Reject
                    </button>
                  </form>
                  <form action={blockAction}>
                    <input type="hidden" name="id" value={record.id} />
                    <button
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #6b7280",
                        background: "#f3f4f6",
                        color: "#111827",
                        fontWeight: 800,
                      }}
                    >
                      Block
                    </button>
                  </form>
                  {record.crawl_run_id ? (
                    <form action={processRunAction}>
                      <input type="hidden" name="crawl_run_id" value={record.crawl_run_id} />
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
                        Process Crawl Run
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
