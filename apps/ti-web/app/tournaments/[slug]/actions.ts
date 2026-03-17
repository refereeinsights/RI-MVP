"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { canEditTournament, normalizeEmail } from "@/lib/tournamentClaim";

const EDITABLE_FIELDS = [
  "official_website_url",
  "start_date",
  "end_date",
  "city",
  "state",
  "tournament_director",
  "referee_contact",
  "referee_contact_email",
] as const;

function normalizeNullableText(value: FormDataEntryValue | null): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s ? s : null;
}

function normalizeNullableEmail(value: FormDataEntryValue | null): string | null {
  const s = typeof value === "string" ? value.trim().toLowerCase() : "";
  return s ? s : null;
}

function normalizeNullableUrl(value: FormDataEntryValue | null): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s ? s : null;
}

function normalizeNullableDate(value: FormDataEntryValue | null): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) return null;
  // Expected YYYY-MM-DD from <input type="date">.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

export async function saveClaimedTournamentEdits(formData: FormData): Promise<void> {
  const tournamentId = String(formData.get("tournament_id") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  if (!tournamentId || !slug) {
    redirect(`/tournaments/${encodeURIComponent(slug || "")}`);
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userEmail = normalizeEmail(user?.email ?? "");
  if (!user || !userEmail) {
    redirect(`/tournaments/${encodeURIComponent(slug)}?claim=1`);
  }

  const { data: rowRaw } = await (supabaseAdmin.from("tournaments" as any) as any)
    .select("id,tournament_director_email")
    .eq("id", tournamentId)
    .maybeSingle();

  const row = (rowRaw ?? null) as { id: string; tournament_director_email: string | null } | null;
  const directorEmail = row?.tournament_director_email ?? null;
  if (!canEditTournament(userEmail, directorEmail)) {
    redirect(`/tournaments/${encodeURIComponent(slug)}?claim=1`);
  }

  const payload: Record<string, any> = {};
  payload.official_website_url = normalizeNullableUrl(formData.get("official_website_url"));
  payload.start_date = normalizeNullableDate(formData.get("start_date"));
  payload.end_date = normalizeNullableDate(formData.get("end_date"));
  payload.city = normalizeNullableText(formData.get("city"));
  payload.state = normalizeNullableText(formData.get("state"));
  payload.tournament_director = normalizeNullableText(formData.get("tournament_director"));
  payload.referee_contact = normalizeNullableText(formData.get("referee_contact"));
  payload.referee_contact_email = normalizeNullableEmail(formData.get("referee_contact_email"));

  // Ensure we're not accidentally writing extra fields if the form changes.
  for (const key of Object.keys(payload)) {
    if (!(EDITABLE_FIELDS as readonly string[]).includes(key)) {
      delete payload[key];
    }
  }

  await (supabaseAdmin.from("tournaments" as any) as any).update(payload).eq("id", tournamentId);

  // Best-effort event logging (table may not exist until migrations are applied).
  try {
    await (supabaseAdmin.from("tournament_claim_events" as any) as any).insert({
      tournament_id: tournamentId,
      event_type: "Tournament Claim Edit Saved",
      entered_email: userEmail,
      user_id: user.id,
      meta: { fields: Object.keys(payload).filter((k) => payload[k] != null) },
    });
  } catch {
    // ignore
  }

  revalidatePath(`/tournaments/${slug}`);
  redirect(`/tournaments/${encodeURIComponent(slug)}?saved=1`);
}
