import { redirect } from "next/navigation";
import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export default async function OutreachCreatePage({
  searchParams,
}: {
  searchParams?: { notice?: string };
}) {
  await requireAdmin();
  const notice = searchParams?.notice ?? "";

  async function createOutreachAction(formData: FormData) {
    "use server";
    await requireAdmin();
    const limitInput = Number(formData.get("limit") ?? "50");
    const limit = Number.isFinite(limitInput) ? Math.max(1, Math.min(limitInput, 200)) : 50;

    const { data: tournaments } = await supabaseAdmin
      .from("tournaments" as any)
      .select("id,tournament_director,tournament_director_email,do_not_contact")
      .not("tournament_director_email", "is", null)
      .eq("do_not_contact", false)
      .order("updated_at", { ascending: false })
      .limit(limit);

    const tournamentIds = (tournaments ?? [])
      .filter((row: any) => row.id && row.tournament_director_email)
      .map((row: any) => row.id);

    if (!tournamentIds.length) {
      redirect("/admin/outreach/create?notice=No%20eligible%20tournaments%20found");
    }

    const { data: existingRows } = await supabaseAdmin
      .from("tournament_outreach" as any)
      .select("tournament_id")
      .in("tournament_id", tournamentIds);

    const existingSet = new Set((existingRows ?? []).map((row: any) => row.tournament_id));
    const toInsert = (tournaments ?? [])
      .filter((row: any) => row.id && row.tournament_director_email && !existingSet.has(row.id))
      .map((row: any) => ({
        tournament_id: row.id,
        contact_name: row.tournament_director ?? null,
        contact_email: row.tournament_director_email,
        status: "draft",
      }));

    if (!toInsert.length) {
      redirect("/admin/outreach/create?notice=No%20new%20outreach%20rows%20to%20create");
    }

    await supabaseAdmin.from("tournament_outreach" as any).insert(toInsert);
    redirect(`/admin/outreach?notice=${encodeURIComponent(`Created ${toInsert.length} outreach rows`)}`);
  }

  return (
    <main className="pitchWrap">
      <section className="field">
        <AdminNav />
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>Create outreach rows</h1>
          <p style={{ color: "#555", marginTop: 0 }}>
            Generate draft outreach entries for tournaments that have director emails and are not marked do-not-contact.
          </p>
          {notice ? (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: "1px solid #cbd5f5", background: "#eef2ff" }}>
              {notice}
            </div>
          ) : null}
          <form action={createOutreachAction} style={{ marginTop: 16, display: "grid", gap: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 700 }}>
              Max tournaments to scan
              <input
                type="number"
                name="limit"
                defaultValue={50}
                min={1}
                max={200}
                style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>
            <button
              style={{ padding: "10px 14px", borderRadius: 10, border: "none", background: "#111", color: "#fff", fontWeight: 900 }}
            >
              Create outreach rows
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
