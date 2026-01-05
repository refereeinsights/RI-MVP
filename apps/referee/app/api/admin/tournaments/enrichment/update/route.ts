import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Payload = {
  type: "contact" | "venue" | "comp";
  id: string;
  action: "accept" | "reject" | "delete";
};

const TABLES: Record<Payload["type"], string> = {
  contact: "tournament_contact_candidates",
  venue: "tournament_venue_candidates",
  comp: "tournament_referee_comp_candidates",
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Payload;
    if (!body?.id || !TABLES[body.type]) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const table = TABLES[body.type];
    if (body.action === "delete") {
      const { error } = await supabaseAdmin.from(table as any).delete().eq("id", body.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    const patch =
      body.action === "accept"
        ? { accepted_at: new Date().toISOString(), rejected_at: null }
        : { rejected_at: new Date().toISOString(), accepted_at: null };
    const { error } = await supabaseAdmin.from(table as any).update(patch).eq("id", body.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "unknown_error" }, { status: 500 });
  }
}
