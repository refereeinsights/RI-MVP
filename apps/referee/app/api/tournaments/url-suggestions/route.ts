import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeSourceUrl } from "@/lib/normalizeSourceUrl";

type Payload = {
  tournament_id?: string;
  suggested_url?: string;
  submitter_email?: string;
};

async function readPayload(req: Request): Promise<Payload> {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await req.json()) as Payload;
  }
  const form = await req.formData();
  return {
    tournament_id: String(form.get("tournament_id") || ""),
    suggested_url: String(form.get("suggested_url") || ""),
    submitter_email: String(form.get("submitter_email") || ""),
  };
}

export async function POST(req: Request) {
  let body: Payload;
  try {
    body = await readPayload(req);
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const tournament_id = (body.tournament_id || "").trim();
  const suggestedRaw = (body.suggested_url || "").trim();
  const submitter_email = (body.submitter_email || "").trim() || null;
  if (!tournament_id || !suggestedRaw) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const normalized = normalizeSourceUrl(suggestedRaw).normalized;
  if (!normalized) {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }
  const domain = (() => {
    try {
      return new URL(normalized).hostname;
    } catch {
      return null;
    }
  })();

  const insertResp = await supabaseAdmin
    .from("tournament_url_suggestions" as any)
    .upsert(
      {
        tournament_id,
        suggested_url: normalized,
        suggested_domain: domain,
        submitter_email,
        status: "pending",
      },
      { onConflict: "tournament_id,suggested_url" }
    );
  if (insertResp.error) {
    console.error("url suggestion insert failed", insertResp.error);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
