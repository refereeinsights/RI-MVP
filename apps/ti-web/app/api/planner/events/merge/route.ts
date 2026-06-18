import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { isUuid } from "@/lib/venues/isUuid";
import { getTiTierServer } from "@/lib/entitlementsServer";

export const runtime = "nodejs";

type MergeBody = {
  primary_event_id?: unknown;
  merge_event_ids?: unknown;
  field_winners?: unknown;
};

type FieldWinners = {
  title?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
  timezone?: unknown;
  address_text?: unknown;
  city?: unknown;
  state?: unknown;
  team_name?: unknown;
  opponent_name?: unknown;
  venue_id?: unknown;
  tournament_id?: unknown;
  field_label?: unknown;
  notes?: unknown;
};

function asTrimmedString(value: unknown) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v || null;
}

function asNullableTrimmedString(value: unknown) {
  if (value === null) return null;
  return asTrimmedString(value);
}

function isIsoDateTime(value: string) {
  const d = new Date(value);
  return Number.isFinite(d.getTime());
}

function normalizeTimeZone(value: string | null) {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  if (v.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: v }).format(new Date());
    return v;
  } catch {
    return null;
  }
}

function normalizeState(value: string | null) {
  if (!value) return null;
  const v = value.trim().toUpperCase();
  if (!v) return null;
  return /^[A-Z]{2}$/.test(v) ? v : null;
}

function clamp(value: string | null, maxLen: number) {
  if (!value) return null;
  return value.length > maxLen ? value.slice(0, maxLen) : value;
}

