import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const USER_LIMIT_PER_DAY = 10;
const IP_LIMIT_PER_DAY = 30;
const RATE_LIMIT_KEY = "assignor_reveal_page";

function hashValue(value: string) {
  const secret = process.env.CONTACT_ACCESS_HASH_SECRET ?? "local-dev";
  return createHash("sha256").update(`${secret}:${value}`).digest("hex");
}

function getHeaderValue(name: string) {
  return headers().get(name) ?? "";
}

function pickPrimary(rows: any[], kind: "email" | "phone") {
  const filtered = rows.filter((r) => {
    const raw = String(r?.type ?? r?.contact_type ?? "").toLowerCase();
    return raw === kind;
  });
  const primary = filtered.find((r) => r.is_primary);
  const fallback = filtered[0];
  const best = primary ?? fallback;
  return best?.value ?? best?.normalized_value ?? null;
}

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const assignorIds = Array.isArray(body?.assignor_ids) ? body.assignor_ids.map(String) : [];
  if (!assignorIds.length) {
    return NextResponse.json({ error: "missing_assignor_ids" }, { status: 400 });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles" as any)
    .select("contact_terms_accepted_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError) {
    return NextResponse.json({ error: "profile_lookup_failed" }, { status: 500 });
  }

  const termsAccepted = !!(profile as any)?.contact_terms_accepted_at;
  if (!termsAccepted) {
    return NextResponse.json({ error: "terms_required" }, { status: 403 });
  }

  const ipHeader = getHeaderValue("x-forwarded-for") || getHeaderValue("x-real-ip") || "unknown";
  const ip = ipHeader.split(",")[0]?.trim() || "unknown";
  const ua = getHeaderValue("user-agent") || "unknown";

  const ipHash = hashValue(ip);
  const uaHash = hashValue(ua);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [{ count: userCount }, { count: ipCount }] = await Promise.all([
    supabaseAdmin
      .from("rate_limit_events" as any)
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("key", RATE_LIMIT_KEY)
      .gte("created_at", since),
    supabaseAdmin
      .from("rate_limit_events" as any)
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .eq("key", RATE_LIMIT_KEY)
      .gte("created_at", since),
  ]);

  if ((userCount ?? 0) >= USER_LIMIT_PER_DAY || (ipCount ?? 0) >= IP_LIMIT_PER_DAY) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  await supabaseAdmin.from("rate_limit_events" as any).insert({
    user_id: user.id,
    ip_hash: ipHash,
    key: RATE_LIMIT_KEY,
  });

  const { data: contactRows, error: contactsError } = await supabaseAdmin
    .from("assignor_contacts" as any)
    .select("assignor_id,type,value,normalized_value,is_primary")
    .in("assignor_id", assignorIds);

  if (contactsError) {
    console.error("reveal-bulk: contacts fetch failed", contactsError);
    return NextResponse.json({ error: "contacts_unavailable" }, { status: 500 });
  }

  const grouped = new Map<string, any[]>();
  (contactRows ?? []).forEach((row: any) => {
    const list = grouped.get(row.assignor_id) ?? [];
    list.push(row);
    grouped.set(row.assignor_id, list);
  });

  const response: Record<string, { email: string | null; phone: string | null }> = {};
  assignorIds.forEach((id) => {
    const rows = grouped.get(id) ?? [];
    response[id] = {
      email: pickPrimary(rows, "email"),
      phone: pickPrimary(rows, "phone"),
    };
  });

  const logRows = assignorIds.map((id) => ({
    user_id: user.id,
    assignor_id: id,
    ip_hash: ipHash,
    user_agent_hash: uaHash,
  }));
  if (logRows.length) {
    await supabaseAdmin.from("contact_access_log" as any).insert(logRows);
  }

  return NextResponse.json(response);
}
