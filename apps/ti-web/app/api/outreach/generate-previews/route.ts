import { NextRequest, NextResponse } from "next/server";
import { pickVariant } from "@/lib/outreach/ab";
import { sendEmailVerified } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildSportIntroReplyEmail,
  buildSportVerifyEmail,
  buildOutreachUnsubscribeUrl,
  buildVerifyUrl,
  capPreviewLimit,
  getOutreachGuardSecret,
  getOutreachMode,
  isValidEmail,
  normalizeOutreachEmailKind,
  normalizeOutreachSport,
} from "@/lib/outreach";
import { getTiOutreachAdminUser } from "@/lib/outreachAdmin";

type PreviewRequestBody = {
  sport?: string;
  campaign_id?: string;
  limit?: number;
  test_email_override?: string;
  mode?: "preview" | "send";
  start_after?: string;
  email_kind?: string;
};

type TournamentRow = {
  id: string;
  name: string | null;
  sport: string | null;
  tournament_director: string | null;
  tournament_director_email: string | null;
  start_date?: string | null;
  city?: string | null;
  state?: string | null;
};

type SuppressionRow = {
  tournament_id: string;
};

const PLACEHOLDER_EMAIL_VALUES = new Set(["null", "none", "n/a", "na", "unknown", "tbd", "-"]);

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function getLocalSendOverride() {
  return process.env.NODE_ENV === "production" ? "" : (process.env.OUTREACH_TEST_RECIPIENT || "").trim().toLowerCase();
}

function inferFirstName(value: string | null) {
  const first = (value || "").trim().split(/\s+/).filter(Boolean)[0] || "";
  return first || null;
}

function normalizeDirectorEmail(value: string | null | undefined) {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized || PLACEHOLDER_EMAIL_VALUES.has(normalized)) return "";
  return normalized;
}

function parseCooldownDays() {
  const raw = process.env.OUTREACH_COOLDOWN_DAYS;
  if (!raw) return 30;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(0, Math.min(Math.floor(parsed), 3650));
}

