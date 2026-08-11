"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/admin";
import { sendEmail } from "@/lib/email";

function normalizeEmail(value: FormDataEntryValue | null): string {
  return String(typeof value === "string" ? value : "")
    .trim()
    .toLowerCase();
}

function buildTiClaimRedirectTo(slug: string): string {
  const origin = process.env.TI_SITE_ORIGIN ?? "https://www.tournamentinsights.com";
  const url = new URL("/auth/confirm", origin);
  url.searchParams.set("next", `/tournaments/${slug}?claim=1`);
  return url.toString();
}

export async function approveTournamentClaimForm(formData: FormData): Promise<void> {
  await requireAdmin();
  const tournamentId = String(formData.get("tournament_id") ?? "").trim();
  const enteredEmail = normalizeEmail(formData.get("entered_email"));
  if (!tournamentId || !enteredEmail) return;

  await (supabaseAdmin.from("tournaments" as any) as any)
    .update({ tournament_director_email: enteredEmail })
    .eq("id", tournamentId);

  // Best-effort: log admin action.
  try {
    await (supabaseAdmin.from("tournament_claim_events" as any) as any).insert({
      tournament_id: tournamentId,
      event_type: "Tournament Claim Admin Approved",
      entered_email: enteredEmail,
      meta: {},
    });
  } catch {
    // ignore
  }

  // Fetch the tournament name and slug so we can send the claimant a magic link immediately.
  try {
    const { data: tRow } = await (supabaseAdmin.from("tournaments" as any) as any)
      .select("name,slug")
      .eq("id", tournamentId)
      .maybeSingle();

    const slug = tRow?.slug ?? null;
    const tournamentName = tRow?.name ?? "your tournament";

    if (slug) {
      const redirectTo = buildTiClaimRedirectTo(slug);
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: enteredEmail,
        options: { redirectTo },
      });

      if (linkError || !linkData?.properties?.action_link) {
        console.warn("[claims] magic link generation failed after admin approve", linkError?.message);
      } else {
        const magicLink = linkData.properties.action_link;
        await sendEmail({
          to: enteredEmail,
          from: "TournamentInsights <noreply@mail.tournamentinsights.com>",
          subject: `Your claim for ${tournamentName} is approved`,
          html: `
            <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
              <h2 style="margin-bottom:8px">Your tournament claim is approved</h2>
              <p>Your request to claim <strong>${tournamentName}</strong> on TournamentInsights has been reviewed and approved.</p>
              <p>Click the button below to sign in and access your tournament. This link expires in 24 hours.</p>
              <p style="margin:24px 0">
                <a href="${magicLink}" style="background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block">
                  Claim Your Tournament
                </a>
              </p>
              <p style="color:#64748b;font-size:13px">
                If you did not request this, you can safely ignore this email.
              </p>
            </div>
          `,
          text: `Your claim for ${tournamentName} on TournamentInsights has been approved.\n\nSign in here to access your tournament:\n${magicLink}\n\nThis link expires in 24 hours.`,
        });

        await (supabaseAdmin.from("tournament_claim_events" as any) as any).insert({
          tournament_id: tournamentId,
          event_type: "Tournament Claim Magic Link Sent",
          entered_email: enteredEmail,
          meta: { triggered_by: "admin_approve" },
        });
      }
    }
  } catch (err: any) {
    // Non-fatal — approval already succeeded; email is best-effort.
    console.warn("[claims] post-approve magic link send failed", err?.message ?? err);
  }

  revalidatePath("/admin/tournaments/claims");
}

export async function dismissTournamentClaimForm(formData: FormData): Promise<void> {
  await requireAdmin();
  const tournamentId = String(formData.get("tournament_id") ?? "").trim();
  const enteredEmail = normalizeEmail(formData.get("entered_email"));
  const reason = String(formData.get("reason") ?? "").trim();
  if (!tournamentId) return;

  try {
    await (supabaseAdmin.from("tournament_claim_events" as any) as any).insert({
      tournament_id: tournamentId,
      event_type: "Tournament Claim Admin Dismissed",
      entered_email: enteredEmail || null,
      meta: reason ? { reason: reason.slice(0, 500) } : {},
    });
  } catch {
    // ignore
  }

  revalidatePath("/admin/tournaments/claims");
}

