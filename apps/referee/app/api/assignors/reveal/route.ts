import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const USER_LIMIT_PER_DAY = 60;
const IP_LIMIT_PER_DAY = 200;
const RATE_LIMIT_KEY = "assignor_reveal";

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
  const assignorId = body?.assignor_id ? String(body.assignor_id) : "";
  if (!assignorId) {
    return NextResponse.json({ error: "missing_assignor_id" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles" as any)
    .select("contact_terms_accepted_at")
    .eq("user_id", user.id)
    .maybeSingle();

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
    .select("assignor_id,type,contact_type,value,normalized_value,is_primary")
    .eq("assignor_id", assignorId);

  if (contactsError) {
    return NextResponse.json({ error: "contacts_unavailable" }, { status: 500 });
  }

  const email = pickPrimary(contactRows ?? [], "email");
  const phone = pickPrimary(contactRows ?? [], "phone");

  await supabaseAdmin.from("contact_access_log" as any).insert({
    user_id: user.id,
    assignor_id: assignorId,
    ip_hash: ipHash,
    user_agent_hash: uaHash,
  });

  return NextResponse.json({ email, phone });
}
