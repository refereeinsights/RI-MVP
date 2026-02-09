import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizeStateAbbr } from "@/lib/usStates";

export const runtime = "nodejs";

type AssignorDetailRow = {
  id: string;
  display_name: string | null;
  base_city: string | null;
  base_state: string | null;
  zip?: string | null;
  last_seen_at: string | null;
  confidence: number | null;
  review_status: string | null;
};

function normalizeContact(type: string, value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (type === "email") return trimmed.toLowerCase();
  if (type === "phone") return trimmed.replace(/[^\d+]/g, "");
  if (type === "website") return trimmed.toLowerCase();
  return trimmed;
}

export default async function AssignorDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { notice?: string };
}) {
  await requireAdmin();
  const { data } = await (supabaseAdmin.from("assignors" as any) as any)
    .select("id,display_name,base_city,base_state,zip,last_seen_at,confidence,review_status")
    .eq("id", params.id)
    .maybeSingle();
  const assignor = (data ?? null) as AssignorDetailRow | null;
  const { data: contactRows } = assignor
    ? await supabaseAdmin
        .from("assignor_contacts" as any)
        .select("type,value,is_primary")
        .eq("assignor_id", assignor.id)
    : { data: [] as any[] };
  const contacts = (contactRows ?? []) as Array<{ type?: string | null; value?: string | null; is_primary?: boolean | null }>;
  const primaryContact = (type: string, aliases: string[] = []) =>
    contacts.find((row) => row.type === type && row.is_primary) ??
    aliases.map((alias) => contacts.find((row) => row.type === alias && row.is_primary)).find(Boolean) ??
    contacts.find((row) => row.type === type) ??
    aliases.map((alias) => contacts.find((row) => row.type === alias)).find(Boolean) ??
    null;
  const emailContact = primaryContact("email");
  const phoneContact = primaryContact("phone");
  const websiteContact = primaryContact("website");
  const notice = searchParams?.notice ?? "";

  async function updateAssignorAction(formData: FormData) {
    "use server";
    await requireAdmin();
    const id = String(formData.get("id") || "");
    if (!id) return;
    const stateInput = String(formData.get("base_state") || "").trim();
    const normalizedState = normalizeStateAbbr(stateInput);
    const updates = {
      display_name: String(formData.get("display_name") || "").trim() || null,
      base_city: String(formData.get("base_city") || "").trim() || null,
      base_state: normalizedState ?? null,
      zip: String(formData.get("zip") || "").trim() || null,
      review_status: String(formData.get("review_status") || "").trim() || null,
    };
    const { error: assignorError } = await supabaseAdmin.from("assignors" as any).update(updates).eq("id", id);
    if (assignorError) {
      redirect(`/admin/assignors/${id}?notice=${encodeURIComponent(`Save failed: ${assignorError.message}`)}`);
    }

    const contactUpdates = [
      { type: "email", value: String(formData.get("email") || "").trim() },
      { type: "phone", value: String(formData.get("phone") || "").trim() },
      { type: "website", value: String(formData.get("website") || "").trim() },
    ];
    for (const contact of contactUpdates) {
      if (!contact.value) {
        const { error: deleteError } = await supabaseAdmin
          .from("assignor_contacts" as any)
          .delete()
          .eq("assignor_id", id)
          .eq("type", contact.type);
        if (deleteError) {
          redirect(`/admin/assignors/${id}?notice=${encodeURIComponent(`Save failed: ${deleteError.message}`)}`);
        }
        // No alias cleanup needed; contact_type enum only supports email/phone/website.
        continue;
      }
      const { error: deleteExistingError } = await supabaseAdmin
        .from("assignor_contacts" as any)
        .delete()
        .eq("assignor_id", id)
        .eq("type", contact.type);
      if (deleteExistingError) {
        redirect(`/admin/assignors/${id}?notice=${encodeURIComponent(`Save failed: ${deleteExistingError.message}`)}`);
      }
      // No alias cleanup needed; contact_type enum only supports email/phone/website.
      const { error: insertError } = await supabaseAdmin.from("assignor_contacts" as any).insert({
        assignor_id: id,
        type: contact.type,
        value: contact.value,
        is_primary: true,
      });
      if (insertError) {
        redirect(`/admin/assignors/${id}?notice=${encodeURIComponent(`Save failed: ${insertError.message}`)}`);
      }
    }
    revalidatePath(`/admin/assignors/${id}`);
    revalidatePath("/admin/assignors");
    redirect(`/admin/assignors/${id}?notice=Updated`);
  }

  return (
    <div style={{ padding: 24 }}>
      <AdminNav />
      <h1 style={{ fontSize: 20, fontWeight: 900, marginBottom: 8 }}>Assignor Detail</h1>
      <div style={{ marginBottom: 12 }}>
        <Link href="/admin/assignors" style={{ color: "#0f172a", fontWeight: 700 }}>
          ← Back to Assignors
        </Link>
      </div>
      {notice ? (
        <div style={{ background: "#ecfccb", border: "1px solid #bef264", padding: 8, borderRadius: 8, marginBottom: 12 }}>
          {notice}
        </div>
      ) : null}

      {!assignor ? (
        <div style={{ color: "#555" }}>Assignor not found.</div>
      ) : (
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14, background: "#fff" }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{assignor.display_name ?? "Unnamed"}</div>
          <div style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>
            ID: <span style={{ fontWeight: 700 }}>{assignor.id}</span>
          </div>
          <div style={{ color: "#555", fontSize: 13, marginTop: 6 }}>
            Location: {[assignor.base_city, normalizeStateAbbr(assignor.base_state)].filter(Boolean).join(", ") || "—"}
          </div>
          <div style={{ color: "#555", fontSize: 13 }}>
            Last seen: {assignor.last_seen_at ? new Date(assignor.last_seen_at).toLocaleString() : "—"}
          </div>
          <div style={{ color: "#555", fontSize: 13 }}>Confidence: {assignor.confidence ?? "—"}</div>
          <div style={{ color: "#555", fontSize: 13 }}>Status: {assignor.review_status ?? "—"}</div>
          <form action={updateAssignorAction} style={{ marginTop: 14, display: "grid", gap: 10 }}>
            <input type="hidden" name="id" value={assignor.id} />
            <label style={{ fontSize: 12, fontWeight: 700 }}>
              Name
              <input
                name="display_name"
                defaultValue={assignor.display_name ?? ""}
                style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>
            <label style={{ fontSize: 12, fontWeight: 700 }}>
              City
              <input
                name="base_city"
                defaultValue={assignor.base_city ?? ""}
                style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>
            <label style={{ fontSize: 12, fontWeight: 700 }}>
              State (abbr)
              <input
                name="base_state"
                defaultValue={assignor.base_state ?? ""}
                style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>
            <label style={{ fontSize: 12, fontWeight: 700 }}>
              ZIP
              <input
                name="zip"
                defaultValue={assignor.zip ?? ""}
                style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>
            <label style={{ fontSize: 12, fontWeight: 700 }}>
              Status
              <select
                name="review_status"
                defaultValue={assignor.review_status ?? "approved"}
                style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
              >
                <option value="approved">approved</option>
                <option value="needs_review">needs_review</option>
                <option value="pending">pending</option>
                <option value="rejected">rejected</option>
              </select>
            </label>
            <label style={{ fontSize: 12, fontWeight: 700 }}>
              Email
              <input
                name="email"
                defaultValue={emailContact?.value ?? ""}
                style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>
            <label style={{ fontSize: 12, fontWeight: 700 }}>
              Phone
              <input
                name="phone"
                defaultValue={phoneContact?.value ?? ""}
                style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>
            <label style={{ fontSize: 12, fontWeight: 700 }}>
              Website
              <input
                name="website"
                defaultValue={websiteContact?.value ?? ""}
                style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>
            {websiteContact?.value ? (
              <div style={{ fontSize: 12 }}>
                <a
                  href={websiteContact.value}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#0f172a", fontWeight: 700 }}
                >
                  {websiteContact.value}
                </a>
              </div>
            ) : null}
            <button
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "none",
                background: "#0f172a",
                color: "#fff",
                fontWeight: 900,
                justifySelf: "flex-start",
              }}
            >
              Save changes
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