export async function POST(request: NextRequest) {
  const headerKey = request.headers.get("X-OUTREACH-KEY") || "";
  const expected = getOutreachGuardSecret();
  const adminUser = await getTiOutreachAdminUser();
  const isAuthorizedByHeader = !!expected && headerKey === expected;
  if (isProduction() && !isAuthorizedByHeader && !adminUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!adminUser && !isAuthorizedByHeader) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: PreviewRequestBody;
  try {
    body = (await request.json()) as PreviewRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const sport = normalizeOutreachSport(body.sport);
  const emailKind = normalizeOutreachEmailKind(body.email_kind);
  const campaignId = (body.campaign_id || "").trim();
  if (!campaignId) {
    return NextResponse.json({ error: "campaign_id is required." }, { status: 400 });
  }

  const limit = capPreviewLimit(body.limit);
  const startAfterRaw = (body.start_after || "").trim();
  let startAfter = "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(startAfterRaw)) {
    startAfter = startAfterRaw;
  } else {
    const slashMatch = startAfterRaw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      const [, mm, dd, yyyy] = slashMatch;
      const month = String(mm).padStart(2, "0");
      const day = String(dd).padStart(2, "0");
      startAfter = `${yyyy}-${month}-${day}`;
    }
  }
  const emailOverride = (body.test_email_override || "").trim();
  if (emailOverride && !isValidEmail(emailOverride)) {
    return NextResponse.json({ error: "test_email_override must be a valid email." }, { status: 400 });
  }
  const localSendOverride = getLocalSendOverride();
  if (localSendOverride && !isValidEmail(localSendOverride)) {
    return NextResponse.json({ error: "OUTREACH_TEST_RECIPIENT must be a valid email." }, { status: 500 });
  }

  const seenTournamentIds = new Set<string>();
  const blockedDirectorEmails = new Set<string>();

  // For intro outreach, we want one email per director that can cover multiple tournaments.
  // For verify-link outreach, we keep the existing one-tournament-per-email behavior.
  const maxTournamentsPerDirector = emailKind === "intro_reply" ? 5 : 1;
  const directorGroups = new Map<string, TournamentRow[]>();

  const { data: existingPreviewEmails, error: existingError } = await (supabaseAdmin.from(
    "email_outreach_previews" as any
  ) as any)
    .select("director_email")
    .eq("campaign_id", campaignId)
    .eq("sport", sport);

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  for (const row of (existingPreviewEmails ?? []) as Array<{ director_email: string | null }>) {
    const normalized = normalizeDirectorEmail(row.director_email);
    if (normalized) blockedDirectorEmails.add(normalized);
  }

  // Cross-campaign cooldown to avoid emailing the same director repeatedly.
  // Applies within the sport selected for generation.
  const cooldownDays = parseCooldownDays();
  if (cooldownDays > 0) {
    const sinceIso = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentlySentRows, error: recentlySentError } = await (supabaseAdmin.from(
      "email_outreach_previews" as any
    ) as any)
      .select("director_email")
      .eq("sport", sport)
      .eq("status", "sent")
      .gte("created_at", sinceIso);

    if (recentlySentError) {
      return NextResponse.json({ error: recentlySentError.message }, { status: 500 });
    }

    for (const row of (recentlySentRows ?? []) as Array<{ director_email: string | null }>) {
      const normalized = normalizeDirectorEmail(row.director_email);
      if (normalized) blockedDirectorEmails.add(normalized);
    }
  }
  const batchSize = Math.min(Math.max(limit * 4, 100), 500);
  let offset = 0;
  let scanCount = 0;

  function groupsHaveCapacity() {
    for (const tournaments of directorGroups.values()) {
      if (tournaments.length < maxTournamentsPerDirector) return true;
    }
    return false;
  }

  while ((directorGroups.size < limit || groupsHaveCapacity()) && scanCount < 20) {
    scanCount += 1;
    const from = offset;
    const to = offset + batchSize - 1;

    const { data, error } = await (supabaseAdmin.from("tournaments" as any) as any)
      .select("id,name,sport,tournament_director,tournament_director_email,start_date,city,state")
      .eq("sport", sport)
      .not("tournament_director_email", "is", null)
      .neq("tournament_director_email", "")
      .gte("start_date", startAfter || "0001-01-01")
      .order("start_date", { ascending: true, nullsFirst: false })
      .range(from, to);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const batchRows = (data ?? []) as TournamentRow[];
    if (batchRows.length === 0) break;
    offset += batchRows.length;

    const candidateRows = batchRows
      .map((row) => {
        const normalizedEmail = normalizeDirectorEmail(row.tournament_director_email);
        if (!row.id || !row.name || !normalizedEmail || !isValidEmail(normalizedEmail)) return null;
        if (seenTournamentIds.has(row.id)) return null;
        // Skip creating new director groups once we hit the preview limit, but still allow adding
        // additional tournaments to directors we already selected.
        if (!directorGroups.has(normalizedEmail) && directorGroups.size >= limit) return null;
        if (blockedDirectorEmails.has(normalizedEmail)) return null;
        seenTournamentIds.add(row.id);
        return {
          ...row,
          tournament_director_email: normalizedEmail,
        } satisfies TournamentRow;
      })
      .filter(Boolean) as TournamentRow[];

    if (candidateRows.length === 0) continue;

    const tournamentIds = candidateRows.map((row) => row.id);
    const { data: suppressionData, error: suppressionError } = await (supabaseAdmin.from(
      "email_outreach_suppressions" as any
    ) as any)
      .select("tournament_id")
      .in("tournament_id", tournamentIds);

    if (suppressionError) {
      return NextResponse.json({ error: suppressionError.message }, { status: 500 });
    }

    const suppressedIds = new Set(((suppressionData ?? []) as SuppressionRow[]).map((row) => row.tournament_id));
    const unsuppressedRows = candidateRows.filter((row) => !suppressedIds.has(row.id));

    for (const row of unsuppressedRows) {
      const directorEmail = String(row.tournament_director_email || "").trim().toLowerCase();
      if (!directorEmail) continue;
      const existing = directorGroups.get(directorEmail);
      if (existing) {
        if (existing.length < maxTournamentsPerDirector) {
          existing.push(row);
        }
        continue;
      }

      if (directorGroups.size >= limit) continue;
      directorGroups.set(directorEmail, [row]);
    }
  }

  if (directorGroups.size === 0) {
    return NextResponse.json({ created: 0 }, { status: 200 });
  }

  const mode = body.mode === "send" ? "send" : body.mode === "preview" ? "preview" : getOutreachMode();
  const records = [];

  for (const [directorEmailRaw, tournaments] of directorGroups.entries()) {
    const directorEmail = emailOverride || directorEmailRaw.trim();
    const primary = tournaments[0]!;
    const variant = pickVariant(directorEmail);
    const unsubscribeUrl = buildOutreachUnsubscribeUrl({
      sport,
      tournamentId: primary.id,
      tournamentIds: tournaments.map((t) => t.id),
      directorEmail,
    });
    const verifyUrl =
      emailKind === "verify_link"
        ? buildVerifyUrl({
            sport,
            tournamentId: primary.id,
            campaignId,
            variant,
          })
        : "";
    const email =
      emailKind === "intro_reply"
        ? buildSportIntroReplyEmail({
            sport,
            firstName: inferFirstName(primary.tournament_director),
            unsubscribeUrl,
            tournamentName: primary.name,
            tournaments: tournaments.map((t) => ({
              id: t.id,
              name: t.name,
              startDate: t.start_date ?? null,
              city: t.city ?? null,
              state: t.state ?? null,
            })),
            variant,
          })
        : buildSportVerifyEmail({
            sport,
            firstName: inferFirstName(primary.tournament_director),
            verifyUrl,
            unsubscribeUrl,
            tournamentName: primary.name,
            variant,
          });
    const sendRecipient = localSendOverride || directorEmail;
    let status: "preview" | "sent" | "error" = "preview";
    let providerMessageId: string | null = null;
    let sendError: string | null = null;

    if (mode === "send") {
      try {
        const { result } = await sendEmailVerified({
          to: sendRecipient,
          subject: email.subject,
          html: email.html,
          text: email.text,
          kind: "marketing",
        });
        status = "sent";
        providerMessageId = (result as { id?: string } | undefined)?.id ?? null;
        if (localSendOverride) {
          console.info(
            "[ti-outreach-send-override]",
            JSON.stringify({
              intended_recipient: directorEmail,
              sent_to: localSendOverride,
              tournament_id: primary.id,
              campaign_id: campaignId,
            })
          );
        }
      } catch (error) {
        status = "error";
        sendError = error instanceof Error ? error.message : "Unable to send outreach email.";
      }
    }

    records.push({
      sport,
      campaign_id: campaignId,
      variant,
      tournament_id: primary.id,
      tournament_ids: tournaments.map((t) => t.id),
      tournament_name: primary.name!,
      director_email: directorEmail,
      verify_url: verifyUrl,
      subject: email.subject,
      html_body: email.html,
      text_body: email.text,
      provider_message_id: providerMessageId,
      status,
      error: sendError,
    });
  }

  const { error: insertError } = await (supabaseAdmin.from("email_outreach_previews" as any) as any).insert(records);
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      created: records.length,
      mode,
      sent: records.filter((record) => record.status === "sent").length,
      errored: records.filter((record) => record.status === "error").length,
    },
    { status: 200 }
  );
}
