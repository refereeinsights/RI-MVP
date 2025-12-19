import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildTournamentSlug } from "@/lib/tournaments/slug";

const SPORT_OPTIONS = [
  { value: "soccer", label: "Soccer" },
  { value: "basketball", label: "Basketball" },
  { value: "football", label: "Football" },
];

function normalizeUrl(value: string) {
  if (!value) return "";
  try {
    return new URL(value).toString();
  } catch {
    try {
      return new URL(`https://${value}`).toString();
    } catch {
      return "";
    }
  }
}

function formatContactSummary(name?: string, email?: string, phone?: string) {
  return [name, email, phone].filter(Boolean).join(" • ") || null;
}

async function insertTournament(payload: Record<string, any>) {
  const baseSlug = payload.slug as string;
  let slug = baseSlug || `submission-${Date.now()}`;
  let lastError: any = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabaseAdmin
      .from("tournaments")
      .insert({ ...payload, slug, source_event_id: slug })
      .select("id,slug")
      .single();
    if (!error && data) {
      return data;
    }
    if (error && (error as any)?.code === "23505") {
      slug = `${baseSlug}-${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;
      lastError = error;
      continue;
    }
    throw error;
  }

  throw lastError;
}

function redirectWithMessage(params: { success?: boolean; error?: string }) {
  const query = new URLSearchParams();
  if (params.success) query.set("success", "1");
  if (params.error) query.set("error", params.error);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  redirect(`/tournaments/list${suffix}`);
}

async function listTournament(formData: FormData) {
  "use server";

  const name = (formData.get("name") as string | null)?.trim() || "";
  const sport = ((formData.get("sport") as string | null) || "").toLowerCase();
  const level = (formData.get("level") as string | null)?.trim() || null;
  const city = (formData.get("city") as string | null)?.trim() || null;
  const state =
    ((formData.get("state") as string | null)?.trim()?.toUpperCase() || "") || null;
  const venue = (formData.get("venue") as string | null)?.trim() || null;
  const address = (formData.get("address") as string | null)?.trim() || null;
  const start_date = (formData.get("start_date") as string | null)?.trim() || null;
  const end_date = (formData.get("end_date") as string | null)?.trim() || null;
  const summary = (formData.get("summary") as string | null)?.trim() || null;
  const websiteInput = (formData.get("website") as string | null)?.trim() || "";
  const referee_pay = (formData.get("referee_pay") as string | null)?.trim() || null;
  const cashTournament = formData.get("cash_tournament") === "on";

  const organizer_name = (formData.get("organizer_name") as string | null)?.trim() || null;
  const organizer_email = (formData.get("organizer_email") as string | null)?.trim() || null;
  const organizer_phone = (formData.get("organizer_phone") as string | null)?.trim() || null;
  const organizer_notes = (formData.get("organizer_notes") as string | null)?.trim() || null;

  const assignor_name = (formData.get("assignor_name") as string | null)?.trim() || null;
  const assignor_email = (formData.get("assignor_email") as string | null)?.trim() || null;
  const assignor_phone = (formData.get("assignor_phone") as string | null)?.trim() || null;
  const assignor_city = (formData.get("assignor_city") as string | null)?.trim() || null;
  const assignor_state =
    (formData.get("assignor_state") as string | null)?.trim()?.toUpperCase() || null;
  const assignor_notes = (formData.get("assignor_notes") as string | null)?.trim() || null;

  if (!name || !sport || !websiteInput) {
    redirectWithMessage({ error: "Tournament name, sport, and official website are required." });
  }
  if (!SPORT_OPTIONS.some((option) => option.value === sport)) {
    redirectWithMessage({ error: "Please choose a supported sport." });
  }

  const normalizedUrl = normalizeUrl(websiteInput);
  if (!normalizedUrl) {
    redirectWithMessage({ error: "Tournament website is invalid. Include the full URL (https://...)." });
  }

  let sourceDomain = "submission.refereeinsights.com";
  try {
    sourceDomain = new URL(normalizedUrl).hostname;
  } catch {
    // keep default
  }

  const slug = buildTournamentSlug({ name, city, state });
  const refereeContactSummary = formatContactSummary(assignor_name ?? undefined, assignor_email ?? undefined, assignor_phone ?? undefined);

  try {
    const tournament = await insertTournament({
      name,
      slug: slug || `submission-${Date.now()}`,
      sport,
      level,
      sub_type: "website",
      state,
      city,
      venue,
      address,
      start_date,
      end_date,
      summary,
      status: "draft",
      is_canonical: true,
      source: "public_submission",
      source_url: normalizedUrl,
      source_domain: sourceDomain,
      referee_pay,
      referee_contact: refereeContactSummary,
      cash_tournament: cashTournament,
    });

    const extraInserts: Promise<any>[] = [];

    if (organizer_name || organizer_email || organizer_phone || organizer_notes) {
      extraInserts.push(
        (async () => {
          const { error } = await supabaseAdmin.from("tournament_contacts").insert({
            tournament_id: tournament.id,
            type: "director",
            name: organizer_name,
            email: organizer_email,
            phone: organizer_phone,
            status: "pending",
            source_url: normalizedUrl,
            notes: organizer_notes,
          });
          if (error) throw error;
        })()
      );
    }

    if (assignor_name || assignor_email || assignor_phone || assignor_notes) {
      extraInserts.push(
        (async () => {
          const { data: referee, error } = await supabaseAdmin
            .from("referee_contacts")
            .insert({
              name: assignor_name,
              organization: name,
              role: "Assignor",
              email: assignor_email,
              phone: assignor_phone,
              city: assignor_city ?? city,
              state: assignor_state ?? state,
              notes: assignor_notes,
              type: "assignor",
              status: "pending",
            })
            .select("id")
            .single();
          if (error) throw error;
          if (referee?.id) {
            await supabaseAdmin.from("tournament_referee_contacts").insert({
              tournament_id: tournament.id,
              referee_contact_id: referee.id,
              notes: assignor_notes,
            });
          }
        })()
      );
    }

    await Promise.all(extraInserts);
    revalidatePath("/admin");
    revalidatePath("/tournaments");
    redirectWithMessage({ success: true });
  } catch (error: any) {
    console.error("Tournament submission failed", error);
    redirectWithMessage({
      error: error?.message ? String(error.message) : "Unable to list tournament right now.",
    });
  }
}

export const metadata = {
  title: "List Your Tournament | Referee Insights",
  description:
    "List tournament details, assignor contacts, and referee pay info so crews know what to expect before accepting assignments.",
};

export default function TournamentSubmissionPage({
  searchParams,
}: {
  searchParams?: { success?: string; error?: string };
}) {
  const success = searchParams?.success === "1";
  const error = searchParams?.error ?? "";

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg,#0c4327 0%,#0a3520 100%)",
        padding: "60px 16px 80px",
      }}
    >
      <section
        style={{
          maxWidth: 900,
          margin: "0 auto",
          background: "#fff",
          borderRadius: 20,
          padding: "32px 28px 36px",
          boxShadow: "0 15px 30px rgba(0,0,0,0.15)",
        }}
      >
        <header style={{ marginBottom: 24 }}>
          <p style={{ fontWeight: 700, color: "#0f5132", letterSpacing: "0.12em", marginBottom: 8 }}>
            List your tournament
          </p>
          <h1 style={{ margin: 0, fontSize: 32, color: "#052b16" }}>Share tournament logistics with referees</h1>
          <p style={{ marginTop: 12, fontSize: 16, color: "#24402f", lineHeight: 1.55 }}>
            Verified crews rely on Referee Insights to research assignments. List upcoming tournaments with dates,
            pay info, and contacts so officials can prepare before they accept games.
          </p>
        </header>

        {(success || error) && (
          <div
            style={{
              marginBottom: 20,
              padding: "14px 16px",
              borderRadius: 12,
              border: `1px solid ${success ? "#0f5132" : "#b42318"}`,
              background: success ? "rgba(15,81,50,0.08)" : "rgba(180,35,24,0.08)",
              color: success ? "#0f5132" : "#b42318",
              fontWeight: 600,
            }}
          >
            {success ? "Thanks! We’ll review and publish the tournament shortly." : error}
          </div>
        )}

        <form action={listTournament} style={{ display: "grid", gap: 20 }}>
          <input type="hidden" name="redirect_to" value="/tournaments/list" />
          <section
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 16,
              padding: 20,
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 20 }}>Tournament details</h2>
            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                Tournament name *
                <input
                  required
                  name="name"
                  type="text"
                  placeholder="Spring Cup"
                  style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
              </label>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                Sport *
                <select
                  required
                  name="sport"
                  style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: 10, border: "1px solid #cbd5f5" }}
                >
                  <option value="">Choose sport</option>
                  {SPORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                Level / age group
                <input
                  name="level"
                  type="text"
                  placeholder="U10–U19 select"
                  style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
              </label>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                City
                <input
                  name="city"
                  type="text"
                  placeholder="Spokane"
                  style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
              </label>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                State / province
                <input
                  name="state"
                  type="text"
                  maxLength={2}
                  placeholder="WA"
                  style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
              </label>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                Venue
                <input
                  name="venue"
                  type="text"
                  placeholder="Regional Sports Complex"
                  style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
              </label>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                Address
                <input
                  name="address"
                  type="text"
                  placeholder="1234 Main St"
                  style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
              </label>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                Starts
                <input
                  name="start_date"
                  type="date"
                  style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
              </label>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                Ends
                <input
                  name="end_date"
                  type="date"
                  style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
              </label>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                Tournament website *
                <input
                  required
                  name="website"
                  type="url"
                  placeholder="https://example.com"
                  style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                  Referee pay info
                  <input
                    name="referee_pay"
                    type="text"
                    placeholder="$45+ per game"
                    style={{
                      width: "100%",
                      marginTop: 6,
                      padding: 10,
                      borderRadius: 10,
                      border: "1px solid #cbd5f5",
                    }}
                  />
                </label>
                <label
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#0f172a",
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 8,
                  }}
                >
                  <input type="checkbox" name="cash_tournament" style={{ width: 18, height: 18 }} />
                  Cash tournament
                </label>
              </div>
            </div>
            <label style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginTop: 16, display: "block" }}>
              Short description
              <textarea
                name="summary"
                rows={4}
                placeholder="Who hosts the event? How many fields? Notes about travel or schedules?"
                style={{
                  width: "100%",
                  marginTop: 6,
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #cbd5f5",
                }}
              />
            </label>
          </section>

          <section
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 16,
              padding: 20,
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 20 }}>Tournament contact</h2>
            <p style={{ marginTop: 0, marginBottom: 16, color: "#475467", fontSize: 14 }}>
              Who should referees contact for logistics or scheduling? We keep these listed as “pending” until an admin
              verifies the assignment.
            </p>
            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                Contact name
                <input
                  name="organizer_name"
                  type="text"
                  style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
              </label>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                Email
                <input
                  name="organizer_email"
                  type="email"
                  style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
              </label>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                Phone
                <input
                  name="organizer_phone"
                  type="text"
                  style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
              </label>
            </div>
            <label style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginTop: 16, display: "block" }}>
              Notes for organizers (optional)
              <textarea
                name="organizer_notes"
                rows={3}
                placeholder="Any extra info we should share with admins when verifying this contact."
                style={{
                  width: "100%",
                  marginTop: 6,
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #cbd5f5",
                }}
              />
            </label>
          </section>

          <section
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 16,
              padding: 20,
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 20 }}>Assignor / Referee contact</h2>
            <p style={{ marginTop: 0, marginBottom: 16, color: "#475467", fontSize: 14 }}>
              If crews should coordinate with a specific assignor, add their info below so we can link them in the admin
              dashboard.
            </p>
            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                Assignor name
                <input
                  name="assignor_name"
                  type="text"
                  style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
              </label>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                Email
                <input
                  name="assignor_email"
                  type="email"
                  style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
              </label>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                Phone
                <input
                  name="assignor_phone"
                  type="text"
                  style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
              </label>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                City
                <input
                  name="assignor_city"
                  type="text"
                  style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
              </label>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                State
                <input
                  name="assignor_state"
                  type="text"
                  maxLength={2}
                  style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
              </label>
            </div>
            <label style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginTop: 16, display: "block" }}>
              Notes for assignor (optional)
              <textarea
                name="assignor_notes"
                rows={3}
                placeholder="Anything officials should know before contacting this assignor."
                style={{
                  width: "100%",
                  marginTop: 6,
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #cbd5f5",
                }}
              />
            </label>
          </section>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="submit"
              style={{
                padding: "14px 26px",
                borderRadius: 999,
                border: "none",
                background: "#0f5132",
                color: "#fff",
                fontWeight: 800,
                fontSize: 16,
                cursor: "pointer",
              }}
            >
              List tournament
            </button>
            <span style={{ fontSize: 13, color: "#4b5563" }}>
              We review every submission and publish once verified.
            </span>
          </div>
        </form>
      </section>

      <div style={{ maxWidth: 900, margin: "20px auto 0", textAlign: "center" }}>
        <Link href="/tournaments" style={{ color: "#d1fae5", fontWeight: 700, textDecoration: "none" }}>
          ← Back to tournament listings
        </Link>
      </div>
    </main>
  );
}
