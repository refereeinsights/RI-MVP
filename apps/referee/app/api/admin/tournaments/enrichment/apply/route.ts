import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { revalidatePath } from "next/cache";
import { buildVenueAddressFingerprint, buildVenueNameCityStateFingerprint } from "@/lib/identity/fingerprints";

type Item = {
  kind: "contact" | "venue" | "date" | "comp-rate" | "comp-hotel" | "comp-cash" | "attribute";
  id: string;
};

function cleanText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function normalizeLower(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeAddressForBlocklist(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBlockedOrganizerAddress(value: unknown) {
  const normalized = normalizeAddressForBlocklist(value);
  if (!normalized) return false;
  // Organizer mailing address that sometimes gets misclassified as a venue.
  return normalized.includes("1529") && (normalized.includes("3rd") || normalized.includes("third")) && normalized.includes("32250");
}

function parseFullAddress(addr: string): { address: string; city: string; state: string; zip: string | null } | null {
  const raw = String(addr ?? "").trim();
  if (!raw) return null;
  const normalized = raw.replace(/\s+/g, " ").trim();
  // Common variants we see from scrapers:
  // - "701 Pioneer Way Ave, Centralia, WA, 98531"
  // - "701 Pioneer Way Ave, Centralia, WA 98531"
  // - "1 Valley Park Drive, Hurricane, WV, 25526, WV" (duplicate trailing state)
  const m = normalized.match(
    /^(.+?),\s*([A-Za-z.\s]{2,60}),\s*([A-Z]{2})(?:\s*,?\s*(\d{5}(?:-\d{4})?))?(?:\s*,?\s*([A-Z]{2}))?\s*$/
  );
  if (!m) return null;
  const address = String(m[1] ?? "").trim();
  const city = String(m[2] ?? "").trim();
  const state = String(m[3] ?? "").trim().toUpperCase();
  const zip = m[4] ? String(m[4]).trim() : null;
  const trailingState = m[5] ? String(m[5]).trim().toUpperCase() : null;
  if (trailingState && trailingState !== state) {
    // If the last token is a different state, parsing is unreliable; bail.
    return null;
  }
  if (!address || !city || !state) return null;
  return { address, city, state, zip };
}

async function getOrCreateVenueFromCandidate(args: {
  tournament_id: string;
  tournament_city: string | null;
  tournament_state: string | null;
  tournament_zip: string | null;
  tournament_sport: string | null;
  venue_name: string | null;
  address_text: string | null;
  venue_url: string | null;
}) {
  const venueName = cleanText(args.venue_name);
  const addressText = cleanText(args.address_text);
  if (!addressText) {
    // Avoid creating "venue shell" rows from URLs alone. If we can't produce a real address,
    // keep this as unresolved evidence rather than polluting venues.
    throw new Error("venue_missing_address");
  }
  if (isBlockedOrganizerAddress(addressText)) {
    throw new Error("blocked_organizer_address");
  }
  const parsed = addressText ? parseFullAddress(addressText) : null;
  const streetAddress = cleanText(parsed?.address ?? addressText);
  const venueNameForInsert = venueName ?? `Venue (${streetAddress ?? addressText.slice(0, 80)})`;

  const city = cleanText(parsed?.city ?? args.tournament_city);
  const state = cleanText(parsed?.state ?? args.tournament_state)?.toUpperCase() ?? null;
  const zip = cleanText(parsed?.zip ?? args.tournament_zip);
  const sport = cleanText(args.tournament_sport);

  const address_fingerprint = buildVenueAddressFingerprint({
    address: streetAddress,
    city,
    state,
  });
  const name_city_state_fingerprint = buildVenueNameCityStateFingerprint({
    name: venueName,
    city,
    state,
  });

  // Prefer address-fingerprint de-dupe when possible.
  if (address_fingerprint) {
    const { data: hits, error } = await supabaseAdmin
      .from("venues" as any)
      .select("id,name,address,city,state,venue_url,address_fingerprint,name_city_state_fingerprint")
      .eq("address_fingerprint", address_fingerprint)
      .limit(10);
    if (error) throw error;
    const rows = (hits ?? []) as any[];
    if (rows.length) {
      let pick = rows[0] as any;
      if (name_city_state_fingerprint) {
        const exact = rows.find((r) => String(r.name_city_state_fingerprint ?? "") === name_city_state_fingerprint);
        if (exact) pick = exact;
      }
      const candidateUrl = cleanText(args.venue_url);
      const patch: Record<string, unknown> = {};
      if (candidateUrl && !cleanText(pick?.venue_url)) {
        patch.venue_url = candidateUrl;
      }
      // Upgrade incomplete address rows when we have a full parsed address (prevents duplicates).
      if (streetAddress && parsed?.address) {
        const existingAddr = cleanText(pick?.address) ?? "";
        const existingHasZip = /\b\d{5}(?:-\d{4})?\b/.test(existingAddr);
        const candidateHasZip = Boolean(parsed.zip);
        const existingHasCity = city ? normalizeLower(existingAddr).includes(normalizeLower(city)) : false;
        const candidateLooksFull = candidateHasZip || existingHasCity;
        if (candidateLooksFull && (!existingHasZip || existingAddr.length < streetAddress.length)) {
          patch.address = streetAddress;
        }
      }
      if (zip && !cleanText(pick?.zip)) patch.zip = zip;
      if (venueName && !cleanText(pick?.name)) patch.name = venueName;
      if (Object.keys(patch).length) {
        const { error: updErr } = await supabaseAdmin.from("venues" as any).update(patch).eq("id", pick.id);
        if (updErr) throw updErr;
      }
      return { id: String(pick.id), venue_url: pick?.venue_url ?? null };
    }
  }

  // Secondary: name+city+state fingerprint.
  if (name_city_state_fingerprint) {
    const { data: hits, error } = await supabaseAdmin
      .from("venues" as any)
      .select("id,venue_url")
      .eq("name_city_state_fingerprint", name_city_state_fingerprint)
      .limit(5);
    if (error) throw error;
    const pick = (hits ?? [])[0] as any;
    if (pick?.id) {
      const candidateUrl = cleanText(args.venue_url);
      if (candidateUrl && !cleanText(pick?.venue_url)) {
        const { error: updErr } = await supabaseAdmin.from("venues" as any).update({ venue_url: candidateUrl }).eq("id", pick.id);
        if (updErr) throw updErr;
      }
      return { id: String(pick.id), venue_url: pick?.venue_url ?? null };
    }
  }

  // Fallback: upsert using the exact unique key (if present in DB).
  const payload = {
    name: venueNameForInsert,
    address: streetAddress,
    city,
    state,
    zip,
    sport,
    venue_url: cleanText(args.venue_url),
  };

  const { data: upsertedRaw, error: upsertErr } = await supabaseAdmin
    .from("venues" as any)
    .upsert(payload, { onConflict: "name,address,city,state" })
    .select("id,venue_url")
    .maybeSingle();
  if (upsertErr) {
    // If the unique constraint isn't present (or any other schema issue), don't silently fail.
    throw upsertErr;
  }
  const upserted = upsertedRaw as any;
  if (!upserted?.id) {
    throw new Error("venue_upsert_failed");
  }
  return { id: String(upserted.id), venue_url: upserted.venue_url ?? null };
}

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
  let attributeAddress: string | null = null;
  let attributeVenueUrl: string | null = null;
  let didLinkVenue = false;
  let linkedVenuesBefore: number | null = null;
  let linkedVenuesAfter: number | null = null;
  let countsTowardMissingVenuesDashboard: boolean | null = null;

  try {
    const [{ count: linkCount }, { data: tRow }] = await Promise.all([
      supabaseAdmin
        .from("tournament_venues" as any)
        .select("tournament_id", { count: "exact", head: true })
        .eq("tournament_id", tournamentId),
      supabaseAdmin.from("tournaments" as any).select("status,is_canonical").eq("id", tournamentId).maybeSingle(),
    ]);
    linkedVenuesBefore = typeof linkCount === "number" ? linkCount : null;
    const status = String((tRow as any)?.status ?? "").trim();
    const isCanonical = Boolean((tRow as any)?.is_canonical);
    countsTowardMissingVenuesDashboard = status === "published" && isCanonical;
  } catch {
    linkedVenuesBefore = null;
    countsTowardMissingVenuesDashboard = null;
  }

  if (venueIds.length) {
    const { data: venues } = await supabaseAdmin
      .from("tournament_venue_candidates" as any)
      .select("id,tournament_id,venue_name,address_text,venue_url")
      .in("id", venueIds)
      .eq("tournament_id", tournamentId);
    const selectedVenueRows = (venues ?? []) as any[];
    const firstVenue = selectedVenueRows[0] as any;
    if (firstVenue?.venue_name) updates.venue = firstVenue.venue_name;
    if (firstVenue?.address_text && !isBlockedOrganizerAddress(firstVenue.address_text)) updates.address = firstVenue.address_text;
    // Only persist venue_url when we have a real address-backed venue.
    if (firstVenue?.venue_url && firstVenue?.address_text) updates.venue_url = firstVenue.venue_url;

    if (selectedVenueRows.length) {
      const { data: tournamentRowRaw } = await supabaseAdmin
        .from("tournaments" as any)
        .select("city,state,zip,sport")
        .eq("id", tournamentId)
        .maybeSingle();
      const tournamentRow = tournamentRowRaw as any;

      for (const venue of selectedVenueRows) {
        if (!venue?.venue_name && !venue?.address_text && !venue?.venue_url) continue;
        if (!cleanText(venue?.address_text)) {
          // Never create/link venues from URL-only candidates.
          continue;
        }
        if (isBlockedOrganizerAddress(venue?.address_text)) {
          return NextResponse.json({ error: "blocked_organizer_address" }, { status: 400 });
        }
        const upserted = await getOrCreateVenueFromCandidate({
          tournament_id: tournamentId,
          tournament_city: cleanText(tournamentRow?.city),
          tournament_state: cleanText(tournamentRow?.state),
          tournament_zip: cleanText(tournamentRow?.zip),
          tournament_sport: cleanText(tournamentRow?.sport),
          venue_name: cleanText(venue?.venue_name),
          address_text: cleanText(venue?.address_text),
          venue_url: cleanText(venue?.venue_url),
        });
        const { error: linkErr } = await supabaseAdmin
          .from("tournament_venues" as any)
          .upsert(
            { tournament_id: tournamentId, venue_id: upserted.id },
            { onConflict: "tournament_id,venue_id" }
          );
        if (linkErr) throw linkErr;
        didLinkVenue = true;
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
      updates.ref_cash_tournament = true;
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
      if (key === "team_fee") {
        const text = String(value ?? "").trim();
        if (text) updates.team_fee = text;
      } else if (key === "level" || key === "age_group") {
        const text = cleanText(value);
        if (text) updates.level = text;
      } else if (key === "games_guaranteed") {
        const num = parseInt(String(value).replace(/[^0-9]/g, ""), 10);
        if (Number.isFinite(num)) updates.games_guaranteed = num;
      } else if (key === "player_parking") {
        const text = cleanText(value);
        if (text) updates.player_parking = text;
      } else if (key === "address") {
        const text = cleanText(value);
        if (text) {
          updates.address = text;
          attributeAddress = text;
        }
      } else if (key === "venue_url") {
        const text = cleanText(value);
        // Only ingest venue URLs when they are tied to a real address/venue row.
        // A URL by itself is not a venue.
        if (text) attributeVenueUrl = text;
      }
    }
  }

  // If fees/venue attribute enrichment provided address/url, create or link a canonical venue row.
  if (attributeAddress) {
    const { data: tournamentRaw } = await supabaseAdmin
      .from("tournaments" as any)
      .select("name,venue,address,city,state,zip,sport")
      .eq("id", tournamentId)
      .maybeSingle();
    const tournament = tournamentRaw as any;
    const tournamentName = cleanText(tournament?.name);
    const venueName = cleanText(updates.venue ?? tournament?.venue) ?? `${tournamentName ?? "Tournament"} Venue`;
    const venueAddress = cleanText(attributeAddress ?? updates.address ?? tournament?.address);
    const city = cleanText(tournament?.city);
    const state = cleanText(tournament?.state);
    const zip = cleanText(tournament?.zip);
    const sport = cleanText(tournament?.sport);

    if (venueName && venueAddress) {
      const upserted = await getOrCreateVenueFromCandidate({
        tournament_id: tournamentId,
        tournament_city: city,
        tournament_state: state,
        tournament_zip: zip,
        tournament_sport: sport,
        venue_name: venueName,
        address_text: venueAddress,
        venue_url: attributeVenueUrl,
      });
      const { error: linkErr } = await supabaseAdmin
        .from("tournament_venues" as any)
        .upsert({ tournament_id: tournamentId, venue_id: upserted.id }, { onConflict: "tournament_id,venue_id" });
      if (linkErr) throw linkErr;
      didLinkVenue = true;
      // Now that the venue is resolvable, allow storing the URL as a convenience inline field.
      if (attributeVenueUrl) updates.venue_url = attributeVenueUrl;
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

  if (didLinkVenue) {
    try {
      const { count: linkCount } = await supabaseAdmin
        .from("tournament_venues" as any)
        .select("tournament_id", { count: "exact", head: true })
        .eq("tournament_id", tournamentId);
      linkedVenuesAfter = typeof linkCount === "number" ? linkCount : null;
    } catch {
      linkedVenuesAfter = null;
    }
    revalidatePath("/admin");
    revalidatePath("/admin/tournaments/missing-venues");
  }

  return NextResponse.json({
    ok: true,
    updated_fields: Object.keys(updates),
    did_link_venue: didLinkVenue,
    linked_venues_before: linkedVenuesBefore,
    linked_venues_after: linkedVenuesAfter,
    counts_toward_missing_venues_dashboard: countsTowardMissingVenuesDashboard,
    applied: {
      contacts: contactIds.length,
      venues: venueIds.length,
      dates: dateIds.length,
      comp: compIds.length,
    },
  });
}
