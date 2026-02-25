import Link from "next/link";
import { redirect } from "next/navigation";
import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import LabelPrintSettings from "./LabelPrintSettings";
import PrintLabelButton from "./PrintLabelButton";

export const runtime = "nodejs";

type TiUserRow = {
  id: string;
  email: string | null;
  signup_source: string | null;
  signup_source_code: string | null;
  plan: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  created_at: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
};

type EventCodeSource = "ti_event_codes" | "event_codes";

type EventCodeRow = {
  id: string | null;
  code: string | null;
  status: string | null;
  trial_days: number | null;
  max_redemptions: number | null;
  redeemed_count: number | null;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string | null;
  notes: string | null;
  founding_access: boolean;
  raw: Record<string, unknown>;
};

type EventCodeLoadResult = {
  source: EventCodeSource | null;
  rows: EventCodeRow[];
  error: string | null;
};

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function asText(value: unknown) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function asInt(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asBool(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
  }
  return false;
}

function parseEventCodeRow(row: Record<string, unknown>): EventCodeRow {
  return {
    id: asText(row.id),
    code: asText(row.code),
    status: asText(row.status),
    trial_days: asInt(row.trial_days),
    max_redemptions: asInt(row.max_redemptions),
    redeemed_count: asInt(row.redeemed_count),
    starts_at: asText(row.starts_at),
    expires_at: asText(row.expires_at),
    created_at: asText(row.created_at),
    notes: asText(row.notes),
    founding_access: asBool((row as any).founding_access),
    raw: row,
  };
}

