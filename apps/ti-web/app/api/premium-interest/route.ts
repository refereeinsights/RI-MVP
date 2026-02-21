import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  let body: { email?: string } | null = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!email || !isEmail(email)) {
    return NextResponse.json({ ok: false, error: "Valid email required." }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("ti_premium_interest" as any)
    .insert({ email });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
