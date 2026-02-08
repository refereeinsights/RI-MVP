import AdminNav from "@/components/admin/AdminNav";
import AssignorZipBackfillList from "@/components/AssignorZipBackfillList";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type AssignorRow = {
  id: string;
  display_name: string | null;
  base_city: string | null;
  base_state: string | null;
  zip?: string | null;
};

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
            background: item.href.endsWith("/zip-missing") ? "#0f172a" : "#f9fafb",
            color: item.href.endsWith("/zip-missing") ? "#fff" : "#0f172a",
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

export default async function AssignorsZipMissingPage() {
  await requireAdmin();

  const assignorsMissingZip =
    (await supabaseAdmin
      .from("assignors" as any)
      .select("id,display_name,base_city,base_state,zip")
      .or("zip.is.null,zip.eq.")
      .not("base_city", "is", null)
      .limit(200)
      .then((res) => res.data ?? [])) as AssignorRow[];

  return (
    <div style={{ padding: 24 }}>
      <AdminNav />
      <h1 style={{ fontSize: 20, fontWeight: 900, marginBottom: 4 }}>Assignors Missing ZIPs</h1>
      <AssignorAdminNav />
      <AssignorZipBackfillList rows={assignorsMissingZip} />
    </div>
  );
}