async function loadEventCodes(): Promise<EventCodeLoadResult> {
  const tableCandidates: EventCodeSource[] = ["event_codes", "ti_event_codes"];
  let lastErr: string | null = null;
  for (const table of tableCandidates) {
    const res = await (supabaseAdmin as any)
      .from(table as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (!res.error) {
      const rows = ((res.data ?? []) as Record<string, unknown>[]).map(parseEventCodeRow);
      return { source: table, rows, error: null };
    }
    lastErr = res.error.message ?? "Unknown error";
  }
  return { source: null, rows: [], error: lastErr ?? "Event code table not found." };
}

function buildPathWithNotice(notice: string, q = "") {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  params.set("notice", notice);
  return `/admin/ti?${params.toString()}`;
}

async function updateTiUserFieldAction(formData: FormData) {
  "use server";
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const q = String(formData.get("q") ?? "").trim();
  const field = String(formData.get("field") ?? "").trim();
  const valueRaw = String(formData.get("value") ?? "").trim();
  if (!id) redirect(buildPathWithNotice("Missing TI user id.", q));

  const allowed = new Set(["plan", "subscription_status", "trial_ends_at", "current_period_end"]);
  if (!allowed.has(field)) redirect(buildPathWithNotice("Invalid TI user field.", q));

  let value: string | null = valueRaw || null;
  if (field === "plan") value = (valueRaw || "insider").toLowerCase();
  if (field === "subscription_status") value = (valueRaw || "none").toLowerCase();

  const updates: Record<string, unknown> = { [field]: value };
  const { error } = await (supabaseAdmin.from("ti_users" as any) as any).update(updates).eq("id", id);
  if (error) redirect(buildPathWithNotice(`TI user update failed: ${error.message}`, q));
  redirect(buildPathWithNotice(`TI user ${field} updated.`, q));
}

async function deleteTiUserAction(formData: FormData) {
  "use server";
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();
  const q = String(formData.get("q") ?? "").trim();
  const confirmed = String(formData.get("confirm_delete") ?? "").trim() === "on";
  const deleteAuthUser = String(formData.get("delete_auth_user") ?? "").trim() === "on";

  if (!id) redirect(buildPathWithNotice("Missing TI user id.", q));
  if (!confirmed) redirect(buildPathWithNotice("Confirm delete checkbox is required.", q));

  const { error: savedDeleteError } = await (supabaseAdmin.from("ti_saved_tournaments" as any) as any)
    .delete()
    .eq("user_id", id);
  if (savedDeleteError) {
    redirect(buildPathWithNotice(`TI saved tournaments delete failed: ${savedDeleteError.message}`, q));
  }

  const { error: tiDeleteError } = await (supabaseAdmin.from("ti_users" as any) as any)
    .delete()
    .eq("id", id);
  if (tiDeleteError) {
    redirect(buildPathWithNotice(`TI user delete failed: ${tiDeleteError.message}`, q));
  }

  if (deleteAuthUser) {
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (authDeleteError) {
      redirect(
        buildPathWithNotice(
          `TI record deleted, but global auth delete failed: ${authDeleteError.message}`,
          q
        )
      );
    }
    redirect(buildPathWithNotice("TI user + global auth user deleted.", q));
  }

  redirect(buildPathWithNotice("TI user deleted.", q));
}

async function createEventCodeAction(formData: FormData) {
  "use server";
  await requireAdmin();
  const code = String(formData.get("code") ?? "").trim();
  const trialDays = Number(String(formData.get("trial_days") ?? "").trim() || "7");
  const maxRedemptions = Number(String(formData.get("max_redemptions") ?? "").trim() || "1");
  const startsAt = String(formData.get("starts_at") ?? "").trim();
  const expiresAt = String(formData.get("expires_at") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const foundingAccess = String(formData.get("founding_access") ?? "").trim() === "on";
  if (!code) redirect(buildPathWithNotice("Event code is required."));

  // First try RPC if present.
  const rpc = await (supabaseAdmin as any).rpc("create_event_code", {
    p_code: code,
    p_trial_days: Number.isFinite(trialDays) ? trialDays : 7,
    p_max_redemptions: Number.isFinite(maxRedemptions) ? maxRedemptions : 1,
    p_starts_at: startsAt || null,
    p_expires_at: expiresAt || null,
    p_notes: notes || null,
    p_founding_access: foundingAccess,
  });
  if (!rpc.error) {
    redirect(buildPathWithNotice("Event code created."));
  }

  // Fallback table inserts for current known table names.
  const payload = {
    code,
    status: "active",
    trial_days: Number.isFinite(trialDays) ? trialDays : 7,
    max_redemptions: Number.isFinite(maxRedemptions) ? maxRedemptions : 1,
    starts_at: startsAt || null,
    expires_at: expiresAt || null,
    notes: notes || null,
    founding_access: foundingAccess,
  };
  for (const table of ["ti_event_codes", "event_codes"]) {
    const ins = await (supabaseAdmin.from(table as any) as any).insert(payload);
    if (!ins.error) redirect(buildPathWithNotice("Event code created."));
  }
  redirect(buildPathWithNotice(`Event code create failed: ${rpc.error?.message ?? "unknown error"}`));
}

async function setEventCodeStatusAction(formData: FormData) {
  "use server";
  await requireAdmin();
  const table = String(formData.get("table") ?? "").trim();
  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim().toLowerCase();
  if (!table || !id || !status) redirect(buildPathWithNotice("Missing event code status inputs."));
  const { error } = await (supabaseAdmin.from(table as any) as any).update({ status }).eq("id", id);
  if (error) redirect(buildPathWithNotice(`Event code update failed: ${error.message}`));
  redirect(buildPathWithNotice("Event code updated."));
}

async function updateEventCodeAction(formData: FormData) {
  "use server";
  await requireAdmin();
  const table = String(formData.get("table") ?? "").trim();
  const id = String(formData.get("id") ?? "").trim();
  if (!table || !id) redirect(buildPathWithNotice("Missing event code edit inputs."));

  const code = String(formData.get("code") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim().toLowerCase();
  const trialDaysRaw = String(formData.get("trial_days") ?? "").trim();
  const maxRedemptionsRaw = String(formData.get("max_redemptions") ?? "").trim();
  const redeemedCountRaw = String(formData.get("redeemed_count") ?? "").trim();
  const startsAt = String(formData.get("starts_at") ?? "").trim();
  const expiresAt = String(formData.get("expires_at") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const foundingAccess = String(formData.get("founding_access") ?? "").trim() === "on";

  const parseIntOrNull = (value: string) => {
    if (!value) return null;
    const n = Number(value);
    return Number.isFinite(n) ? Math.floor(n) : null;
  };

  const updates: Record<string, unknown> = {
    code: code || null,
    status: status || null,
    trial_days: parseIntOrNull(trialDaysRaw),
    max_redemptions: parseIntOrNull(maxRedemptionsRaw),
    redeemed_count: parseIntOrNull(redeemedCountRaw),
    starts_at: startsAt || null,
    expires_at: expiresAt || null,
    notes: notes || null,
    founding_access: foundingAccess,
  };

  const { error } = await (supabaseAdmin.from(table as any) as any).update(updates).eq("id", id);
  if (error) redirect(buildPathWithNotice(`Event code save failed: ${error.message}`));
  redirect(buildPathWithNotice("Event code saved."));
}

export default async function TiAdminPage({
  searchParams,
}: {
  searchParams?: { q?: string; notice?: string };
}) {
  await requireAdmin();
  const q = (searchParams?.q ?? "").trim();
  const notice = (searchParams?.notice ?? "").trim();

  let query = (supabaseAdmin.from("ti_users" as any) as any)
    .select(
      "id,email,signup_source,signup_source_code,plan,subscription_status,trial_ends_at,current_period_end,created_at,first_seen_at,last_seen_at"
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (q) {
    query = query.or(`email.ilike.%${q}%,id.eq.${q}`);
  }
  const { data: tiUsers, error: tiUsersErr } = await query;
  const eventCodes = await loadEventCodes();

  return (
    <main style={{ maxWidth: 1400, margin: "0 auto", padding: "1rem" }}>
      <AdminNav />
      <section
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>TI Admin</h1>
          <p style={{ margin: "6px 0 0", color: "#475569" }}>
            Manage TournamentInsights users and event codes from RI admin.
          </p>
        </div>
        <Link
          href="/admin/ti"
          style={{
            textDecoration: "none",
            padding: "10px 14px",
            borderRadius: 10,
            background: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)",
            color: "#fff",
            fontWeight: 800,
            fontSize: 14,
            border: "1px solid #1d4ed8",
          }}
        >
          TI Admin
        </Link>
      </section>

      {notice ? (
        <p style={{ margin: "0 0 12px", padding: "8px 10px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8 }}>
          {notice}
        </p>
      ) : null}

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>TI User Admin</h2>
        <form action="/admin/ti" method="get" style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <input name="q" defaultValue={q} placeholder="Search email or user id" style={{ padding: 8, minWidth: 280 }} />
          <button type="submit">Search</button>
          <Link href="/admin/ti" style={{ alignSelf: "center" }}>
            Clear
          </Link>
        </form>
        {tiUsersErr ? (
          <p style={{ color: "#b91c1c" }}>TI users load failed: {tiUsersErr.message}</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 1180 }}>
              <thead>
                <tr>
                  {[
                    "Email",
                    "ID",
                    "Source",
                    "Source code",
                    "Plan",
                    "Subscription",
                    "Trial Ends",
                    "Renewal",
                    "Created",
                    "Seen",
                  ].map((head) => (
                    <th
                      key={head}
                      style={{
                        textAlign: "left",
                        borderBottom: "1px solid #cbd5e1",
                        padding: "9px 8px",
                        fontSize: 12,
                        background: "#f8fafc",
                        color: "#334155",
                        position: "sticky",
                        top: 0,
                      }}
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {((tiUsers ?? []) as TiUserRow[]).map((row, idx) => (
                  <tr key={row.id} style={{ background: idx % 2 === 0 ? "#ffffff" : "#f1f5f9" }}>
                    <td style={{ borderBottom: "1px solid #e2e8f0", padding: "10px 8px", verticalAlign: "top" }}>
                      <div style={{ fontWeight: 700 }}>{row.email ?? "—"}</div>
                      <div style={{ fontFamily: "monospace", fontSize: 11, color: "#64748b", marginTop: 3 }}>{row.id}</div>
                      <div
                        style={{
                          marginTop: 8,
                          padding: "8px 9px",
                          border: "1px solid #fecaca",
                          background: "#fff5f5",
                          borderRadius: 8,
                          display: "grid",
                          gap: 6,
                        }}
                      >
                        <form action={deleteTiUserAction} style={{ display: "grid", gap: 6 }}>
                          <input type="hidden" name="id" value={row.id} />
                          <input type="hidden" name="q" value={q} />
                          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
                            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                              <input type="checkbox" name="confirm_delete" />
                              Confirm TI delete
                            </label>
                            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#b91c1c" }}>
                              <input type="checkbox" name="delete_auth_user" />
                              Include RI+TI auth delete
                            </label>
                            <button
                              type="submit"
                              style={{
                                width: "fit-content",
                                background: "#fee2e2",
                                border: "1px solid #ef4444",
                                color: "#991b1b",
                                borderRadius: 7,
                                padding: "6px 10px",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Delete user
                            </button>
                          </div>
                        </form>
                      </div>
                    </td>
                    <td style={{ borderBottom: "1px solid #e2e8f0", padding: "10px 8px", fontFamily: "monospace", fontSize: 12 }}>{row.id}</td>
                    <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px", fontSize: 12 }}>
                      {row.signup_source ?? "website"}
                    </td>
                    <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px", fontSize: 12 }}>
                      {row.signup_source_code ?? "—"}
                    </td>
                    <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px" }}>
                      <form action={updateTiUserFieldAction} style={{ display: "flex", gap: 6 }}>
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="q" value={q} />
                        <input type="hidden" name="field" value="plan" />
                        <select name="value" defaultValue={(row.plan ?? "insider").toLowerCase()} style={{ padding: 6 }}>
                          <option value="insider">insider</option>
                          <option value="weekend_pro">weekend_pro</option>
                        </select>
                        <button type="submit">Set</button>
                      </form>
                    </td>
                    <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px" }}>
                      <form action={updateTiUserFieldAction} style={{ display: "flex", gap: 6 }}>
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="q" value={q} />
                        <input type="hidden" name="field" value="subscription_status" />
                        <select name="value" defaultValue={(row.subscription_status ?? "none").toLowerCase()} style={{ padding: 6 }}>
                          <option value="none">none</option>
                          <option value="active">active</option>
                          <option value="trialing">trialing</option>
                          <option value="canceled">canceled</option>
                          <option value="past_due">past_due</option>
                        </select>
                        <button type="submit">Set</button>
                      </form>
                    </td>
                    <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px" }}>
                      <form action={updateTiUserFieldAction} style={{ display: "flex", gap: 6 }}>
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="q" value={q} />
                        <input type="hidden" name="field" value="trial_ends_at" />
                        <input
                          name="value"
                          defaultValue={row.trial_ends_at ? row.trial_ends_at.slice(0, 16) : ""}
                          placeholder="YYYY-MM-DDTHH:mm"
                          style={{ padding: 6, width: 170 }}
                        />
                        <button type="submit">Set</button>
                      </form>
                    </td>
                    <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px" }}>
                      <form action={updateTiUserFieldAction} style={{ display: "flex", gap: 6 }}>
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="q" value={q} />
                        <input type="hidden" name="field" value="current_period_end" />
                        <input
                          name="value"
                          defaultValue={row.current_period_end ? row.current_period_end.slice(0, 16) : ""}
                          placeholder="YYYY-MM-DDTHH:mm"
                          style={{ padding: 6, width: 170 }}
                        />
                        <button type="submit">Set</button>
                      </form>
                    </td>
                    <td style={{ borderBottom: "1px solid #e2e8f0", padding: "10px 8px", fontSize: 12 }}>{fmtDate(row.created_at)}</td>
                    <td style={{ borderBottom: "1px solid #e2e8f0", padding: "10px 8px", fontSize: 12 }}>{fmtDate(row.last_seen_at ?? row.first_seen_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
        <h2 style={{ marginTop: 0 }}>Event Code Admin</h2>
        <form action={createEventCodeAction} style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 12 }}>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
            Code <span style={{ color: "#b91c1c" }}>(required)</span>
            <input name="code" placeholder="e.g. SPRING2026" required style={{ padding: 8 }} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
            Trial days <span style={{ color: "#b91c1c" }}>(required)</span>
            <input name="trial_days" type="number" min={1} defaultValue={7} required style={{ padding: 8 }} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
            Max redemptions <span style={{ color: "#b91c1c" }}>(required)</span>
            <input name="max_redemptions" type="number" min={1} defaultValue={1} required style={{ padding: 8 }} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
            Starts at <span style={{ color: "#64748b", fontWeight: 500 }}>(optional ISO)</span>
            <input name="starts_at" placeholder="2026-03-01T00:00:00Z" style={{ padding: 8 }} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
            Expires at <span style={{ color: "#64748b", fontWeight: 500 }}>(optional ISO)</span>
            <input name="expires_at" placeholder="2026-06-01T00:00:00Z" style={{ padding: 8 }} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
            Notes <span style={{ color: "#64748b", fontWeight: 500 }}>(optional)</span>
            <input name="notes" placeholder="Campaign notes" style={{ padding: 8 }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700 }}>
            <input name="founding_access" type="checkbox" />
            Founding Access
          </label>
          <div style={{ display: "flex", alignItems: "end" }}>
            <button type="submit" style={{ padding: "8px 10px" }}>Create event code</button>
          </div>
        </form>
        {eventCodes.error ? (
          <p style={{ color: "#b91c1c", marginTop: 0 }}>
            Event code list unavailable: {eventCodes.error}
          </p>
        ) : (
          <>
            <LabelPrintSettings />
            <p style={{ marginTop: 0, color: "#475569", fontSize: 13 }}>
              Source table: <strong>{eventCodes.source}</strong>
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                <thead>
                  <tr>
                    {["Code", "Status", "Trial", "Usage", "Founding Access", "Starts", "Expires", "Created", "Notes", "Actions"].map((head) => (
                      <th key={head} style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "8px 6px", fontSize: 12 }}>
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {eventCodes.rows.map((row, idx) => (
                    <tr key={`${row.id ?? row.code ?? "row"}-${idx}`}>
                      <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px", fontWeight: 700 }}>
                        <input
                          form={`event-code-edit-${row.id ?? idx}`}
                          name="code"
                          defaultValue={row.code ?? ""}
                          style={{ width: 130, padding: 6, fontWeight: 700 }}
                        />
                      </td>
                      <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px" }}>
                        <select form={`event-code-edit-${row.id ?? idx}`} name="status" defaultValue={row.status ?? "active"} style={{ padding: 6 }}>
                          <option value="active">active</option>
                          <option value="disabled">disabled</option>
                          <option value="expired">expired</option>
                        </select>
                      </td>
                      <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px" }}>
                        <input
                          form={`event-code-edit-${row.id ?? idx}`}
                          name="trial_days"
                          type="number"
                          min={1}
                          defaultValue={row.trial_days ?? 7}
                          style={{ width: 78, padding: 6 }}
                        />
                      </td>
                      <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px" }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input
                            form={`event-code-edit-${row.id ?? idx}`}
                            name="redeemed_count"
                            type="number"
                            min={0}
                            defaultValue={row.redeemed_count ?? 0}
                            style={{ width: 72, padding: 6 }}
                            title="Redeemed count"
                          />
                          <span>/</span>
                          <input
                            form={`event-code-edit-${row.id ?? idx}`}
                            name="max_redemptions"
                            type="number"
                            min={1}
                            defaultValue={row.max_redemptions ?? 1}
                            style={{ width: 72, padding: 6 }}
                            title="Max redemptions"
                          />
                        </div>
                      </td>
                      <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px", fontSize: 12 }}>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <input
                            form={`event-code-edit-${row.id ?? idx}`}
                            name="founding_access"
                            type="checkbox"
                            defaultChecked={Boolean(row.founding_access)}
                          />
                          Founding Access
                        </label>
                      </td>
                      <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px", fontSize: 12 }}>
                        <input
                          form={`event-code-edit-${row.id ?? idx}`}
                          name="starts_at"
                          defaultValue={row.starts_at ?? ""}
                          placeholder="ISO"
                          style={{ width: 180, padding: 6 }}
                        />
                      </td>
                      <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px", fontSize: 12 }}>
                        <input
                          form={`event-code-edit-${row.id ?? idx}`}
                          name="expires_at"
                          defaultValue={row.expires_at ?? ""}
                          placeholder="ISO"
                          style={{ width: 180, padding: 6 }}
                        />
                      </td>
                      <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px", fontSize: 12 }}>{fmtDate(row.created_at)}</td>
                      <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px", fontSize: 12 }}>
                        <input
                          form={`event-code-edit-${row.id ?? idx}`}
                          name="notes"
                          defaultValue={row.notes ?? ""}
                          style={{ width: 220, padding: 6 }}
                        />
                      </td>
                      <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px" }}>
                        {eventCodes.source && row.id ? (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <form id={`event-code-edit-${row.id ?? idx}`} action={updateEventCodeAction}>
                              <input type="hidden" name="table" value={eventCodes.source} />
                              <input type="hidden" name="id" value={row.id} />
                              <button type="submit">Save</button>
                            </form>
                            <PrintLabelButton
                              code={row.code ?? ""}
                              foundingAccess={Boolean(row.founding_access)}
                              formId={`event-code-edit-${row.id ?? idx}`}
                            />
                            <form action={setEventCodeStatusAction}>
                              <input type="hidden" name="table" value={eventCodes.source} />
                              <input type="hidden" name="id" value={row.id} />
                              <input type="hidden" name="status" value="active" />
                              <button type="submit">Activate</button>
                            </form>
                            <form action={setEventCodeStatusAction}>
                              <input type="hidden" name="table" value={eventCodes.source} />
                              <input type="hidden" name="id" value={row.id} />
                              <input type="hidden" name="status" value="disabled" />
                              <button type="submit">Disable</button>
                            </form>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
