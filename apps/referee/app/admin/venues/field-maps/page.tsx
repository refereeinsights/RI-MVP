import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import crypto from "crypto";

import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type QueueStatus = "pending" | "suggested" | "manual_review" | "approved" | "applied" | "skipped" | "error";

type QueueRow = {
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
  approve_venue_url: boolean | null;
  approve_field_map_url: boolean | null;
  override_good_venue_url: boolean | null;
  notes: string | null;
  updated_at: string | null;
  venues: {
    id: string;
    name: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    venue_url: string | null;
    field_map_url: string | null;
    venue_url_quality: string | null;
  } | null;
};

function redirectWithNotice(base: string, notice: string): never {
  const joiner = base.includes("?") ? "&" : "?";
  redirect(`${base}${joiner}notice=${encodeURIComponent(notice)}`);
}

function normalizeUrlForHash(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  url.hash = "";
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();

  const trackingPrefixes = ["utm_"];
  const trackingKeys = new Set(["fbclid", "gclid"]);
  const kept: Array<[string, string]> = [];
  url.searchParams.forEach((value, key) => {
    const k = key.toLowerCase();
    if (trackingKeys.has(k)) return;
    if (trackingPrefixes.some((p) => k.startsWith(p))) return;
    kept.push([key, value]);
  });
  kept.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  url.search = "";
  for (const [k, v] of kept) url.searchParams.append(k, v);

  return url.toString();
}

