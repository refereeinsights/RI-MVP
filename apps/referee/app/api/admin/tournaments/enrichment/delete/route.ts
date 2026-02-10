import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Item = {
  kind: "contact" | "venue" | "date" | "comp-rate" | "comp-hotel" | "comp-cash";
  id: string;
};

const TABLES: Record<Item["kind"], string> = {
  contact: "tournament_contact_candidates",
  venue: "tournament_venue_candidates",
  date: "tournament_date_candidates",
  "comp-rate": "tournament_referee_comp_candidates",
  "comp-hotel": "tournament_referee_comp_candidates",
  "comp-cash": "tournament_referee_comp_candidates",
};

async function ensureAdmin() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin") return null;
  return data.user;
}

export async function POST(request: Request) {
  const admin = await ensureAdmin();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { items?: Item[]; kind?: Item["kind"]; id?: string };
  try {
    body = (await request.json()) as { items?: Item[]; kind?: Item["kind"]; id?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : body.kind && body.id ? [{ kind: body.kind, id: body.id }] : [];
  if (!items.length) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  for (const item of items) {
    if (!item.id || !TABLES[item.kind]) {
      return NextResponse.json({ error: "invalid_item" }, { status: 400 });
    }
    if (item.kind === "contact") {
      const { data: row } = await supabaseAdmin
        .from("tournament_contact_candidates" as any)
        .select("tournament_id,role_normalized,name,email,phone")
        .eq("id", item.id)
        .maybeSingle();
      if (row) {
        const r = row as any;
        const normalizeEmail = (val: string | null) => (val ?? "").trim().toLowerCase();
        const normalizePhone = (val: string | null) => (val ?? "").replace(/\D+/g, "");
        const normalizeName = (val: string | null) => (val ?? "").trim().toLowerCase();
        const sig = [
          r.role_normalized ?? "",
          normalizeName(r.name),
          normalizeEmail(r.email),
          normalizePhone(r.phone),
        ].join("|");
        const { data: allRows } = await supabaseAdmin
          .from("tournament_contact_candidates" as any)
          .select("id,role_normalized,name,email,phone")
          .eq("tournament_id", r.tournament_id ?? null);
        const ids = (allRows ?? [])
          .filter((c: any) =>
            sig ===
            [
              c.role_normalized ?? "",
              normalizeName(c.name),
              normalizeEmail(c.email),
              normalizePhone(c.phone),
            ].join("|")
          )
          .map((c: any) => c.id);
        const { error } = await supabaseAdmin
          .from("tournament_contact_candidates" as any)
          .delete()
          .in("id", ids.length ? ids : [item.id]);
        if (error) return NextResponse.json({ error: error.message ?? "delete_failed" }, { status: 500 });
        continue;
      }
    }
    if (item.kind === "venue") {
      const { data: row } = await supabaseAdmin
        .from("tournament_venue_candidates" as any)
        .select("tournament_id,venue_name,address_text")
        .eq("id", item.id)
        .maybeSingle();
      if (row) {
        const r = row as any;
        const norm = (val: string | null) => (val ?? "").trim().toLowerCase();
        const sig = [norm(r.venue_name), norm(r.address_text)].join("|");
        const { data: allRows } = await supabaseAdmin
          .from("tournament_venue_candidates" as any)
          .select("id,venue_name,address_text")
          .eq("tournament_id", r.tournament_id ?? null);
        const ids = (allRows ?? [])
          .filter((v: any) => sig === [norm(v.venue_name), norm(v.address_text)].join("|"))
          .map((v: any) => v.id);
        const { error } = await supabaseAdmin
          .from("tournament_venue_candidates" as any)
          .delete()
          .in("id", ids.length ? ids : [item.id]);
        if (error) return NextResponse.json({ error: error.message ?? "delete_failed" }, { status: 500 });
        continue;
      }
    }
    if (item.kind === "date") {
      const { data: row } = await supabaseAdmin
        .from("tournament_date_candidates" as any)
        .select("tournament_id,date_text,start_date,end_date")
        .eq("id", item.id)
        .maybeSingle();
      if (row) {
        const r = row as any;
        const norm = (val: string | null) => (val ?? "").trim().toLowerCase();
        const sig = [norm(r.date_text), r.start_date ?? "", r.end_date ?? ""].join("|");
        const { data: allRows } = await supabaseAdmin
          .from("tournament_date_candidates" as any)
          .select("id,date_text,start_date,end_date")
          .eq("tournament_id", r.tournament_id ?? null);
        const ids = (allRows ?? [])
          .filter((d: any) => sig === [norm(d.date_text), d.start_date ?? "", d.end_date ?? ""].join("|"))
          .map((d: any) => d.id);
        const { error } = await supabaseAdmin
          .from("tournament_date_candidates" as any)
          .delete()
          .in("id", ids.length ? ids : [item.id]);
        if (error) return NextResponse.json({ error: error.message ?? "delete_failed" }, { status: 500 });
        continue;
      }
    }
    if (item.kind === "comp-rate" || item.kind === "comp-hotel" || item.kind === "comp-cash") {
      const { data: row } = await supabaseAdmin
        .from("tournament_referee_comp_candidates" as any)
        .select("tournament_id,rate_text,travel_housing_text")
        .eq("id", item.id)
        .maybeSingle();
      if (row) {
        const r = row as any;
        const norm = (val: string | null) => (val ?? "").trim().toLowerCase();
        const sig = [norm(r.rate_text), norm(r.travel_housing_text)].join("|");
        const { data: allRows } = await supabaseAdmin
          .from("tournament_referee_comp_candidates" as any)
          .select("id,rate_text,travel_housing_text")
          .eq("tournament_id", r.tournament_id ?? null);
        const ids = (allRows ?? [])
          .filter((c: any) => sig === [norm(c.rate_text), norm(c.travel_housing_text)].join("|"))
          .map((c: any) => c.id);
        const { error } = await supabaseAdmin
          .from("tournament_referee_comp_candidates" as any)
          .delete()
          .in("id", ids.length ? ids : [item.id]);
        if (error) return NextResponse.json({ error: error.message ?? "delete_failed" }, { status: 500 });
        continue;
      }
    }
    const { error } = await supabaseAdmin.from(TABLES[item.kind] as any).delete().eq("id", item.id);
    if (error) {
      return NextResponse.json({ error: error.message ?? "delete_failed" }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true, deleted: items.length });
}
