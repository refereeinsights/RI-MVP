import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import Link from "next/link";

export const runtime = "nodejs";

type AssignorDetailRow = {
  id: string;
  display_name: string | null;
  base_city: string | null;
  base_state: string | null;
  last_seen_at: string | null;
  confidence: number | null;
  review_status: string | null;
};

export default async function AssignorDetailPage({ params }: { params: { id: string } }) {
  await requireAdmin();
  const { data } = await (supabaseAdmin.from("assignors" as any) as any)
    .select("id,display_name,base_city,base_state,last_seen_at,confidence,review_status")
    .eq("id", params.id)
    .maybeSingle();
  const assignor = (data ?? null) as AssignorDetailRow | null;

  return (
    <div style={{ padding: 24 }}>
      <AdminNav />
      <h1 style={{ fontSize: 20, fontWeight: 900, marginBottom: 8 }}>Assignor Detail</h1>
      <div style={{ marginBottom: 12 }}>
        <Link href="/admin/assignors" style={{ color: "#0f172a", fontWeight: 700 }}>
          ← Back to Assignors
        </Link>
      </div>

      {!assignor ? (
        <div style={{ color: "#555" }}>Assignor not found.</div>
      ) : (
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14, background: "#fff" }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{assignor.display_name ?? "Unnamed"}</div>
          <div style={{ color: "#555", fontSize: 13, marginTop: 6 }}>
            Location: {[assignor.base_city, assignor.base_state].filter(Boolean).join(", ") || "—"}
          </div>
          <div style={{ color: "#555", fontSize: 13 }}>
            Last seen: {assignor.last_seen_at ? new Date(assignor.last_seen_at).toLocaleString() : "—"}
          </div>
          <div style={{ color: "#555", fontSize: 13 }}>Confidence: {assignor.confidence ?? "—"}</div>
          <div style={{ color: "#555", fontSize: 13 }}>Status: {assignor.review_status ?? "—"}</div>
          <div style={{ marginTop: 10, color: "#555", fontSize: 13 }}>
            More details coming soon.
          </div>
        </div>
      )}
    </div>
  );
}
