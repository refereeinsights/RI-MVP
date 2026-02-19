import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import AdminNav from "@/components/admin/AdminNav";

export const runtime = "nodejs";

const FIELD_LABELS: Record<string, string> = {
  start_date: "Start date",
  end_date: "End date",
  official_website_url: "Official website",
  tournament_director: "Tournament director",
  tournament_director_email: "Director email",
  tournament_director_phone: "Director phone",
  referee_pay: "Referee pay",
  venue: "Primary venue",
  address: "Address",
  city: "City",
  state: "State",
  zip: "Zip",
  additional_venues: "Additional venues",
  referee_contact: "Referee contact",
  referee_contact_email: "Referee contact email",
  referee_contact_phone: "Referee contact phone",
  ref_cash_tournament: "Cash tournament",
  referee_food: "Referee food",
  referee_tents: "Referee tents",
  facilities: "Facilities",
  travel_lodging: "Travel lodging",
  ref_mentors: "Mentors",
};

const ORDERED_FIELDS = Object.keys(FIELD_LABELS);
const TOURNAMENT_UPDATE_FIELDS = new Set([
  "start_date",
  "end_date",
  "official_website_url",
  "tournament_director",
  "tournament_director_email",
  "tournament_director_phone",
  "referee_pay",
  "venue",
  "address",
  "city",
  "state",
  "zip",
  "referee_contact",
  "referee_contact_email",
  "referee_contact_phone",
  "ref_cash_tournament",
  "referee_food",
  "referee_tents",
  "facilities",
  "travel_lodging",
  "ref_mentors",
]);