function hashUrlSha256Hex(raw: string) {
  const normalized = normalizeUrlForHash(raw);
  if (!normalized) return null;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function clampInt(value: string | null, fallback: number, min: number, max: number) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export default async function VenueFieldMapsQueuePage({
  searchParams,
}: {
  searchParams?: {
    q?: string;
    status?: QueueStatus | "all";
    limit?: string;
    offset?: string;
    notice?: string;
  };
}) {
  await requireAdmin();

  const q = (searchParams?.q ?? "").trim();
  const status = (searchParams?.status ?? "pending") as QueueStatus | "all";
  const limit = clampInt(searchParams?.limit ?? null, 25, 1, 200);
  const offset = clampInt(searchParams?.offset ?? null, 0, 0, 50_000);
  const notice = (searchParams?.notice ?? "").trim();

  const basePath = "/admin/venues/field-maps";

  const buildHref = (overrides: Record<string, string | null | undefined>) => {
    const params = new URLSearchParams();
    const nextQ = overrides.q ?? q;
    const nextStatus = overrides.status ?? status;
    const nextLimit = overrides.limit ?? String(limit);
    const nextOffset = overrides.offset ?? String(offset);

    if (nextQ) params.set("q", nextQ);
    if (nextStatus && nextStatus !== "pending") params.set("status", nextStatus);
    if (nextLimit && nextLimit !== "25") params.set("limit", nextLimit);
    if (nextOffset && nextOffset !== "0") params.set("offset", nextOffset);
    return `${basePath}${params.toString() ? `?${params.toString()}` : ""}`;
  };

  async function seedQueueAction(formData: FormData) {
    "use server";
    const adminBase = String(formData.get("redirect_to") || basePath);
    const seedLimit = clampInt(String(formData.get("seed_limit") ?? ""), 200, 1, 2000);

    // Tier 1: only venues linked to tournaments and missing field maps / venue url or missing quality.
    // Keep it throttled: limit inserts by the newest linked tournaments.
    // Note: uses ON CONFLICT DO NOTHING to avoid resetting existing review state.
    const { data: linkRows, error: linkErr } = await supabaseAdmin
      .from("tournament_venues" as any)
      .select("venue_id, created_at")
      .order("created_at", { ascending: false })
      .limit(seedLimit);

    if (linkErr) {
      console.error("field-maps seed: failed to load tournament_venues", linkErr);
      return redirectWithNotice(adminBase, "Seed failed: could not load tournament_venues.");
    }

    const venueIds = Array.from(new Set((linkRows ?? []).map((r: any) => String(r.venue_id)).filter(Boolean)));
    if (!venueIds.length) return redirectWithNotice(adminBase, "No venues found to seed.");

    const { data: venues, error: venuesErr } = await supabaseAdmin
      .from("venues" as any)
      .select("id, venue_url, field_map_url, venue_url_quality")
      .in("id", venueIds);

    if (venuesErr) {
      console.error("field-maps seed: failed to load venues", venuesErr);
      return redirectWithNotice(adminBase, "Seed failed: could not load venues.");
    }

    const seedRows = (venues ?? [])
      .filter((v: any) => !v.field_map_url || !v.venue_url || !v.venue_url_quality)
      .slice(0, seedLimit)
      .map((v: any) => ({
        venue_id: v.id,
        status: "pending",
        current_venue_url: v.venue_url ?? null,
        current_field_map_url: v.field_map_url ?? null,
      }));

    if (!seedRows.length) return redirectWithNotice(adminBase, "Nothing to seed (already covered).");

    const { error: insErr } = await supabaseAdmin
      .from("venue_url_review_queue" as any)
      .upsert(seedRows, { onConflict: "venue_id", ignoreDuplicates: true } as any);

    if (insErr) {
      console.error("field-maps seed: upsert failed", insErr);
      return redirectWithNotice(adminBase, "Seed failed: insert error.");
    }

    revalidatePath(basePath);
    return redirectWithNotice(adminBase, `Seeded ${seedRows.length} venue(s) into the review queue.`);
  }

  async function bulkQueueAction(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const adminBase = String(formData.get("redirect_to") || basePath);
    const action = String(formData.get("bulk_action") || "");
    const ids = (formData.getAll("selected") as string[]).map((v) => v.trim()).filter(Boolean);
    if (!ids.length) return redirectWithNotice(adminBase, "Select at least one venue.");

    if (action === "approve_maps") {
      const { error } = await supabaseAdmin
        .from("venue_url_review_queue" as any)
        .update({ approve_field_map_url: true, status: "approved", reviewed_by: admin.id, last_reviewed_at: new Date().toISOString() })
        .in("venue_id", ids);
      if (error) {
        console.error("field-maps bulk approve failed", error);
        return redirectWithNotice(adminBase, "Bulk approve failed.");
      }
      revalidatePath(basePath);
      return redirectWithNotice(adminBase, `Approved field maps for ${ids.length} venue(s).`);
    }

    if (action === "delete_queue_rows") {
      const { error } = await supabaseAdmin.from("venue_url_review_queue" as any).delete().in("venue_id", ids);
      if (error) {
        console.error("field-maps bulk delete failed", error);
        return redirectWithNotice(adminBase, "Bulk delete failed.");
      }
      revalidatePath(basePath);
      return redirectWithNotice(adminBase, `Deleted ${ids.length} queue row(s).`);
    }

    if (action === "apply_selected") {
      let applied = 0;
      let stale = 0;
      let skipped = 0;
      let errored = 0;

      for (const venueId of ids) {
        const { data: queueRaw, error: queueErr } = await supabaseAdmin
          .from("venue_url_review_queue" as any)
          .select(
            "venue_id,status,current_venue_url,current_field_map_url,suggested_venue_url,suggested_field_map_url,suggested_field_map_source,suggested_field_map_confidence,suggested_field_map_type,approve_venue_url,approve_field_map_url,override_good_venue_url,notes"
          )
          .eq("venue_id", venueId)
          .maybeSingle();

        const queue = (queueRaw as any) as any;

        if (queueErr || !queue) {
          console.error("field-maps apply: queue load failed", { venueId, queueErr });
          errored += 1;
          continue;
        }

        if (queue.status !== "approved") {
          skipped += 1;
          continue;
        }

        const { data: venueRaw, error: venueErr } = await supabaseAdmin
          .from("venues" as any)
          .select("id,venue_url,field_map_url,venue_url_quality")
          .eq("id", venueId)
          .maybeSingle();

        const venue = (venueRaw as any) as any;

        if (venueErr || !venue) {
          console.error("field-maps apply: venue load failed", { venueId, venueErr });
          errored += 1;
          continue;
        }

        const liveVenueUrl = (venue.venue_url ?? null) as string | null;
        const liveFieldMapUrl = (venue.field_map_url ?? null) as string | null;
        const snapshotVenueUrl = (queue.current_venue_url ?? null) as string | null;
        const snapshotFieldMapUrl = (queue.current_field_map_url ?? null) as string | null;

        if (liveVenueUrl !== snapshotVenueUrl || liveFieldMapUrl !== snapshotFieldMapUrl) {
          stale += 1;
          const nextNotes = [
            (queue.notes ?? "").trim(),
            `[${new Date().toISOString()}] Live venue record changed since snapshot; re-review required.`,
          ]
            .filter(Boolean)
            .join("\n");
          await supabaseAdmin
            .from("venue_url_review_queue" as any)
            .update({ status: "manual_review", notes: nextNotes })
            .eq("venue_id", venueId);
          continue;
        }

        const approveVenueUrl = Boolean(queue.approve_venue_url);
        const approveFieldMapUrl = Boolean(queue.approve_field_map_url);
        const overrideGoodVenueUrl = Boolean(queue.override_good_venue_url);

        const suggestedVenueUrl = (queue.suggested_venue_url ?? "").trim() || null;
        const suggestedFieldMapUrl = (queue.suggested_field_map_url ?? "").trim() || null;

        const shouldApplyVenueUrl =
          approveVenueUrl &&
          Boolean(suggestedVenueUrl) &&
          (String(venue.venue_url_quality ?? "").toLowerCase() !== "good" || overrideGoodVenueUrl);
        const shouldApplyFieldMapUrl = approveFieldMapUrl && Boolean(suggestedFieldMapUrl);

        if (!shouldApplyVenueUrl && !shouldApplyFieldMapUrl) {
          skipped += 1;
          continue;
        }

        const nextVenueUpdates: Record<string, any> = {
          venue_url_last_checked_at: new Date().toISOString(),
        };
        let newVenueUrl: string | null = null;
        let newFieldMapUrl: string | null = null;

        if (shouldApplyVenueUrl) {
          newVenueUrl = suggestedVenueUrl;
          nextVenueUpdates.venue_url = suggestedVenueUrl;
          nextVenueUpdates.venue_url_quality = "good";
        }

        if (shouldApplyFieldMapUrl) {
          newFieldMapUrl = suggestedFieldMapUrl;
          nextVenueUpdates.field_map_url = suggestedFieldMapUrl;
          nextVenueUpdates.field_map_source = (queue.suggested_field_map_source ?? null) as string | null;
          nextVenueUpdates.field_map_confidence = (queue.suggested_field_map_confidence ?? null) as string | null;
          nextVenueUpdates.field_map_type = (queue.suggested_field_map_type ?? null) as string | null;
          nextVenueUpdates.field_map_hash = suggestedFieldMapUrl ? hashUrlSha256Hex(suggestedFieldMapUrl) : null;
          nextVenueUpdates.field_map_last_checked_at = new Date().toISOString();
        }

        const { error: venueUpdateErr } = await supabaseAdmin.from("venues" as any).update(nextVenueUpdates).eq("id", venueId);
        if (venueUpdateErr) {
          console.error("field-maps apply: venue update failed", { venueId, venueUpdateErr });
          errored += 1;
          continue;
        }

        const reason = "applied from venue_url_review_queue";
        const { error: auditErr } = await supabaseAdmin.from("venue_url_audit_log" as any).insert({
          venue_id: venueId,
          event_type: "apply",
          previous_venue_url: liveVenueUrl,
          new_venue_url: newVenueUrl,
          previous_field_map_url: liveFieldMapUrl,
          new_field_map_url: newFieldMapUrl,
          actor: admin.id,
          reason,
        });
        if (auditErr) {
          console.error("field-maps apply: audit insert failed", { venueId, auditErr });
          // Non-fatal: venue updates already applied; keep going.
        }

        const { error: queueUpdateErr } = await supabaseAdmin
          .from("venue_url_review_queue" as any)
          .update({
            status: "applied",
            previous_venue_url: liveVenueUrl,
            previous_field_map_url: liveFieldMapUrl,
            reviewed_by: admin.id,
            last_reviewed_at: new Date().toISOString(),
          })
          .eq("venue_id", venueId);
        if (queueUpdateErr) {
          console.error("field-maps apply: queue update failed", { venueId, queueUpdateErr });
          // Non-fatal.
        }

        applied += 1;
      }

      revalidatePath(basePath);
      revalidatePath("/admin/venues");
      return redirectWithNotice(
        adminBase,
        `Apply complete. applied=${applied}, stale=${stale}, skipped=${skipped}, errored=${errored}.`
      );
    }

    return redirectWithNotice(adminBase, "Unknown bulk action.");
  }

  let query = supabaseAdmin
    .from("venue_url_review_queue" as any)
    .select(
      "venue_id,status,bad_venue_url_reason,current_venue_url,current_field_map_url,suggested_venue_url,suggested_field_map_url,suggested_field_map_source,suggested_field_map_confidence,suggested_field_map_type,approve_venue_url,approve_field_map_url,override_good_venue_url,notes,updated_at,venues:venues(id,name,city,state,zip,venue_url,field_map_url,venue_url_quality)"
    )
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status !== "all") query = query.eq("status", status);

  if (q) {
    // Basic search across joined venue fields + URLs.
    const safe = q.replace(/%/g, "\\%").replace(/_/g, "\\_");
    query = query.or(
      [
        `venues.name.ilike.%${safe}%`,
        `venues.city.ilike.%${safe}%`,
        `venues.state.ilike.%${safe}%`,
        `venues.zip.ilike.%${safe}%`,
        `current_venue_url.ilike.%${safe}%`,
        `suggested_field_map_url.ilike.%${safe}%`,
      ].join(",")
    );
  }

  const { data: rowsRaw, error } = await query;
  if (error) {
    console.error("field-maps: query failed", error);
  }

  const rows = (rowsRaw ?? []) as unknown as QueueRow[];

  const StatusLink = ({ value, label }: { value: QueueStatus | "all"; label: string }) => {
    const active = value === status;
    return (
      <Link
        href={buildHref({ status: value === "pending" ? null : value })}
        style={{
          padding: "6px 10px",
          borderRadius: 999,
          border: `1px solid ${active ? "#0f172a" : "#d1d5db"}`,
          background: active ? "#eef2ff" : "#fff",
          color: "#111",
          fontWeight: 800,
          fontSize: 12,
          textDecoration: "none",
        }}
      >
        {label}
      </Link>
    );
  };

  return (
    <div style={{ padding: 24 }}>
      <AdminNav />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Venue field maps</h1>
          <p style={{ margin: "6px 0 0 0", color: "#4b5563" }}>
            Queue-based review for `field_map_url` (and optional `venue_url`), with bulk approve/apply.
          </p>
          {notice ? (
            <p style={{ margin: "10px 0 0 0", padding: "10px 12px", borderRadius: 12, background: "#ecfeff", border: "1px solid #67e8f9" }}>
              <strong>Notice:</strong> {notice}
            </p>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link
            href="/admin/venues"
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
            Back to venues
          </Link>
        </div>
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <StatusLink value="pending" label="Pending" />
        <StatusLink value="suggested" label="Suggested" />
        <StatusLink value="manual_review" label="Manual review" />
        <StatusLink value="approved" label="Approved" />
        <StatusLink value="applied" label="Applied" />
        <StatusLink value="error" label="Error" />
        <StatusLink value="all" label="All" />
      </div>

      <form action={seedQueueAction} style={{ marginTop: 16, border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, background: "#fafafa" }}>
        <input type="hidden" name="redirect_to" value={buildHref({})} />
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="submit"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #0f766e",
              background: "#fff",
              color: "#0f766e",
              fontWeight: 900,
            }}
          >
            Seed queue (tournament-linked)
          </button>
          <label style={{ fontSize: 12, color: "#374151", display: "inline-flex", gap: 6, alignItems: "center" }}>
            Limit
            <input
              name="seed_limit"
              type="number"
              min={1}
              max={2000}
              defaultValue={200}
              style={{ width: 90, padding: "6px 8px", borderRadius: 10, border: "1px solid #d1d5db" }}
            />
          </label>
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            Inserts into `venue_url_review_queue` with `ON CONFLICT DO NOTHING` (won&apos;t reset existing review state).
          </span>
        </div>
      </form>

      <form style={{ marginTop: 16, display: "grid", gap: 8, gridTemplateColumns: "2fr 1fr auto auto" }} action="GET">
        <input name="q" placeholder="Search venue / city / url" defaultValue={q} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
        <select name="status" defaultValue={status} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}>
          <option value="pending">pending</option>
          <option value="suggested">suggested</option>
          <option value="manual_review">manual_review</option>
          <option value="approved">approved</option>
          <option value="applied">applied</option>
          <option value="skipped">skipped</option>
          <option value="error">error</option>
          <option value="all">all</option>
        </select>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center", color: "#374151", fontSize: 12 }}>
          Limit
          <input name="limit" type="number" min={1} max={200} defaultValue={limit} style={{ width: 80, padding: "6px 8px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
        </label>
        <button type="submit" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #111827", background: "#111827", color: "#fff", fontWeight: 900 }}>
          Filter
        </button>
      </form>

      <form action={bulkQueueAction} style={{ marginTop: 18 }}>
        <input type="hidden" name="redirect_to" value={buildHref({})} />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <button
            formNoValidate
            name="bulk_action"
            value="approve_maps"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "none",
              background: "#0a7a2f",
              color: "#fff",
              fontWeight: 900,
            }}
          >
            Approve selected maps
          </button>
          <button
            formNoValidate
            name="bulk_action"
            value="apply_selected"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #1d4ed8",
              background: "#fff",
              color: "#1d4ed8",
              fontWeight: 900,
            }}
          >
            Apply selected (approved)
          </button>
          <button
            formNoValidate
            name="bulk_action"
            value="delete_queue_rows"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #b00020",
              background: "#fff",
              color: "#b00020",
              fontWeight: 900,
            }}
          >
            Delete selected
          </button>
        </div>

        <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ padding: 10, textAlign: "left" }}>Select</th>
                <th style={{ padding: 10, textAlign: "left" }}>Venue</th>
                <th style={{ padding: 10, textAlign: "left" }}>Status</th>
                <th style={{ padding: 10, textAlign: "left" }}>Current</th>
                <th style={{ padding: 10, textAlign: "left" }}>Suggested</th>
                <th style={{ padding: 10, textAlign: "left" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 14, color: "#6b7280" }}>
                    {error ? "Failed to load queue rows." : "No queue rows found for this filter."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const venue = row.venues;
                  const title = venue?.name ?? row.venue_id;
                  const meta = [venue?.city, venue?.state, venue?.zip].filter(Boolean).join(", ");
                  const currentMap = row.current_field_map_url ?? venue?.field_map_url ?? null;
                  const suggestedMap = row.suggested_field_map_url ?? null;
                  const mapLink = suggestedMap || currentMap;

                  return (
                    <tr key={row.venue_id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: 10, verticalAlign: "top" }}>
                        <input type="checkbox" name="selected" value={row.venue_id} />
                      </td>
                      <td style={{ padding: 10, verticalAlign: "top", minWidth: 220 }}>
                        <div style={{ fontWeight: 900 }}>{title}</div>
                        <div style={{ marginTop: 2, color: "#6b7280" }}>{meta || "—"}</div>
                        <div style={{ marginTop: 6 }}>
                          <Link href={`/admin/venues/${row.venue_id}`} style={{ color: "#2563eb", fontWeight: 800, textDecoration: "none" }}>
                            Venue →
                          </Link>
                        </div>
                      </td>
                      <td style={{ padding: 10, verticalAlign: "top", minWidth: 120 }}>
                        <div style={{ fontWeight: 900 }}>{row.status}</div>
                        {row.approve_field_map_url ? (
                          <div style={{ marginTop: 4, fontSize: 12, color: "#0a7a2f", fontWeight: 900 }}>map approved</div>
                        ) : null}
                        {row.override_good_venue_url ? (
                          <div style={{ marginTop: 4, fontSize: 12, color: "#b45309", fontWeight: 900 }}>override good URL</div>
                        ) : null}
                      </td>
                      <td style={{ padding: 10, verticalAlign: "top", minWidth: 320 }}>
                        <div style={{ color: "#111827", fontWeight: 800, marginBottom: 4 }}>field_map_url</div>
                        {currentMap ? (
                          <a href={currentMap} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8", wordBreak: "break-word" }}>
                            {currentMap}
                          </a>
                        ) : (
                          <div style={{ color: "#6b7280" }}>—</div>
                        )}
                        <div style={{ marginTop: 10, color: "#111827", fontWeight: 800, marginBottom: 4 }}>venue_url</div>
                        {row.current_venue_url ? (
                          <a href={row.current_venue_url} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8", wordBreak: "break-word" }}>
                            {row.current_venue_url}
                          </a>
                        ) : (
                          <div style={{ color: "#6b7280" }}>—</div>
                        )}
                      </td>
                      <td style={{ padding: 10, verticalAlign: "top", minWidth: 340 }}>
                        <div style={{ color: "#111827", fontWeight: 800, marginBottom: 4 }}>suggested_field_map_url</div>
                        {suggestedMap ? (
                          <a href={suggestedMap} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8", wordBreak: "break-word" }}>
                            {suggestedMap}
                          </a>
                        ) : (
                          <div style={{ color: "#6b7280" }}>—</div>
                        )}
                        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {row.suggested_field_map_confidence ? (
                            <span style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>
                              conf: {row.suggested_field_map_confidence}
                            </span>
                          ) : null}
                          {row.suggested_field_map_type ? (
                            <span style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>
                              type: {row.suggested_field_map_type}
                            </span>
                          ) : null}
                          {row.suggested_field_map_source ? (
                            <span style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>
                              src: {row.suggested_field_map_source}
                            </span>
                          ) : null}
                        </div>
                        {row.notes ? (
                          <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280", whiteSpace: "pre-wrap" }}>{row.notes}</div>
                        ) : null}
                      </td>
                      <td style={{ padding: 10, verticalAlign: "top", minWidth: 180 }}>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <Link href={`/admin/venues/field-maps/${row.venue_id}`} style={{ color: "#111827", fontWeight: 900, textDecoration: "none" }}>
                            Edit
                          </Link>
                          {mapLink ? (
                            <a href={mapLink} target="_blank" rel="noreferrer" style={{ color: "#2563eb", fontWeight: 900, textDecoration: "none" }}>
                              Open map
                            </a>
                          ) : (
                            <span style={{ color: "#9ca3af", fontWeight: 800 }}>Open map</span>
                          )}
                        </div>
                        <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
                          Updated {row.updated_at ? new Date(row.updated_at).toLocaleString() : "—"}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </form>

      <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ color: "#6b7280", fontSize: 12 }}>
          Showing {rows.length} row(s) • offset {offset} • limit {limit}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link
            href={buildHref({ offset: String(Math.max(0, offset - limit)) })}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              textDecoration: "none",
              fontWeight: 900,
              color: "#111827",
              background: "#fff",
              opacity: offset > 0 ? 1 : 0.5,
              pointerEvents: offset > 0 ? "auto" : "none",
            }}
          >
            Prev
          </Link>
          <Link
            href={buildHref({ offset: String(offset + limit) })}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              textDecoration: "none",
              fontWeight: 900,
              color: "#111827",
              background: "#fff",
            }}
          >
            Next
          </Link>
        </div>
      </div>
    </div>
  );
}
