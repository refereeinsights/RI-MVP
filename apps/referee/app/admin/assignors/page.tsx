import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import Link from "next/link";

export const runtime = "nodejs";

type SearchParams = {
  q?: string;
  notice?: string;
  error?: string;
};

type AssignorRow = {
  id: string;
  display_name: string | null;
  base_city: string | null;
  base_state: string | null;
  last_seen_at: string | null;
  confidence: number | null;
  review_status: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

function normalizeType(row: any) {
  return String(row?.type ?? row?.contact_type ?? row?.kind ?? "").toLowerCase();
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
            background: item.href.endsWith("/assignors") ? "#0f172a" : "#f9fafb",
            color: item.href.endsWith("/assignors") ? "#fff" : "#0f172a",
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

export default async function AssignorsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const q = (searchParams.q ?? "").trim();
  const notice = searchParams.notice ?? "";
  const error = searchParams.error ?? "";

  const selectColumns =
    "id,display_name,base_city,base_state,last_seen_at,confidence,review_status";

  let assignors: AssignorRow[] = [];
  if (!q) {
    const { data } = await supabaseAdmin
      .from("assignors" as any)
      .select(selectColumns)
      .order("last_seen_at", { ascending: false })
      .limit(100);
    assignors = (data ?? []) as AssignorRow[];
  } else {
    const { data: nameMatches } = await supabaseAdmin
      .from("assignors" as any)
      .select(selectColumns)
      .ilike("display_name", `%${q}%`)
      .limit(100);

    const { data: contactMatches } = await supabaseAdmin
      .from("assignor_contacts" as any)
      .select("assignor_id")
      .ilike("normalized_value", `%${q}%`)
      .limit(200);

    const nameRows = (nameMatches ?? []) as AssignorRow[];
    const seen = new Set(nameRows.map((row) => row.id));
    const contactIds = Array.from(
      new Set((contactMatches ?? []).map((row: any) => row.assignor_id).filter(Boolean))
    ).filter((id) => !seen.has(id)) as string[];

    if (contactIds.length) {
      const { data: contactAssignors } = await supabaseAdmin
        .from("assignors" as any)
        .select(selectColumns)
        .in("id", contactIds)
        .limit(100);
      assignors = [...nameRows, ...((contactAssignors ?? []) as AssignorRow[])].slice(0, 100);
    } else {
      assignors = nameRows;
    }
  }

  const assignorIds = assignors.map((row) => row.id);

  const { data: contacts } = assignorIds.length
    ? await supabaseAdmin
        .from("assignor_contacts" as any)
        .select("assignor_id,type,contact_type,value,normalized_value,is_primary")
        .in("assignor_id", assignorIds)
    : { data: [] as any[] };

  const { data: coverage } = assignorIds.length
    ? await supabaseAdmin
        .from("assignor_coverage" as any)
        .select("assignor_id,sport")
        .in("assignor_id", assignorIds)
    : { data: [] as any[] };

  const contactsByAssignor = new Map<string, any[]>();
  (contacts ?? []).forEach((row: any) => {
    const list = contactsByAssignor.get(row.assignor_id) ?? [];
    list.push(row);
    contactsByAssignor.set(row.assignor_id, list);
  });

  const sportsByAssignor = new Map<string, string[]>();
  (coverage ?? []).forEach((row: any) => {
    if (!row.assignor_id || !row.sport) return;
    const list = sportsByAssignor.get(row.assignor_id) ?? [];
    if (!list.includes(row.sport)) list.push(row.sport);
    sportsByAssignor.set(row.assignor_id, list);
  });

  const pickPrimary = (rows: any[], kind: "email" | "phone") => {
    const filtered = rows.filter((r) => normalizeType(r) === kind);
    const primary = filtered.find((r) => r.is_primary);
    const fallback = filtered[0];
    return (primary ?? fallback)?.value ?? (primary ?? fallback)?.normalized_value ?? null;
  };

  return (
    <div style={{ padding: 24 }}>
      <AdminNav />
      <h1 style={{ fontSize: 20, fontWeight: 900, marginBottom: 4 }}>Assignors Directory</h1>
      <AssignorAdminNav />
      {notice ? (
        <div style={{ background: "#ecfccb", border: "1px solid #bef264", padding: 8, borderRadius: 8, marginBottom: 10 }}>
          {notice}
        </div>
      ) : null}
      {error ? (
        <div style={{ background: "#fee2e2", border: "1px solid #fecaca", padding: 8, borderRadius: 8, marginBottom: 10 }}>
          Something went wrong.
        </div>
      ) : null}

      <form method="get" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <input
          name="q"
          defaultValue={q}
          placeholder="Search assignors, email, phone..."
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc", minWidth: 260 }}
        />
        <button
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "none",
            background: "#0f172a",
            color: "#fff",
            fontWeight: 800,
          }}
        >
          Search
        </button>
      </form>

      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, background: "#fff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {["Name", "Email", "Phone", "Location", "Sports", "Last Seen", "Confidence", "Status"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "6px 4px", borderBottom: "1px solid #eee" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {assignors.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: 8, color: "#666" }}>
                  No assignors found.
                </td>
              </tr>
            ) : (
              assignors.map((assignor) => {
                const rowContacts = contactsByAssignor.get(assignor.id) ?? [];
                const email = pickPrimary(rowContacts, "email");
                const phone = pickPrimary(rowContacts, "phone");
                const sports = sportsByAssignor.get(assignor.id) ?? [];
                return (
                  <tr key={assignor.id}>
                    <td style={{ padding: "6px 4px" }}>
                      <Link href={`/admin/assignors/${assignor.id}`} style={{ color: "#0f172a", fontWeight: 700 }}>
                        {assignor.display_name ?? "Unnamed"}
                      </Link>
                    </td>
                    <td style={{ padding: "6px 4px" }}>{email ?? "—"}</td>
                    <td style={{ padding: "6px 4px" }}>{phone ?? "—"}</td>
                    <td style={{ padding: "6px 4px" }}>
                      {[assignor.base_city, assignor.base_state].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td style={{ padding: "6px 4px" }}>{sports.length ? sports.join(", ") : "—"}</td>
                    <td style={{ padding: "6px 4px" }}>{formatDate(assignor.last_seen_at)}</td>
                    <td style={{ padding: "6px 4px" }}>{assignor.confidence ?? "—"}</td>
                    <td style={{ padding: "6px 4px" }}>{assignor.review_status ?? "—"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
