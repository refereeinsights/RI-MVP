import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function safeEmail(value: string | null) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return null;
  if (email.length > 320) return null;
  return email;
}

export async function GET(req: Request) {
  // Neutral response shape (avoid leaking whether a user exists beyond "confirmed" vs not).
  try {
    const url = new URL(req.url);
    const email = safeEmail(url.searchParams.get("email"));
    if (!email) return NextResponse.json({ ok: true, confirmed: false });

    // Supabase Admin API doesn't provide a direct get-by-email; scan a few pages.
    // This is only used on the signup "check your email" screen, so volume is low.
    const perPage = 200;
    const maxPages = 10; // up to 2000 users scanned
    for (let page = 1; page <= maxPages; page += 1) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) break;
      const users = data?.users ?? [];
      const match = users.find((u) => String(u.email ?? "").toLowerCase() === email);
      if (match) {
        const confirmed = Boolean((match as any)?.email_confirmed_at);
        return NextResponse.json({ ok: true, confirmed });
      }
      if (users.length < perPage) break;
    }

    return NextResponse.json({ ok: true, confirmed: false });
  } catch {
    return NextResponse.json({ ok: true, confirmed: false });
  }
}