function uniqueNonEmptyStrings(values: Array<string | null | undefined>) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const tierInfo = await getTiTierServer(user);
  if (tierInfo.unverified || tierInfo.tier === "explorer") {
    if (tierInfo.unverified) {
      return NextResponse.json({ ok: false, error: "email_verification_required" }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as MergeBody | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });

  const primaryId = asTrimmedString(body.primary_event_id);
  const mergeIdsRaw = Array.isArray(body.merge_event_ids) ? body.merge_event_ids : null;
  if (!primaryId || !mergeIdsRaw) return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  if (!isUuid(primaryId)) return NextResponse.json({ ok: false, error: "invalid_primary_event_id" }, { status: 400 });

  const mergeIds = mergeIdsRaw
    .map((v) => asTrimmedString(v))
    .filter((v): v is string => Boolean(v));
  if (!mergeIds.length) return NextResponse.json({ ok: false, error: "missing_merge_event_ids" }, { status: 400 });
  if (mergeIds.some((id) => !isUuid(id))) return NextResponse.json({ ok: false, error: "invalid_merge_event_ids" }, { status: 400 });
  if (mergeIds.includes(primaryId)) return NextResponse.json({ ok: false, error: "invalid_merge_pair" }, { status: 400 });

  const allIds = Array.from(new Set([primaryId, ...mergeIds]));
  const maxTotal = 5;
  if (allIds.length > maxTotal) return NextResponse.json({ ok: false, error: "too_many_events" }, { status: 400 });

  const { data: rows, error: fetchError } = await (supabase.from("planner_events" as any) as any)
    .select(
      "id,user_id,weekend_id,title,event_type,team_name,opponent_name,tournament_id,venue_id,field_label,address_text,city,state,starts_at,ends_at,timezone,notes,source_type,source_id,source_event_uid"
    )
    .in("id", allIds)
    .eq("user_id", user.id)
    .limit(allIds.length);

  if (fetchError) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  if (!rows || rows.length !== allIds.length) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const primary = (rows as any[]).find((r) => String(r?.id) === primaryId);
  if (!primary) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const others = (rows as any[]).filter((r) => String(r?.id) !== primaryId);
  const involved = [primary, ...others];

  const winners = (typeof body.field_winners === "object" && body.field_winners ? (body.field_winners as FieldWinners) : null) ?? null;

  const warnings: Array<{ field?: string; message: string }> = [];

  const winnerTitle = winners ? asTrimmedString(winners.title) : null;
  const winnerStartsAt = winners ? asTrimmedString(winners.starts_at) : null;
  const winnerEndsAt = winners ? asNullableTrimmedString(winners.ends_at) : undefined;
  const winnerTimezone = winners ? asNullableTrimmedString(winners.timezone) : undefined;
  const winnerAddress = winners ? asNullableTrimmedString(winners.address_text) : undefined;
  const winnerCity = winners ? asNullableTrimmedString(winners.city) : undefined;
  const winnerState = winners ? asNullableTrimmedString(winners.state) : undefined;
  const winnerTeam = winners ? asNullableTrimmedString(winners.team_name) : undefined;
  const winnerOpponent = winners ? asNullableTrimmedString(winners.opponent_name) : undefined;
  const winnerVenueId = winners ? asNullableTrimmedString(winners.venue_id) : undefined;
  const winnerTournamentId = winners ? asNullableTrimmedString(winners.tournament_id) : undefined;
  const winnerFieldLabel = winners ? asNullableTrimmedString(winners.field_label) : undefined;
  const winnerNotes = winners ? asNullableTrimmedString(winners.notes) : undefined;

  const title = clamp(winnerTitle ?? asTrimmedString(primary.title) ?? "Merged event", 140)!;

  const startsAtRaw = winnerStartsAt ?? asTrimmedString(primary.starts_at);
  if (!startsAtRaw || !isIsoDateTime(startsAtRaw)) {
    return NextResponse.json({ ok: false, error: "invalid_starts_at" }, { status: 400 });
  }

  const endsAtRaw = winnerEndsAt !== undefined ? winnerEndsAt : asNullableTrimmedString(primary.ends_at);
  const endsAt = endsAtRaw && isIsoDateTime(endsAtRaw) ? endsAtRaw : null;
  if (endsAt && new Date(endsAt).getTime() < new Date(startsAtRaw).getTime()) {
    return NextResponse.json({ ok: false, error: "ends_before_starts" }, { status: 400 });
  }

  const timezone = normalizeTimeZone(
    winnerTimezone !== undefined ? winnerTimezone : asNullableTrimmedString(primary.timezone)
  ) ?? null;

  const addressText = clamp(
    winnerAddress !== undefined
      ? winnerAddress
      : asNullableTrimmedString(primary.address_text) ?? asNullableTrimmedString(others.find((e) => e.address_text)?.address_text),
    200
  );

  const city = clamp(
    winnerCity !== undefined ? winnerCity : asNullableTrimmedString(primary.city) ?? asNullableTrimmedString(others.find((e) => e.city)?.city),
    80
  );

  const state = normalizeState(
    winnerState !== undefined ? winnerState : asNullableTrimmedString(primary.state) ?? asNullableTrimmedString(others.find((e) => e.state)?.state)
  );

  const teamName = clamp(
    winnerTeam !== undefined ? winnerTeam : asNullableTrimmedString(primary.team_name) ?? asNullableTrimmedString(others.find((e) => e.team_name)?.team_name),
    80
  );

  const opponentName = clamp(
    winnerOpponent !== undefined
      ? winnerOpponent
      : asNullableTrimmedString(primary.opponent_name) ?? asNullableTrimmedString(others.find((e) => e.opponent_name)?.opponent_name),
    80
  );

  const fieldLabel = clamp(
    winnerFieldLabel !== undefined
      ? winnerFieldLabel
      : asNullableTrimmedString(primary.field_label) ?? asNullableTrimmedString(others.find((e) => e.field_label)?.field_label),
    80
  );

  const venueIdRaw =
    winnerVenueId !== undefined
      ? winnerVenueId
      : asNullableTrimmedString(primary.venue_id) ?? asNullableTrimmedString(others.find((e) => e.venue_id)?.venue_id);
  const venueId = venueIdRaw && isUuid(venueIdRaw) ? venueIdRaw : null;
  if (venueIdRaw && !venueId) return NextResponse.json({ ok: false, error: "invalid_venue_id" }, { status: 400 });

  const tournamentIdRaw =
    winnerTournamentId !== undefined
      ? winnerTournamentId
      : asNullableTrimmedString(primary.tournament_id) ?? asNullableTrimmedString(others.find((e) => e.tournament_id)?.tournament_id);
  const tournamentId = tournamentIdRaw && isUuid(tournamentIdRaw) ? tournamentIdRaw : null;
  if (tournamentIdRaw && !tournamentId) return NextResponse.json({ ok: false, error: "invalid_tournament_id" }, { status: 400 });

  const notesList =
    winnerNotes !== undefined
      ? winnerNotes
        ? [winnerNotes]
        : []
      : uniqueNonEmptyStrings(involved.map((e) => asNullableTrimmedString(e.notes)));
  const notes = clamp(notesList.length ? notesList.join("\n\n---\n\n") : null, 2000);

  const eventType = asTrimmedString(primary.event_type);
  if (!eventType) return NextResponse.json({ ok: false, error: "invalid_event_type" }, { status: 400 });

  const { data: inserted, error: insertError } = await (supabase.from("planner_events" as any) as any)
    .insert({
      user_id: user.id,
      weekend_id: primary.weekend_id ?? null,
      title,
      event_type: eventType,
      team_name: teamName,
      opponent_name: opponentName,
      tournament_id: tournamentId,
      venue_id: venueId,
      field_label: fieldLabel,
      address_text: addressText,
      city,
      state,
      starts_at: startsAtRaw,
      ends_at: endsAt,
      timezone,
      notes,
      source_type: "manual",
      source_id: null,
      source_event_uid: null,
    })
    .select(
      "id,user_id,weekend_id,title,event_type,team_name,opponent_name,tournament_id,venue_id,field_label,address_text,city,state,starts_at,ends_at,timezone,notes,source_type,source_id,source_event_uid,created_at,updated_at"
    )
    .single();

  if (insertError || !inserted) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });

  const suppressed: Array<{
    // Preferred identity field for clients.
    id: string;
    // Back-compat / explicit naming.
    event_id: string;
    source_id?: string | null;
    source_event_uid?: string | null;
    title?: string | null;
    source_type?: string | null;
  }> = [];
  const suppressionRows: any[] = [];

  let manualIncluded = false;
  for (const e of involved) {
    const sourceType = String(e?.source_type ?? "").trim();
    if (sourceType !== "ics") {
      manualIncluded = true;
      continue;
    }
    const sid = String(e?.source_id ?? "").trim();
    const uid = String(e?.source_event_uid ?? "").trim();
    if (!sid || !uid) {
      warnings.push({
        field: "suppression",
        message: "An imported calendar event was missing a stable identity and could not be hidden after merge.",
      });
      continue;
    }
    suppressionRows.push({
      user_id: user.id,
      reason: "merged_duplicate",
      source_id: sid,
      source_event_uid: uid,
      event_id: String(e.id),
      merged_into_event_id: String(inserted.id),
    });
    suppressed.push({
      id: String(e.id),
      event_id: String(e.id),
      source_id: sid,
      source_event_uid: uid,
      title: asTrimmedString(e?.title) ?? null,
      source_type: asTrimmedString(e?.source_type) ?? null,
    });
  }

  if (manualIncluded) {
    warnings.push({
      field: "manual_originals",
      message: "Manual duplicate events were not hidden in this stage. You can delete them manually if needed.",
    });
  }

  if (suppressionRows.length) {
    const { error: suppressError } = await (supabase.from("planner_event_suppressions" as any) as any)
      .insert(suppressionRows)
      .select("id")
      .limit(suppressionRows.length);

    // Unique constraint: ignore duplicates. (We do not rely on PostgREST upsert/onConflict here because
    // the backing unique index may be partial.)
    if (suppressError) {
      const code = String((suppressError as any).code ?? "");
      if (code !== "23505") {
        warnings.push({ field: "suppression", message: "Some merged duplicates could not be hidden due to a server error." });
      }
    }
  }

  return NextResponse.json({ ok: true, event: inserted, suppressed, warnings });
}
