import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("profiles" as any)
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingError) {
    console.error("accept-terms: profile lookup failed", existingError);
    return NextResponse.json({ error: "profile_lookup_failed" }, { status: 500 });
  }

  const payload = { user_id: user.id, contact_terms_accepted_at: new Date().toISOString() };
  const existingUserId = (existing as any)?.user_id;
  const { error } = existingUserId
    ? await supabaseAdmin.from("profiles" as any).update(payload).eq("user_id", user.id)
    : await supabaseAdmin.from("profiles" as any).insert(payload);

  if (error) {
    console.error("accept-terms: update failed", error);
    return NextResponse.json({ error: "accept_terms_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
