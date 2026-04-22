import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type QueueStatus = "pending" | "suggested" | "manual_review" | "approved" | "applied" | "skipped" | "error";

function redirectWithNotice(base: string, notice: string): never {
  const joiner = base.includes("?") ? "&" : "?";
  redirect(`${base}${joiner}notice=${encodeURIComponent(notice)}`);
}

function cleanText(value: FormDataEntryValue | null) {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length ? s : null;
}

function cleanBool(value: FormDataEntryValue | null) {
  return value === "on" || value === "true" || value === "1";
}

export default async function VenueFieldMapEditPage({
  params,
  searchParams,
}: {
  params: { venue_id: string };
  searchParams?: { notice?: string };
}) {
  const admin = await requireAdmin();
  const venueId = decodeURIComponent(params.venue_id);
  const notice = (searchParams?.notice ?? "").trim();

  const backHref = "/admin/venues/field-maps";
  const redirectTo = `${backHref}?status=all`;

  const schemaHelp = {
    title: "Field map queue schema not deployed yet",
    body: `Apply the Supabase migration \`supabase/migrations/20260422_ti_venue_url_cleanup_field_maps_queue.sql\`, then reload PostgREST's schema cache (Supabase SQL editor: \`NOTIFY pgrst, 'reload schema';\`).`,
  };

  const { data: venue, error: venueErr } = await supabaseAdmin
    .from("venues" as any)
    .select("id,name,city,state,zip,venue_url,venue_url_quality,field_map_url")
    .eq("id", venueId)
    .maybeSingle();

  if (venueErr || !venue) {
    console.error("field-maps edit: venue load failed", { venueId, venueErr });
    redirectWithNotice(backHref, "Venue not found.");
  }

  const venueRow = venue as any as {
    id: string;
    name: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    venue_url: string | null;
    venue_url_quality: string | null;
    field_map_url: string | null;
  };

  const { data: queueRaw } = await supabaseAdmin
    .from("venue_url_review_queue" as any)
    .select(
      "venue_id,status,bad_venue_url_reason,current_venue_url,current_field_map_url,suggested_venue_url,suggested_field_map_url,suggested_field_map_source,suggested_field_map_confidence,suggested_field_map_type,suggested_field_map_sport,suggested_field_map_set_primary,applied_field_map_id,approve_venue_url,approve_field_map_url,override_good_venue_url,decision_summary,notes,reviewed_by,last_reviewed_at,updated_at"
    )
    .eq("venue_id", venueId)
    .maybeSingle();

  const queue = (queueRaw as any as {
    venue_id: string;
    status: QueueStatus;
    bad_venue_url_reason: string | null;
    current_venue_url: string | null;
    current_field_map_url: string | null;
    suggested_venue_url: string | null;
    suggested_field_map_url: string | null;
    suggested_field_map_source: string | null;
    suggested_field_map_confidence: string | null;
    suggested_field_map_type: string | null;
    suggested_field_map_sport?: string | null;
    suggested_field_map_set_primary?: boolean | null;
    applied_field_map_id?: number | null;
    approve_venue_url: boolean | null;
    approve_field_map_url: boolean | null;
    override_good_venue_url: boolean | null;
    decision_summary: string | null;
    notes: string | null;
    reviewed_by: string | null;
    last_reviewed_at: string | null;
    updated_at: string | null;
  }) ?? null;

  async function upsertQueueFromVenueAction() {
    "use server";
    await requireAdmin();
    const { data: liveVenue, error: liveVenueErr } = await supabaseAdmin
      .from("venues" as any)
      .select("id,venue_url,field_map_url")
      .eq("id", venueId)
      .maybeSingle();
    if (liveVenueErr || !liveVenue) {
      console.error("field-maps edit: venue refresh failed", { venueId, liveVenueErr });
      return redirectWithNotice(`/admin/venues/field-maps/${venueId}`, "Failed to refresh venue snapshot.");
    }
    const { error } = await supabaseAdmin.from("venue_url_review_queue" as any).upsert(
      {
        venue_id: venueId,
        status: "pending",
        current_venue_url: (liveVenue as any).venue_url ?? null,
        current_field_map_url: (liveVenue as any).field_map_url ?? null,
      },
      { onConflict: "venue_id" }
    );
    if (error) {
      console.error("field-maps edit: queue upsert failed", { venueId, error });
      return redirectWithNotice(`/admin/venues/field-maps/${venueId}`, "Failed to create queue row.");
    }
    revalidatePath(`/admin/venues/field-maps/${venueId}`);
    return redirectWithNotice(`/admin/venues/field-maps/${venueId}`, "Queue row created/refreshed.");
  }

  async function updateQueueAction(formData: FormData) {
    "use server";
    await requireAdmin();
    const mode = String(formData.get("mode") || "");

    if (mode === "delete") {
      const { error } = await supabaseAdmin.from("venue_url_review_queue" as any).delete().eq("venue_id", venueId);
      if (error) {
        console.error("field-maps edit: delete failed", { venueId, error });
        return redirectWithNotice(`/admin/venues/field-maps/${venueId}`, "Remove from queue failed.");
      }
      revalidatePath(backHref);
      return redirectWithNotice(backHref, "Removed from queue (venue not deleted).");
    }

    const nextStatus = cleanText(formData.get("status")) as QueueStatus | null;
    const suggestedFieldMapUrl = cleanText(formData.get("suggested_field_map_url"));
    const suggestedFieldMapSource = cleanText(formData.get("suggested_field_map_source"));
    const suggestedFieldMapConfidence = cleanText(formData.get("suggested_field_map_confidence"));
    const suggestedFieldMapType = cleanText(formData.get("suggested_field_map_type"));
    const suggestedFieldMapSport = cleanText(formData.get("suggested_field_map_sport"));
    const suggestedFieldMapSetPrimary = cleanBool(formData.get("suggested_field_map_set_primary"));

    const suggestedVenueUrl = cleanText(formData.get("suggested_venue_url"));
    const approveVenueUrl = cleanBool(formData.get("approve_venue_url"));
    const approveFieldMapUrl = cleanBool(formData.get("approve_field_map_url"));
    const overrideGoodVenueUrl = cleanBool(formData.get("override_good_venue_url"));
    const badReason = cleanText(formData.get("bad_venue_url_reason"));
    const decisionSummary = cleanText(formData.get("decision_summary"));
    const notes = cleanText(formData.get("notes"));

    const update: Record<string, any> = {
      status: nextStatus ?? "pending",
      bad_venue_url_reason: badReason,
      suggested_field_map_url: suggestedFieldMapUrl,
      suggested_field_map_source: suggestedFieldMapSource,
      suggested_field_map_confidence: suggestedFieldMapConfidence,
      suggested_field_map_type: suggestedFieldMapType,
      suggested_field_map_sport: suggestedFieldMapSport,
      suggested_field_map_set_primary: suggestedFieldMapSetPrimary,
      suggested_venue_url: suggestedVenueUrl,
      approve_venue_url: approveVenueUrl,
      approve_field_map_url: approveFieldMapUrl,
      override_good_venue_url: overrideGoodVenueUrl,
      decision_summary: decisionSummary,
      notes,
      reviewed_by: admin.id,
      last_reviewed_at: new Date().toISOString(),
    };

    if (mode === "save_approve_map") {
      update.approve_field_map_url = true;
      update.status = "approved";
    }
    if (mode === "save_approve_venue_url") {
      update.approve_venue_url = true;
      update.status = "approved";
    }

    const { error } = await supabaseAdmin.from("venue_url_review_queue" as any).upsert(
      {
        venue_id: venueId,
        current_venue_url: queue?.current_venue_url ?? venueRow.venue_url ?? null,
        current_field_map_url: queue?.current_field_map_url ?? venueRow.field_map_url ?? null,
        ...update,
      },
      { onConflict: "venue_id" }
    );

    if (error) {
      console.error("field-maps edit: upsert failed", { venueId, error });
      return redirectWithNotice(`/admin/venues/field-maps/${venueId}`, "Save failed.");
    }

    revalidatePath(`/admin/venues/field-maps/${venueId}`);
    revalidatePath(backHref);
    return redirectWithNotice(`/admin/venues/field-maps/${venueId}`, "Saved.");
  }

  const currentMap = queue?.current_field_map_url ?? venueRow.field_map_url ?? null;
  const suggestedMap = queue?.suggested_field_map_url ?? null;
  const openMap = suggestedMap || currentMap;

  const queueMissing = queueRaw && (queueRaw as any)?.code === "PGRST205";

  const { data: existingMapsRaw, error: existingMapsErr } = await supabaseAdmin
    .from("venue_field_maps" as any)
    .select("id,map_url,sport,map_type,map_confidence,map_source,is_primary,updated_at")
    .eq("venue_id", venueId)
    .order("is_primary", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(25);
  const existingMapsMissing =
    Boolean(existingMapsErr) && ((existingMapsErr as any)?.code === "PGRST205" || String((existingMapsErr as any)?.message || "").includes("schema cache"));
  const existingMaps = existingMapsMissing ? [] : ((existingMapsRaw ?? []) as any[]);

  async function deleteMapAction(formData: FormData) {
    "use server";
    const adminUser = await requireAdmin();
    const mapId = String(formData.get("map_id") || "").trim();
    if (!mapId) return redirectWithNotice(`/admin/venues/field-maps/${venueId}`, "Map id missing.");

    const { data: mapRow } = await supabaseAdmin
      .from("venue_field_maps" as any)
      .select("id,venue_id,map_url,is_primary")
      .eq("id", mapId)
      .maybeSingle();

    if (!mapRow || String((mapRow as any).venue_id) !== venueId) {
      return redirectWithNotice(`/admin/venues/field-maps/${venueId}`, "Map not found for this venue.");
    }

    const { error: delErr } = await supabaseAdmin.from("venue_field_maps" as any).delete().eq("id", mapId);
    if (delErr) {
      console.error("field-maps edit: delete map failed", { venueId, mapId, delErr });
      return redirectWithNotice(`/admin/venues/field-maps/${venueId}`, "Delete map failed.");
    }

    const { error: auditErr } = await supabaseAdmin.from("venue_field_maps_audit_log" as any).insert({
      venue_id: venueId,
      event_type: "delete",
      map_id: Number(mapId),
      map_url: (mapRow as any).map_url ?? null,
      actor: adminUser.id,
      reason: "deleted from admin field maps UI",
    });
    if (auditErr) console.error("field-maps edit: audit delete failed", { venueId, auditErr });

    revalidatePath(`/admin/venues/field-maps/${venueId}`);
    revalidatePath("/admin/venues/field-maps");
    return redirectWithNotice(`/admin/venues/field-maps/${venueId}`, "Map deleted.");
  }

  return (
    <div style={{ padding: 24 }}>
      <AdminNav />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Field map review</h1>
          <p style={{ margin: "6px 0 0 0", color: "#4b5563" }}>
            {venueRow.name ?? venueRow.id} • {[venueRow.city, venueRow.state, venueRow.zip].filter(Boolean).join(", ")}
          </p>
          {notice ? (
            <p style={{ margin: "10px 0 0 0", padding: "10px 12px", borderRadius: 12, background: "#ecfeff", border: "1px solid #67e8f9" }}>
              <strong>Notice:</strong> {notice}
            </p>
          ) : null}
          {queueMissing ? (
            <div
              style={{
                marginTop: 10,
                padding: "12px 14px",
                borderRadius: 14,
                background: "#fff7ed",
                border: "1px solid #fdba74",
                color: "#7c2d12",
              }}
            >
              <div style={{ fontWeight: 900 }}>{schemaHelp.title}</div>
              <div style={{ marginTop: 6, fontSize: 13, whiteSpace: "pre-wrap" }}>{schemaHelp.body}</div>
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link
            href={backHref}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              background: "#fff",
              border: "1px solid #e5e7eb",
              textDecoration: "none",
              fontWeight: 900,
              color: "#111827",
            }}
          >
            Back to queue
          </Link>
          <Link
            href={`/admin/venues/${venueId}`}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              background: "#fff",
              border: "1px solid #e5e7eb",
              textDecoration: "none",
              fontWeight: 900,
              color: "#111827",
            }}
          >
            Venue page
          </Link>
          {openMap ? (
            <a
              href={openMap}
              target="_blank"
              rel="noreferrer"
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                background: "#111827",
                border: "1px solid #111827",
                textDecoration: "none",
                fontWeight: 900,
                color: "#fff",
              }}
            >
              Open map
            </a>
          ) : null}
        </div>
      </div>

      {!queue ? (
        <form action={upsertQueueFromVenueAction} style={{ marginTop: 16, border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, background: "#fafafa" }}>
          <p style={{ margin: 0, color: "#374151", fontWeight: 800 }}>No queue row yet for this venue.</p>
          <p style={{ margin: "6px 0 0 0", color: "#6b7280", fontSize: 12 }}>
            Create one using current `venues.venue_url` and `venues.field_map_url` as the snapshot.
          </p>
          <div style={{ marginTop: 10 }}>
            <button
              type="submit"
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #1d4ed8",
                background: "#fff",
                color: "#1d4ed8",
                fontWeight: 900,
              }}
            >
              Create queue row
            </button>
          </div>
        </form>
      ) : (
        <div style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 14, border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, background: "#fafafa" }}>
            <div style={{ fontWeight: 900, color: "#111827" }}>Existing maps</div>
            {existingMapsMissing ? (
              <div style={{ marginTop: 6, color: "#7c2d12", fontSize: 13 }}>
                {schemaHelp.title}. {schemaHelp.body}
              </div>
            ) : existingMaps.length === 0 ? (
              <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>No `venue_field_maps` rows yet for this venue.</div>
            ) : (
              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                {existingMaps.map((m) => (
                  <div key={String(m.id)} style={{ padding: 10, borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontWeight: 900 }}>
                          {m.is_primary ? "Primary" : "Map"} • {(m.sport ?? "—") as string} • {(m.map_type ?? "—") as string}
                        </div>
                        <div style={{ marginTop: 4 }}>
                          <a href={m.map_url} target="_blank" rel="noreferrer" style={{ color: "#2563eb", wordBreak: "break-word" }}>
                            {m.map_url}
                          </a>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                          conf={(m.map_confidence ?? "—") as string} • src={(m.map_source ?? "—") as string}
                        </div>
                      </div>
                      <form action={deleteMapAction}>
                        <input type="hidden" name="map_id" value={String(m.id)} />
                        <button
                          type="submit"
                          style={{
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: "1px solid #b00020",
                            background: "#fff",
                            color: "#b00020",
                            fontWeight: 900,
                          }}
                        >
                          Delete map
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <form action={updateQueueAction} style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, background: "#fff" }}>
            <input type="hidden" name="redirect_to" value={redirectTo} />
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>Status</label>
              <select name="status" defaultValue={queue.status} style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                <option value="pending">pending</option>
                <option value="suggested">suggested</option>
                <option value="manual_review">manual_review</option>
                <option value="approved">approved</option>
                <option value="applied">applied</option>
                <option value="skipped">skipped</option>
                <option value="error">error</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>Bad venue_url reason</label>
              <input name="bad_venue_url_reason" defaultValue={queue.bad_venue_url_reason ?? ""} style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>Suggested field map URL</label>
            <input name="suggested_field_map_url" defaultValue={queue.suggested_field_map_url ?? ""} placeholder="https://...pdf" style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
            <div style={{ marginTop: 10, display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr 1fr" }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>Source</label>
                <input name="suggested_field_map_source" defaultValue={queue.suggested_field_map_source ?? ""} placeholder="parks_dept / venue_site / organizer" style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>Sport (optional)</label>
                <input
                  name="suggested_field_map_sport"
                  defaultValue={(queue as any).suggested_field_map_sport ?? ""}
                  placeholder="soccer / basketball"
                  style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>Confidence</label>
                <select name="suggested_field_map_confidence" defaultValue={queue.suggested_field_map_confidence ?? ""} style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                  <option value="">—</option>
                  <option value="high">high</option>
                  <option value="medium">medium</option>
                  <option value="low">low</option>
                </select>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>Type</label>
                <select name="suggested_field_map_type" defaultValue={queue.suggested_field_map_type ?? ""} style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                  <option value="">—</option>
                  <option value="complex_layout">complex_layout</option>
                  <option value="parking_map">parking_map</option>
                  <option value="field_numbering">field_numbering</option>
                  <option value="indoor_court_map">indoor_court_map</option>
                  <option value="campus_map">campus_map</option>
                  <option value="general_facility_map">general_facility_map</option>
                  <option value="unknown">unknown</option>
                </select>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>Suggested venue URL (optional)</label>
            <input name="suggested_venue_url" defaultValue={queue.suggested_venue_url ?? ""} placeholder="https://official-venue-site" style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 14, flexWrap: "wrap" }}>
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 900, color: "#0a7a2f" }}>
              <input
                type="checkbox"
                name="suggested_field_map_set_primary"
                defaultChecked={Boolean((queue as any).suggested_field_map_set_primary)}
              />
              Set as primary map
            </label>
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 900, color: "#111827" }}>
              <input type="checkbox" name="approve_field_map_url" defaultChecked={Boolean(queue.approve_field_map_url)} />
              Approve field map URL
            </label>
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 900, color: "#111827" }}>
              <input type="checkbox" name="approve_venue_url" defaultChecked={Boolean(queue.approve_venue_url)} />
              Approve venue URL
            </label>
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 900, color: "#b45309" }}>
              <input type="checkbox" name="override_good_venue_url" defaultChecked={Boolean(queue.override_good_venue_url)} />
              Override good venue URL
            </label>
          </div>

          <div style={{ marginTop: 14, display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>Decision summary</label>
              <input name="decision_summary" defaultValue={queue.decision_summary ?? ""} style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>Notes</label>
              <textarea name="notes" defaultValue={queue.notes ?? ""} rows={3} style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
            </div>
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" name="mode" value="save" style={{ padding: "10px 12px", borderRadius: 10, border: "none", background: "#111827", color: "#fff", fontWeight: 900 }}>
              Save
            </button>
            <button type="submit" name="mode" value="save_approve_map" style={{ padding: "10px 12px", borderRadius: 10, border: "none", background: "#0a7a2f", color: "#fff", fontWeight: 900 }}>
              Save + approve map
            </button>
            <button type="submit" name="mode" value="save_approve_venue_url" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #1d4ed8", background: "#fff", color: "#1d4ed8", fontWeight: 900 }}>
              Save + approve venue URL
            </button>
            <button type="submit" name="mode" value="delete" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #b00020", background: "#fff", color: "#b00020", fontWeight: 900 }}>
              Remove from queue
            </button>
          </div>

          <div style={{ marginTop: 14, fontSize: 12, color: "#6b7280" }}>
            Snapshot: venue_url={queue.current_venue_url ? "set" : "—"} • field_map_url={queue.current_field_map_url ? "set" : "—"} • last reviewed{" "}
            {queue.last_reviewed_at ? new Date(queue.last_reviewed_at).toLocaleString() : "—"}
          </div>
          </form>
        </div>
      )}
    </div>
  );
}
