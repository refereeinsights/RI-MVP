import { NextRequest, NextResponse } from "next/server";
import { getTiOutreachAdminUser } from "@/lib/outreachAdmin";
import { getOutreachGuardSecret } from "@/lib/outreach";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Body = {
  preview_id?: string;
  replied?: boolean;
  note?: string;
};

async function authorize(request: NextRequest) {
  const headerKey = request.headers.get("X-OUTREACH-KEY") || "";
  const expected = getOutreachGuardSecret();
  if (expected && headerKey === expected) {
    return { authorized: true, email: "" };
  }

  const user = await getTiOutreachAdminUser();
  return { authorized: !!user, email: user?.email?.trim().toLowerCase() || "" };
}

export async function POST(request: NextRequest) {
  let auth: { authorized: boolean; email: string };
  try {
    auth = await authorize(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ti-outreach] mark-replied authorize failed", { error: message });
    return NextResponse.json({ error: `Authorization failed: ${message}` }, { status: 500 });
  }
  if (!auth.authorized) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }

  const previewId = String(body.preview_id ?? "").trim();
  if (!previewId) {
    return NextResponse.json({ error: "preview_id is required." }, { status: 400 });
  }

  const replied = body.replied !== false;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : null;
  const nowIso = new Date().toISOString();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      {
        error:
          "Supabase admin client is not configured. Missing NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY in this runtime environment.",
      },
      { status: 500 }
    );
  }

  const updatePayload = replied
    ? {
        director_replied_at: nowIso,
        director_replied_note: note,
        director_replied_by_email: auth.email || null,
      }
    : {
        director_replied_at: null,
        director_replied_note: null,
        director_replied_by_email: null,
      };

  try {
    const { error } = await (supabaseAdmin.from("email_outreach_previews" as any) as any)
      .update(updatePayload)
      .eq("id", previewId);

    if (error) {
      const message = typeof error?.message === "string" ? error.message : String(error);
      console.error("[ti-outreach] mark-replied update failed", { previewId, error: message });
      const normalized = message.toLowerCase();
      const missingColumn =
        normalized.includes("director_replied_at") &&
        (normalized.includes("does not exist") ||
          normalized.includes("could not find") ||
          normalized.includes("schema cache") ||
          normalized.includes("column"));
      if (missingColumn) {
        return NextResponse.json(
          {
            error:
              "Outreach tracking columns are missing in Supabase. Apply migration `supabase/migrations/20260329_email_outreach_preview_tracking.sql` (then retry).",
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: message }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ti-outreach] mark-replied threw", { previewId, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
