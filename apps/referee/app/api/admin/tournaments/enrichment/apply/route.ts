import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Item = {
  kind: "contact" | "venue" | "date" | "comp-rate" | "comp-hotel" | "comp-cash" | "attribute";
  id: string;
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

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const tournamentId = String(body?.tournament_id ?? "").trim();
  const items: Item[] = Array.isArray(body?.items) ? body.items : [];
  if (!tournamentId || !items.length) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const contactIds = items.filter((i) => i.kind === "contact").map((i) => i.id);
  const venueIds = items.filter((i) => i.kind === "venue").map((i) => i.id);
  const dateIds = items.filter((i) => i.kind === "date").map((i) => i.id);
  const compIds = items
    .filter((i) => i.kind === "comp-rate" || i.kind === "comp-hotel" || i.kind === "comp-cash")
    .map((i) => i.id);
  const attributeIds = items.filter((i) => i.kind === "attribute").map((i) => i.id);

  const updates: Record<string, any> = {};
  const now = new Date().toISOString();

  if (venueIds.length) {
    const { data: venues } = await supabaseAdmin
      .from("tournament_venue_candidates" as any)
      .select("id,tournament_id,venue_name,address_text")
      .in("id", venueIds)
      .eq("tournament_id", tournamentId);
    const venue = ((venues ?? []) as any[])[0] as any;
    if (venue?.venue_name) updates.venue = venue.venue_name;
    if (venue?.address_text) updates.address = venue.address_text;
    if (venue?.venue_name || venue?.address_text) {
      const { data: tournamentRowRaw } = await supabaseAdmin
        .from("tournaments" as any)
        .select("city,state,sport")
        .eq("id", tournamentId)
        .maybeSingle();
      const tournamentRow = tournamentRowRaw as any;
      const { data: upsertedRaw, error: upsertErr } = await supabaseAdmin
        .from("venues" as any)
        .upsert(
          {
            name: venue?.venue_name ?? null,
            address: venue?.address_text ?? null,
            city: tournamentRow?.city ?? null,
            state: tournamentRow?.state ?? null,
            sport: tournamentRow?.sport ?? null,
          },
          { onConflict: "name,address,city,state" }
        )
        .select("id")
        .maybeSingle();
      const upserted = upsertedRaw as any;
      if (!upsertErr && upserted?.id) {
        await supabaseAdmin
          .from("tournament_venues" as any)
          .upsert(
            { tournament_id: tournamentId, venue_id: upserted.id },
            { onConflict: "tournament_id,venue_id" }
          );
      }
    }
  }

  if (dateIds.length) {
    const { data: dates } = await supabaseAdmin
      .from("tournament_date_candidates" as any)
      .select("id,tournament_id,start_date,end_date")
      .in("id", dateIds)
      .eq("tournament_id", tournamentId);
    const date = ((dates ?? []) as any[])[0] as any;
    if (date?.start_date) updates.start_date = date.start_date;
    if (date?.end_date) updates.end_date = date.end_date;
  }

  if (compIds.length) {
    const { data: comps } = await supabaseAdmin
      .from("tournament_referee_comp_candidates" as any)
      .select("id,tournament_id,rate_text,travel_lodging")
      .in("id", compIds)
      .eq("tournament_id", tournamentId);
    const comp = ((comps ?? []) as any[])[0] as any;
    if (items.some((i) => i.kind === "comp-rate") && comp?.rate_text) {
      updates.referee_pay = comp.rate_text;
    }
    if (items.some((i) => i.kind === "comp-hotel") && comp?.travel_lodging) {
      updates.travel_lodging = comp.travel_lodging;
    }
    if (items.some((i) => i.kind === "comp-cash")) {
      updates.cash_tournament = true;
    }
  }

  if (attributeIds.length) {
    const { data: attributes } = await supabaseAdmin
      .from("tournament_attribute_candidates" as any)
      .select("id,tournament_id,attribute_key,attribute_value,confidence")
      .in("id", attributeIds)
      .eq("tournament_id", tournamentId);
    const bestByKey = new Map<string, any>();
    (attributes ?? []).forEach((a: any) => {
      const existing = bestByKey.get(a.attribute_key);
      if (!existing || (a.confidence ?? 0) > (existing.confidence ?? 0)) {
        bestByKey.set(a.attribute_key, a);
      }
    });
    for (const [key, candidate] of bestByKey.entries()) {
      const value = candidate.attribute_value;
      if (key === "cash_at_field") {
        updates.cash_at_field = value === "yes";
        if (value === "yes") updates.cash_tournament = true;
      } else if (key === "referee_food") updates.referee_food = value;
      else if (key === "facilities") updates.facilities = value;
      else if (key === "referee_tents") updates.referee_tents = value;
      else if (key === "travel_lodging") updates.travel_lodging = value;
      else if (key === "ref_game_schedule") updates.ref_game_schedule = value;
      else if (key === "ref_parking") updates.ref_parking = value;
      else if (key === "ref_parking_cost") updates.ref_parking_cost = value;
      else if (key === "mentors") updates.mentors = value;
      else if (key === "assigned_appropriately") updates.assigned_appropriately = value;
    }
  }

  if (contactIds.length) {
    const { data: contacts } = await supabaseAdmin
      .from("tournament_contact_candidates" as any)
      .select("id,tournament_id,role_normalized,name,email,phone,source_url,confidence")
      .in("id", contactIds)
      .eq("tournament_id", tournamentId);
    const existingResp = await supabaseAdmin
      .from("tournament_contacts" as any)
      .select("type,name,email,phone")
      .eq("tournament_id", tournamentId);
    const existing = (existingResp.data ?? []) as Array<{
      type: string | null;
      name: string | null;
      email: string | null;
      phone: string | null;
    }>;
    const toInsert: any[] = [];
    const normalizeEmail = (val: string | null) => (val ?? "").trim().toLowerCase();
    const normalizePhone = (val: string | null) => (val ?? "").replace(/\D+/g, "");
    const normalizeName = (val: string | null) => (val ?? "").trim().toLowerCase();
    const normalizeRole = (val: string | null) => (val ?? "GENERAL").trim().toUpperCase();

    const selectedRows = (contacts ?? []) as any[];
    const selectedSig = new Set(
      selectedRows.map((c) =>
        [
          normalizeRole(c.role_normalized ?? null),
          normalizeName(c.name),
          normalizeEmail(c.email),
          normalizePhone(c.phone),
        ].join("|")
      )
    );

    for (const c of selectedRows) {
      const role = c.role_normalized === "TD" ? "director" : c.role_normalized === "ASSIGNOR" ? "assignor" : "general";
      const exists = existing.some(
        (e) =>
          e.type === role &&
          (e.name ?? "") === (c.name ?? "") &&
          (e.email ?? "") === (c.email ?? "") &&
          (e.phone ?? "") === ""
      );
      const confRaw = c.confidence ?? null;
      const confVal =
        confRaw == null
          ? null
          : Number.isFinite(confRaw)
            ? confRaw <= 1
              ? Math.round(confRaw * 100)
              : Math.round(confRaw)
            : null;
      if (!exists) {
        toInsert.push({
          tournament_id: tournamentId,
          type: role,
          name: c.name ?? null,
          email: c.email ?? null,
          phone: null,
          source_url: c.source_url ?? null,
          confidence: confVal,
          status: "verified",
        });
      }

      if (c.role_normalized === "TD") {
        if (c.name) updates.tournament_director = c.name;
        if (c.email) updates.tournament_director_email = c.email;
      }
      if (c.role_normalized === "ASSIGNOR") {
        if (c.name) updates.referee_contact = c.name;
        if (c.email) updates.referee_contact_email = c.email;
      }
    }
    if (toInsert.length) {
      const { error } = await supabaseAdmin.from("tournament_contacts" as any).insert(toInsert);
      if (error) throw error;
    }
    const { data: allCandidates } = await supabaseAdmin
      .from("tournament_contact_candidates" as any)
      .select("id,role_normalized,name,email,phone")
      .eq("tournament_id", tournamentId)
      .is("accepted_at", null)
      .is("rejected_at", null);
    const dupContactIds = (allCandidates ?? [])
      .filter((c: any) =>
        selectedSig.has(
          [
            normalizeRole(c.role_normalized ?? null),
            normalizeName(c.name),
            normalizeEmail(c.email),
            normalizePhone(c.phone),
          ].join("|")
        )
      )
      .map((c: any) => c.id);
    if (dupContactIds.length) {
      await supabaseAdmin
        .from("tournament_contact_candidates" as any)
        .update({ accepted_at: now, rejected_at: null })
        .in("id", dupContactIds);
    }
  }

  if (Object.keys(updates).length) {
    const { error } = await supabaseAdmin
      .from("tournaments" as any)
      .update({ ...updates, updated_at: now })
      .eq("id", tournamentId);
    if (error) throw error;
  }

  if (venueIds.length) {
    const { data: venues } = await supabaseAdmin
      .from("tournament_venue_candidates" as any)
      .select("id,venue_name,address_text")
      .in("id", venueIds)
      .eq("tournament_id", tournamentId);
    const normalizeVenue = (val: string | null) => (val ?? "").trim().toLowerCase();
    const selectedSig = new Set(
      ((venues ?? []) as any[]).map((v) => [normalizeVenue(v.venue_name), normalizeVenue(v.address_text)].join("|"))
    );
    const { data: allVenues } = await supabaseAdmin
      .from("tournament_venue_candidates" as any)
      .select("id,venue_name,address_text")
      .eq("tournament_id", tournamentId)
      .is("accepted_at", null)
      .is("rejected_at", null);
    const dupVenueIds = (allVenues ?? [])
      .filter((v: any) => selectedSig.has([normalizeVenue(v.venue_name), normalizeVenue(v.address_text)].join("|")))
      .map((v: any) => v.id);
    if (dupVenueIds.length) {
      await supabaseAdmin
        .from("tournament_venue_candidates" as any)
        .update({ accepted_at: now, rejected_at: null })
        .in("id", dupVenueIds);
    }
  }

  if (attributeIds.length) {
    const { data: attrs } = await supabaseAdmin
      .from("tournament_attribute_candidates" as any)
      .select("id,attribute_key,attribute_value")
      .in("id", attributeIds)
      .eq("tournament_id", tournamentId);
    const normalize = (val: string | null) => (val ?? "").trim().toLowerCase();
    const selectedSig = new Set(
      ((attrs ?? []) as any[]).map((a) =>
        [normalize(a.attribute_key), normalize(a.attribute_value)].join("|")
      )
    );
    const { data: allAttrs } = await supabaseAdmin
      .from("tournament_attribute_candidates" as any)
      .select("id,attribute_key,attribute_value")
      .eq("tournament_id", tournamentId)
      .is("accepted_at", null)
      .is("rejected_at", null);
    const dupAttrIds = (allAttrs ?? [])
      .filter((a: any) =>
        selectedSig.has([normalize(a.attribute_key), normalize(a.attribute_value)].join("|"))
      )
      .map((a: any) => a.id);
    if (dupAttrIds.length) {
      await supabaseAdmin
        .from("tournament_attribute_candidates" as any)
        .update({ accepted_at: now, rejected_at: null })
        .in("id", dupAttrIds);
    }
  }
  if (dateIds.length) {
    const { data: dates } = await supabaseAdmin
      .from("tournament_date_candidates" as any)
      .select("id,date_text,start_date,end_date")
      .in("id", dateIds)
      .eq("tournament_id", tournamentId);
    const normalizeDate = (val: string | null) => (val ?? "").trim().toLowerCase();
    const selectedSig = new Set(
      ((dates ?? []) as any[]).map((d) =>
        [normalizeDate(d.date_text), d.start_date ?? "", d.end_date ?? ""].join("|")
      )
    );
    const { data: allDates } = await supabaseAdmin
      .from("tournament_date_candidates" as any)
      .select("id,date_text,start_date,end_date")
      .eq("tournament_id", tournamentId)
      .is("accepted_at", null)
      .is("rejected_at", null);
    const dupDateIds = (allDates ?? [])
      .filter((d: any) => selectedSig.has([normalizeDate(d.date_text), d.start_date ?? "", d.end_date ?? ""].join("|")))
      .map((d: any) => d.id);
    if (dupDateIds.length) {
      await supabaseAdmin
        .from("tournament_date_candidates" as any)
        .update({ accepted_at: now, rejected_at: null })
        .in("id", dupDateIds);
    }
  }
  if (compIds.length) {
    const { data: comps } = await supabaseAdmin
      .from("tournament_referee_comp_candidates" as any)
      .select("id,rate_text,travel_lodging")
      .in("id", compIds)
      .eq("tournament_id", tournamentId);
    const normalizeComp = (val: string | null) => (val ?? "").trim().toLowerCase();
    const selectedSig = new Set(
      ((comps ?? []) as any[]).map((c) =>
        [normalizeComp(c.rate_text), normalizeComp(c.travel_lodging)].join("|")
      )
    );
    const { data: allComps } = await supabaseAdmin
      .from("tournament_referee_comp_candidates" as any)
      .select("id,rate_text,travel_lodging")
      .eq("tournament_id", tournamentId)
      .is("accepted_at", null)
      .is("rejected_at", null);
    const dupCompIds = (allComps ?? [])
      .filter((c: any) => selectedSig.has([normalizeComp(c.rate_text), normalizeComp(c.travel_lodging)].join("|")))
      .map((c: any) => c.id);
    if (dupCompIds.length) {
      await supabaseAdmin
        .from("tournament_referee_comp_candidates" as any)
        .update({ accepted_at: now, rejected_at: null })
        .in("id", dupCompIds);
    }
  }

  return NextResponse.json({
    ok: true,
    updated_fields: Object.keys(updates),
    applied: {
      contacts: contactIds.length,
      venues: venueIds.length,
      dates: dateIds.length,
      comp: compIds.length,
    },
  });
}
