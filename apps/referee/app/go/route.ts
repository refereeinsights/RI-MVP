import { NextResponse } from "next/server";
import crypto from "crypto";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeSourceUrl } from "@/lib/normalizeSourceUrl";

export const runtime = "nodejs";

function sanitizeDestination(raw: string) {
  const { canonical } = normalizeSourceUrl(raw);
  const url = new URL(canonical);
  const destination_domain = url.hostname;
  const destination_path = url.pathname || "/";
  const destination_url = `${url.origin}${destination_path}`;
  return {
    redirect_url: url.toString(),
    destination_domain,
    destination_path,
    destination_url,
  };
}

function sign(secret: string, value: string) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("u");
  const sig = searchParams.get("sig");
  const sourceId = searchParams.get("sid");

  if (!rawUrl || !sig) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }
  const secret = process.env.GO_REDIRECT_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "missing_secret" }, { status: 400 });
  }

  const expected = sign(secret, rawUrl);
  const expectedBuf = Buffer.from(expected);
  const sigBuf = Buffer.from(sig);
  const valid = expectedBuf.length === sigBuf.length && crypto.timingSafeEqual(expectedBuf, sigBuf);
  if (!valid) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  let destination;
  try {
    destination = sanitizeDestination(rawUrl);
  } catch {
    return NextResponse.json({ error: "invalid_destination" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id ?? null;

  try {
    await supabaseAdmin.from("outbound_clicks").insert({
      user_id: userId,
      tournament_id: null,
      source_id: sourceId ?? null,
      destination_url: destination.destination_url,
      destination_domain: destination.destination_domain,
      destination_path: destination.destination_path,
      sport: null,
      ua_hash: null,
      ip_hash: null,
    });
  } catch (err) {
    console.error("[outbound_clicks] insert failed", err);
  }

  const response = NextResponse.redirect(destination.redirect_url, 302);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}