function formatValue(value: any) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function parseAdditionalVenues(value: unknown): Array<{ name: string; address: string | null }> {
  if (typeof value !== "string") return [];
  const rows = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const parsed: Array<{ name: string; address: string | null }> = [];
  for (const row of rows) {
    const [nameRaw, ...rest] = row.split("|");
    const name = (nameRaw ?? "").trim();
    const address = rest.join("|").trim() || null;
    if (!name) continue;
    const key = `${name.toLowerCase()}|${(address ?? "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    parsed.push({ name, address });
  }
  return parsed;
}

export default async function StaffVerificationQueuePage({
  searchParams,
}: {
  searchParams?: { notice?: string };
}) {
  await requireAdmin();

  const notice = searchParams?.notice ?? "";
  const { data: submissionsRaw } = await supabaseAdmin
    .from("tournament_staff_verification_submissions" as any)
    .select(
      "id,tournament_id,status,submitted_at,submitter_email,submitter_name,proposed_values,snapshot_current,diff_fields,tournaments(id,name,slug,city,state,sport)"
    )
    .eq("status", "pending_admin_review")
    .order("submitted_at", { ascending: false });
  const submissions = (submissionsRaw ?? []) as any[];

  async function approveSubmissionAction(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const submissionId = String(formData.get("submission_id") || "");
    if (!submissionId) redirect("/admin/tournaments/staff-verification-queue?notice=Missing%20submission");

    const { data: submissionRaw } = await supabaseAdmin
      .from("tournament_staff_verification_submissions" as any)
      .select("id,tournament_id,proposed_values,diff_fields")
      .eq("id", submissionId)
      .maybeSingle();

    const submission = submissionRaw as any;
    if (!submission) {
      redirect("/admin/tournaments/staff-verification-queue?notice=Submission%20not%20found");
    }

    const proposed = submission.proposed_values ?? {};
    const diffFields: string[] = submission.diff_fields ?? [];
    const { data: tournamentRaw } = await supabaseAdmin
      .from("tournaments" as any)
      .select("id,city,state,sport")
      .eq("id", submission.tournament_id)
      .maybeSingle();
    const tournament = tournamentRaw as any;

    const updates: Record<string, any> = {};
    diffFields.forEach((key) => {
      if (TOURNAMENT_UPDATE_FIELDS.has(key)) {
        updates[key] = proposed[key] ?? null;
      }
    });

    updates.tournament_staff_verified = true;
    updates.tournament_staff_verified_at = new Date().toISOString();
    updates.tournament_staff_verified_by_email =
      proposed.tournament_director_email ?? proposed.submitter_email ?? null;

    await supabaseAdmin
      .from("tournaments" as any)
      .update(updates)
      .eq("id", submission.tournament_id);

    const additionalVenues = parseAdditionalVenues(proposed.additional_venues);
    if (additionalVenues.length) {
      const city = typeof updates.city === "string" ? updates.city : tournament?.city ?? null;
      const state = typeof updates.state === "string" ? updates.state : tournament?.state ?? null;
      const sport = tournament?.sport ?? null;
      for (const row of additionalVenues) {
        let venueId: string | null = null;
        if (!row.address) {
          const { data: existingRaw } = await supabaseAdmin
            .from("venues" as any)
            .select("id")
            .eq("name", row.name)
            .eq("city", city)
            .eq("state", state)
            .or("address.is.null,address.eq.")
            .limit(1)
            .maybeSingle();
          venueId = (existingRaw as any)?.id ?? null;
        }
        if (!venueId) {
          const { data: upsertedRaw } = await supabaseAdmin
            .from("venues" as any)
            .upsert(
              {
                name: row.name,
                address: row.address,
                city,
                state,
                sport,
              },
              { onConflict: "name,address,city,state" }
            )
            .select("id")
            .maybeSingle();
          venueId = (upsertedRaw as any)?.id ?? null;
        }
        if (venueId) {
          await supabaseAdmin
            .from("tournament_venues" as any)
            .upsert({ tournament_id: submission.tournament_id, venue_id: venueId }, { onConflict: "tournament_id,venue_id" });
        }
      }
    }

    await supabaseAdmin
      .from("tournament_staff_verification_submissions" as any)
      .update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
        reviewed_by: admin.id,
      })
      .eq("id", submissionId);

    redirect("/admin/tournaments/staff-verification-queue?notice=Submission%20approved");
  }

  async function rejectSubmissionAction(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const submissionId = String(formData.get("submission_id") || "");
    if (!submissionId) redirect("/admin/tournaments/staff-verification-queue?notice=Missing%20submission");

    await supabaseAdmin
      .from("tournament_staff_verification_submissions" as any)
      .update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        reviewed_by: admin.id,
      })
      .eq("id", submissionId);

    redirect("/admin/tournaments/staff-verification-queue?notice=Submission%20rejected");
  }

  return (
    <main className="pitchWrap">
      <section className="field">
        <AdminNav />
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>Staff verification queue</h1>
          <p style={{ color: "#555", marginTop: 0 }}>
            Review and approve tournament staff submissions before applying them to public listings.
          </p>
          {notice ? (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: "1px solid #cbd5f5", background: "#eef2ff" }}>
              {notice}
            </div>
          ) : null}
          {submissions?.length ? (
            <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
              {submissions.map((submission: any) => {
                const tournament = submission.tournaments ?? null;
                const proposed = submission.proposed_values ?? {};
                const snapshot = submission.snapshot_current ?? {};
                const diffFields: string[] = submission.diff_fields ?? [];
                return (
                  <div key={submission.id} style={{ border: "1px solid #ddd", borderRadius: 14, padding: 16, background: "#fff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 900 }}>{tournament?.name ?? "Unknown tournament"}</div>
                        <div style={{ fontSize: 12, color: "#666" }}>
                          {tournament?.city ?? ""}{tournament?.city && tournament?.state ? ", " : ""}{tournament?.state ?? ""}
                        </div>
                        <div style={{ fontSize: 12, color: "#666" }}>
                          Submitted {submission.submitted_at ? new Date(submission.submitted_at).toLocaleString() : ""}
                        </div>
                        {submission.submitter_email ? (
                          <div style={{ fontSize: 12, color: "#444" }}>Submitter: {submission.submitter_email}</div>
                        ) : null}
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {tournament?.slug ? (
                          <Link href={`/tournaments/${tournament.slug}`} target="_blank" style={{ fontSize: 12 }}>
                            View public page ↗
                          </Link>
                        ) : null}
                        <form action={approveSubmissionAction}>
                          <input type="hidden" name="submission_id" value={submission.id} />
                          <button style={{ padding: "8px 12px", borderRadius: 999, border: "none", background: "#0f172a", color: "#fff", fontWeight: 800 }}>
                            Approve
                          </button>
                        </form>
                        <form action={rejectSubmissionAction}>
                          <input type="hidden" name="submission_id" value={submission.id} />
                          <button style={{ padding: "8px 12px", borderRadius: 999, border: "1px solid #b91c1c", background: "#fff", color: "#b91c1c", fontWeight: 800 }}>
                            Reject
                          </button>
                        </form>
                      </div>
                    </div>
                    <div style={{ marginTop: 12, borderTop: "1px solid #eee", paddingTop: 12 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 1fr", gap: 8, fontSize: 12, fontWeight: 700 }}>
                        <div>Field</div>
                        <div>Current</div>
                        <div>Proposed</div>
                      </div>
                      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                        {ORDERED_FIELDS.map((field) => {
                          const isDiff = diffFields.includes(field);
                          return (
                            <div key={field} style={{ display: "grid", gridTemplateColumns: "140px 1fr 1fr", gap: 8, fontSize: 12 }}>
                              <div style={{ fontWeight: 700, color: isDiff ? "#0f172a" : "#6b7280" }}>
                                {FIELD_LABELS[field]}
                              </div>
                              <div style={{ color: "#374151" }}>{formatValue(snapshot[field])}</div>
                              <div style={{ color: isDiff ? "#111827" : "#6b7280", fontWeight: isDiff ? 700 : 400 }}>
                                {formatValue(proposed[field])}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ marginTop: 16, padding: 16, borderRadius: 12, border: "1px dashed #cbd5f5", color: "#555" }}>
              No staff verification submissions waiting for review.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
