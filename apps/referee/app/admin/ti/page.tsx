import Link from "next/link";
import { redirect } from "next/navigation";
import type { User as AuthUser } from "@supabase/supabase-js";
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
  display_name: string | null;
  username: string | null;
  reviewer_handle: string | null;
  zip_code: string | null;
  sports_interests: string[] | null;
};

type AuthTroubleshootRow = {
  id: string;
  email: string | null;
  created_at: string | null;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  has_ti_user: boolean;
  ti_plan: string | null;
  ti_status: string | null;
  profile_role: string | null;
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

const TI_SPORTS = [
  "soccer",
  "basketball",
  "football",
  "baseball",
  "softball",
  "volleyball",
  "lacrosse",
  "wrestling",
  "hockey",
  "futsal",
] as const;

const TI_SPORT_LABELS: Record<(typeof TI_SPORTS)[number], string> = {
  soccer: "Soccer",
  basketball: "Basketball",
  football: "Football",
  baseball: "Baseball",
  softball: "Softball",
  volleyball: "Volleyball",
  lacrosse: "Lacrosse",
  wrestling: "Wrestling",
  hockey: "Hockey",
  futsal: "Futsal",
};

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
const ZIP_PATTERN = /^\d{5}(?:-\d{4})?$/;

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function normalizeDisplayName(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  return normalized || null;
}

function normalizeUsername(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function normalizeZipCode(value: string | null | undefined) {
  return (value ?? "").trim();
}

function normalizeSportsInterests(values: string[]) {
  const allowed = new Set<string>(TI_SPORTS);
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const sport = String(value ?? "").trim().toLowerCase();
    if (!allowed.has(sport) || seen.has(sport)) continue;
    seen.add(sport);
    normalized.push(sport);
  }

  return normalized;
}

function displayNameFromEmail(email: string | null) {
  if (!email) return "Unknown user";
  const local = email.split("@")[0] ?? "";
  const clean = local.replace(/[._-]+/g, " ").trim();
  if (!clean) return email;
  return clean
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

async function updateTiUserProfileAction(formData: FormData) {
  "use server";
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();
  const q = String(formData.get("q") ?? "").trim();
  if (!id) redirect(buildPathWithNotice("Missing TI user id.", q));

  const displayName = normalizeDisplayName(String(formData.get("display_name") ?? ""));
  const username = normalizeUsername(String(formData.get("username") ?? ""));
  const zipCode = normalizeZipCode(String(formData.get("zip_code") ?? ""));
  const sportsInterests = normalizeSportsInterests(
    formData.getAll("sports_interests").map((value) => String(value))
  );

  if (!USERNAME_PATTERN.test(username)) {
    redirect(
      buildPathWithNotice(
        "Username must be 3-20 characters using letters, numbers, or underscores.",
        q
      )
    );
  }
  if (!zipCode) redirect(buildPathWithNotice("ZIP code is required.", q));
  if (!ZIP_PATTERN.test(zipCode)) {
    redirect(buildPathWithNotice("Enter a valid ZIP code (e.g., 99216).", q));
  }
  if (sportsInterests.length === 0) {
    redirect(buildPathWithNotice("Pick at least one sport interest.", q));
  }

  const usernameCheck = await (supabaseAdmin.from("ti_users" as any) as any)
    .select("id", { head: true, count: "exact" })
    .or(`username.eq.${username},reviewer_handle.eq.${username}`)
    .neq("id", id);
  if (usernameCheck.error) {
    redirect(buildPathWithNotice(`Username check failed: ${usernameCheck.error.message}`, q));
  }
  if ((usernameCheck.count ?? 0) > 0) {
    redirect(buildPathWithNotice("That username is taken.", q));
  }

  const authLookup = await (supabaseAdmin.auth.admin as any).getUserById(id);
  const existingMetadata = authLookup?.data?.user?.user_metadata ?? {};
  const authMissing = Boolean(authLookup?.error);

  if (!authMissing) {
    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(id, {
      user_metadata: {
        ...existingMetadata,
        display_name: displayName,
        username,
        handle: username,
        zip_code: zipCode,
        sports_interests: sportsInterests,
      },
    });
    if (authUpdateError) {
      redirect(buildPathWithNotice(`Auth profile update failed: ${authUpdateError.message}`, q));
    }
  }

  const { error: profileError } = await (supabaseAdmin.from("ti_users" as any) as any)
    .update({
      display_name: displayName,
      username,
      reviewer_handle: username,
      zip_code: zipCode,
      sports_interests: sportsInterests,
    })
    .eq("id", id);
  if (profileError) {
    redirect(buildPathWithNotice(`TI profile update failed: ${profileError.message}`, q));
  }

  redirect(
    buildPathWithNotice(
      authMissing
        ? "TI profile updated, but auth metadata was missing for this user."
        : "TI profile updated.",
      q
    )
  );
}

async function backfillTiUserFromAuthAction(formData: FormData) {
  "use server";
  await requireAdmin();
  const userId = String(formData.get("user_id") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const q = String(formData.get("q") ?? "").trim();
  if (!userId) redirect(buildPathWithNotice("Missing auth user id.", q));

  const payload: Record<string, unknown> = {
    id: userId,
    email: email || null,
  };
  const { error } = await (supabaseAdmin.from("ti_users" as any) as any).upsert(payload, { onConflict: "id" });
  if (error) redirect(buildPathWithNotice(`Backfill TI user failed: ${error.message}`, q));
  redirect(buildPathWithNotice("TI user backfilled from auth.users.", q));
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

async function loadAuthTroubleshooting(q: string): Promise<{ rows: AuthTroubleshootRow[]; error: string | null }> {
  if (!q) return { rows: [], error: null };
  const normalizedQuery = q.trim().toLowerCase();
  if (!normalizedQuery) return { rows: [], error: null };

  const users: AuthUser[] = [];
  try {
    const uuidQuery = isUuid(normalizedQuery);
    const maxPages = 10;
    const perPage = 200;
    for (let page = 1; page <= maxPages; page += 1) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) return { rows: [], error: error.message };
      const pageUsers = data?.users ?? [];
      if (!pageUsers.length) break;
      for (const user of pageUsers) {
        const email = (user.email ?? "").toLowerCase();
        const id = String(user.id ?? "");
        const matches = uuidQuery ? id === normalizedQuery : email.includes(normalizedQuery) || id === normalizedQuery;
        if (matches) users.push(user as AuthUser);
      }
      if (pageUsers.length < perPage) break;
    }

    if (!users.length) return { rows: [], error: null };
    const userIds = users.map((u) => u.id);

    const [{ data: tiRows, error: tiErr }, { data: profileRows, error: profErr }] = await Promise.all([
      (supabaseAdmin.from("ti_users" as any) as any)
        .select("id,plan,status")
        .in("id", userIds),
      (supabaseAdmin.from("profiles" as any) as any)
        .select("user_id,role")
        .in("user_id", userIds),
    ]);
    if (tiErr) return { rows: [], error: tiErr.message };
    if (profErr) return { rows: [], error: profErr.message };

    const tiById = new Map<string, { plan: string | null; status: string | null }>(
      ((tiRows ?? []) as Array<{ id: string; plan: string | null; status: string | null }>).map((row) => [
        row.id,
        { plan: row.plan ?? null, status: row.status ?? null },
      ]),
    );
    const roleById = new Map<string, string | null>(
      ((profileRows ?? []) as Array<{ user_id: string; role: string | null }>).map((row) => [row.user_id, row.role ?? null]),
    );

    const rows: AuthTroubleshootRow[] = users.map((user) => {
      const ti = tiById.get(user.id);
      return {
        id: user.id,
        email: user.email ?? null,
        created_at: user.created_at ?? null,
        email_confirmed_at: user.email_confirmed_at ?? null,
        last_sign_in_at: user.last_sign_in_at ?? null,
        has_ti_user: Boolean(ti),
        ti_plan: ti?.plan ?? null,
        ti_status: ti?.status ?? null,
        profile_role: roleById.get(user.id) ?? null,
      };
    });

    rows.sort((a, b) => {
      const aCreated = a.created_at ? Date.parse(a.created_at) : 0;
      const bCreated = b.created_at ? Date.parse(b.created_at) : 0;
      return bCreated - aCreated;
    });
    return { rows, error: null };
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : "Failed to load auth troubleshooting." };
  }
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
      "id,email,signup_source,signup_source_code,plan,subscription_status,trial_ends_at,current_period_end,created_at,first_seen_at,last_seen_at,display_name,username,reviewer_handle,zip_code,sports_interests"
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (q) {
    query = isUuid(q)
      ? query.or(`email.ilike.%${q}%,id.eq.${q}`)
      : query.ilike("email", `%${q}%`);
  }
  const { data: tiUsers, error: tiUsersErr } = await query;
  const authTroubleshoot = await loadAuthTroubleshooting(q);
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
          <div style={{ display: "grid", gap: 10 }}>
            {((tiUsers ?? []) as TiUserRow[]).map((row, idx) => (
              <details
                key={row.id}
                style={{
                  border: "1px solid #dbe4ef",
                  borderRadius: 10,
                  background: idx % 2 === 0 ? "#ffffff" : "#f3f7fb",
                }}
              >
                <summary
                  style={{
                    cursor: "pointer",
                    listStyle: "auto",
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <span style={{ fontWeight: 700 }}>
                    {displayNameFromEmail(row.email)} <span style={{ fontWeight: 500, color: "#334155" }}>({row.email ?? "—"})</span>
                  </span>
                  <span style={{ fontSize: 12, color: "#64748b" }}>
                    {row.username ?? row.reviewer_handle ?? "—"} · {row.plan ?? "insider"} · {row.subscription_status ?? "none"}
                  </span>
                </summary>
                <div style={{ padding: "0 12px 12px", borderTop: "1px solid #dbe4ef", display: "grid", gap: 10 }}>
                  <div style={{ fontFamily: "monospace", fontSize: 12, color: "#475569", marginTop: 8 }}>{row.id}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10 }}>
                    <div style={{ fontSize: 12 }}>
                      <div style={{ color: "#64748b" }}>Signup source</div>
                      <div>{row.signup_source ?? "website"}</div>
                    </div>
                    <div style={{ fontSize: 12 }}>
                      <div style={{ color: "#64748b" }}>Source code</div>
                      <div>{row.signup_source_code ?? "—"}</div>
                    </div>
                    <div style={{ fontSize: 12 }}>
                      <div style={{ color: "#64748b" }}>Created</div>
                      <div>{fmtDate(row.created_at)}</div>
                    </div>
                    <div style={{ fontSize: 12 }}>
                      <div style={{ color: "#64748b" }}>Seen</div>
                      <div>{fmtDate(row.last_seen_at ?? row.first_seen_at)}</div>
                    </div>
                    <div style={{ fontSize: 12 }}>
                      <div style={{ color: "#64748b" }}>Display name</div>
                      <div>{row.display_name ?? "—"}</div>
                    </div>
                    <div style={{ fontSize: 12 }}>
                      <div style={{ color: "#64748b" }}>Username</div>
                      <div>{row.username ?? row.reviewer_handle ?? "—"}</div>
                    </div>
                    <div style={{ fontSize: 12 }}>
                      <div style={{ color: "#64748b" }}>ZIP</div>
                      <div>{row.zip_code ?? "—"}</div>
                    </div>
                    <div style={{ fontSize: 12 }}>
                      <div style={{ color: "#64748b" }}>Sports interests</div>
                      <div>
                        {(row.sports_interests ?? []).length
                          ? (row.sports_interests ?? [])
                              .map((sport) => TI_SPORT_LABELS[sport as keyof typeof TI_SPORT_LABELS] ?? sport)
                              .join(", ")
                          : "—"}
                      </div>
                    </div>
                  </div>
                  <form
                    action={updateTiUserProfileAction}
                    style={{
                      border: "1px solid #dbe4ef",
                      borderRadius: 10,
                      padding: 12,
                      display: "grid",
                      gap: 12,
                      background: "#fff",
                    }}
                  >
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="q" value={q} />
                    <div style={{ fontWeight: 700, fontSize: 13 }}>Profile settings</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                      <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#334155" }}>
                        Full name
                        <input
                          name="display_name"
                          defaultValue={row.display_name ?? ""}
                          placeholder="Optional"
                          style={{ padding: 8 }}
                        />
                      </label>
                      <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#334155" }}>
                        Username
                        <input
                          name="username"
                          defaultValue={row.username ?? row.reviewer_handle ?? ""}
                          placeholder="Choose a username"
                          required
                          style={{ padding: 8 }}
                        />
                      </label>
                      <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#334155" }}>
                        ZIP code
                        <input
                          name="zip_code"
                          defaultValue={row.zip_code ?? ""}
                          placeholder="99216"
                          required
                          style={{ padding: 8 }}
                        />
                      </label>
                    </div>
                    <fieldset
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        padding: 10,
                        display: "grid",
                        gap: 8,
                      }}
                    >
                      <legend style={{ fontSize: 12, fontWeight: 700, padding: "0 6px" }}>Sports interests</legend>
                      <div style={{ fontSize: 12, color: "#64748b" }}>
                        Choose one or more. These are the same values used in TI personalization.
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
                        {TI_SPORTS.map((sport) => (
                          <label
                            key={`${row.id}-${sport}`}
                            style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: "#334155" }}
                          >
                            <input
                              type="checkbox"
                              name="sports_interests"
                              value={sport}
                              defaultChecked={(row.sports_interests ?? []).includes(sport)}
                            />
                            <span>{TI_SPORT_LABELS[sport]}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <div>
                      <button type="submit">Save profile settings</button>
                    </div>
                  </form>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 8 }}>
                    <form action={updateTiUserFieldAction} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="q" value={q} />
                      <input type="hidden" name="field" value="plan" />
                      <label style={{ fontSize: 12, color: "#64748b" }}>Plan</label>
                      <select name="value" defaultValue={(row.plan ?? "insider").toLowerCase()} style={{ padding: 6 }}>
                        <option value="insider">insider</option>
                        <option value="weekend_pro">weekend_pro</option>
                      </select>
                      <button type="submit">Set</button>
                    </form>
                    <form action={updateTiUserFieldAction} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="q" value={q} />
                      <input type="hidden" name="field" value="subscription_status" />
                      <label style={{ fontSize: 12, color: "#64748b" }}>Subscription</label>
                      <select name="value" defaultValue={(row.subscription_status ?? "none").toLowerCase()} style={{ padding: 6 }}>
                        <option value="none">none</option>
                        <option value="active">active</option>
                        <option value="trialing">trialing</option>
                        <option value="canceled">canceled</option>
                        <option value="past_due">past_due</option>
                      </select>
                      <button type="submit">Set</button>
                    </form>
                    <form action={updateTiUserFieldAction} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="q" value={q} />
                      <input type="hidden" name="field" value="trial_ends_at" />
                      <label style={{ fontSize: 12, color: "#64748b" }}>Trial ends</label>
                      <input
                        name="value"
                        defaultValue={row.trial_ends_at ? row.trial_ends_at.slice(0, 16) : ""}
                        placeholder="YYYY-MM-DDTHH:mm"
                        style={{ padding: 6, width: 170 }}
                      />
                      <button type="submit">Set</button>
                    </form>
                    <form action={updateTiUserFieldAction} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="q" value={q} />
                      <input type="hidden" name="field" value="current_period_end" />
                      <label style={{ fontSize: 12, color: "#64748b" }}>Renewal</label>
                      <input
                        name="value"
                        defaultValue={row.current_period_end ? row.current_period_end.slice(0, 16) : ""}
                        placeholder="YYYY-MM-DDTHH:mm"
                        style={{ padding: 6, width: 170 }}
                      />
                      <button type="submit">Set</button>
                    </form>
                  </div>
                  <div
                    style={{
                      marginTop: 2,
                      padding: "8px 10px",
                      border: "1px solid #fecaca",
                      background: "#fff5f5",
                      borderRadius: 8,
                    }}
                  >
                    <form action={deleteTiUserAction} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="q" value={q} />
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
                    </form>
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Auth Troubleshooting</h2>
        <p style={{ marginTop: 0, color: "#475569", fontSize: 13 }}>
          Uses <code>auth.users</code> + <code>ti_users</code> + <code>profiles</code> for signup/login troubleshooting.
          Search by email or auth user id above.
        </p>
        {!q ? (
          <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>Enter an email/id in search to run auth troubleshooting.</p>
        ) : authTroubleshoot.error ? (
          <p style={{ margin: 0, color: "#b91c1c" }}>Auth troubleshooting failed: {authTroubleshoot.error}</p>
        ) : authTroubleshoot.rows.length === 0 ? (
          <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>No matching auth.users rows found.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {authTroubleshoot.rows.map((row) => (
              <details key={row.id} style={{ border: "1px solid #dbe4ef", borderRadius: 10, background: "#fff" }}>
                <summary
                  style={{
                    cursor: "pointer",
                    listStyle: "auto",
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <span style={{ fontWeight: 700 }}>
                    {displayNameFromEmail(row.email)} <span style={{ fontWeight: 500, color: "#334155" }}>({row.email ?? "—"})</span>
                  </span>
                  <span style={{ fontSize: 12, color: "#64748b" }}>
                    auth:{row.email_confirmed_at ? "confirmed" : "pending"} · ti:{row.has_ti_user ? "present" : "missing"}
                  </span>
                </summary>
                <div style={{ padding: "0 12px 12px", borderTop: "1px solid #dbe4ef", display: "grid", gap: 10 }}>
                  <div style={{ fontFamily: "monospace", fontSize: 12, color: "#475569", marginTop: 8 }}>{row.id}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, fontSize: 12 }}>
                    <div><div style={{ color: "#64748b" }}>Auth created</div><div>{fmtDate(row.created_at)}</div></div>
                    <div><div style={{ color: "#64748b" }}>Email confirmed</div><div>{fmtDate(row.email_confirmed_at)}</div></div>
                    <div><div style={{ color: "#64748b" }}>Last sign-in</div><div>{fmtDate(row.last_sign_in_at)}</div></div>
                    <div><div style={{ color: "#64748b" }}>TI row</div><div>{row.has_ti_user ? `yes (${row.ti_plan ?? "free"} · ${row.ti_status ?? "active"})` : "missing"}</div></div>
                    <div><div style={{ color: "#64748b" }}>Profile role</div><div>{row.profile_role ?? "—"}</div></div>
                  </div>
                  {!row.has_ti_user ? (
                    <form action={backfillTiUserFromAuthAction} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <input type="hidden" name="user_id" value={row.id} />
                      <input type="hidden" name="email" value={row.email ?? ""} />
                      <input type="hidden" name="q" value={q} />
                      <button type="submit">Backfill TI user from auth</button>
                    </form>
                  ) : null}
                </div>
              </details>
            ))}
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
