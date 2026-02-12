import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type VerifyPageProps = {
  params: { token: string };
  searchParams?: { submitted?: string; error?: string };
};

const REQUIRED_FIELDS = [
  "start_date",
  "end_date",
  "official_website_url",
  "tournament_director",
  "tournament_director_email",
  "referee_pay",
  "venue",
  "address",
  "city",
  "zip",
] as const;

const ALL_FIELDS = [
  ...REQUIRED_FIELDS,
  "tournament_director_phone",
  "referee_contact",
  "referee_contact_email",
  "referee_contact_phone",
  "cash_tournament",
  "referee_food",
  "referee_tents",
  "facilities",
  "travel_lodging",
  "mentors",
] as const;

type FieldKey = (typeof ALL_FIELDS)[number];
type ProposedValues = Record<FieldKey, string | boolean | null>;

const ENUMS: Record<string, Set<string>> = {
  referee_food: new Set(["snacks", "meal"]),
  referee_tents: new Set(["yes", "no"]),
  facilities: new Set(["restrooms", "portables"]),
  travel_lodging: new Set(["hotel", "stipend"]),
  mentors: new Set(["yes", "no"]),
};

function normalizeText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeTournamentValue(value: any): string | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  return String(value);
}

async function submitVerificationAction(formData: FormData) {
  "use server";
  const rawToken = String(formData.get("token") || "");

  const { data: tokenRowRaw } = await supabaseAdmin
    .from("tournament_staff_verify_tokens" as any)
    .select("id,tournament_id,expires_at,used_at")
    .eq("token", rawToken)
    .maybeSingle();
  const tokenRow = tokenRowRaw as any;

  const redirectBase = `/tournaments/verify/${encodeURIComponent(rawToken)}`;

  if (!tokenRow || !tokenRow.expires_at) {
    redirect(`${redirectBase}?error=invalid`);
  }

  const now = new Date();
  const expiresAt = new Date(tokenRow.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || now > expiresAt || tokenRow.used_at) {
    redirect(`${redirectBase}?error=expired`);
  }

  const proposed: ProposedValues = {
    start_date: normalizeText(formData.get("start_date")),
    end_date: normalizeText(formData.get("end_date")),
    official_website_url: normalizeText(formData.get("official_website_url")),
    tournament_director: normalizeText(formData.get("tournament_director")),
    tournament_director_email: normalizeText(formData.get("tournament_director_email")),
    referee_pay: normalizeText(formData.get("referee_pay")),
    venue: normalizeText(formData.get("venue")),
    address: normalizeText(formData.get("address")),
    city: normalizeText(formData.get("city")),
    zip: normalizeText(formData.get("zip")),
    tournament_director_phone: normalizeText(formData.get("tournament_director_phone")),
    referee_contact: normalizeText(formData.get("referee_contact")),
    referee_contact_email: normalizeText(formData.get("referee_contact_email")),
    referee_contact_phone: normalizeText(formData.get("referee_contact_phone")),
    cash_tournament: formData.get("cash_tournament") ? true : false,
    referee_food: normalizeText(formData.get("referee_food")),
    referee_tents: normalizeText(formData.get("referee_tents")),
    facilities: normalizeText(formData.get("facilities")),
    travel_lodging: normalizeText(formData.get("travel_lodging")),
    mentors: normalizeText(formData.get("mentors")),
  };

  const missingRequired = REQUIRED_FIELDS.filter((key) => {
    const value = proposed[key];
    return value === null || value === undefined || value === "";
  });

  if (missingRequired.length) {
    redirect(`${redirectBase}?error=required`);
  }

  for (const [key, allowed] of Object.entries(ENUMS)) {
    const value = proposed[key as FieldKey];
    if (value === null) continue;
    if (typeof value !== "string" || !allowed.has(value)) {
      redirect(`${redirectBase}?error=invalid`);
    }
  }

  const { data: tournamentRowRaw } = await supabaseAdmin
    .from("tournaments" as any)
    .select(
      "id,start_date,end_date,official_website_url,tournament_director,tournament_director_email,referee_pay,venue,address,city,zip,tournament_director_phone,referee_contact,referee_contact_email,referee_contact_phone,cash_tournament,referee_food,referee_tents,facilities,travel_lodging,mentors"
    )
    .eq("id", tokenRow.tournament_id)
    .maybeSingle();
  const tournamentRow = tournamentRowRaw as any;

  if (!tournamentRow) {
    redirect(`${redirectBase}?error=invalid`);
  }

  const snapshot: ProposedValues = {
    start_date: normalizeTournamentValue(tournamentRow.start_date) as string | null,
    end_date: normalizeTournamentValue(tournamentRow.end_date) as string | null,
    official_website_url: normalizeTournamentValue(tournamentRow.official_website_url) as string | null,
    tournament_director: normalizeTournamentValue(tournamentRow.tournament_director) as string | null,
    tournament_director_email: normalizeTournamentValue(tournamentRow.tournament_director_email) as string | null,
    referee_pay: normalizeTournamentValue(tournamentRow.referee_pay) as string | null,
    venue: normalizeTournamentValue(tournamentRow.venue) as string | null,
    address: normalizeTournamentValue(tournamentRow.address) as string | null,
    city: normalizeTournamentValue(tournamentRow.city) as string | null,
    zip: normalizeTournamentValue(tournamentRow.zip) as string | null,
    tournament_director_phone: normalizeTournamentValue(tournamentRow.tournament_director_phone) as string | null,
    referee_contact: normalizeTournamentValue(tournamentRow.referee_contact) as string | null,
    referee_contact_email: normalizeTournamentValue(tournamentRow.referee_contact_email) as string | null,
    referee_contact_phone: normalizeTournamentValue(tournamentRow.referee_contact_phone) as string | null,
    cash_tournament: typeof tournamentRow.cash_tournament === "boolean" ? tournamentRow.cash_tournament : null,
    referee_food: normalizeTournamentValue(tournamentRow.referee_food) as string | null,
    referee_tents: normalizeTournamentValue(tournamentRow.referee_tents) as string | null,
    facilities: normalizeTournamentValue(tournamentRow.facilities) as string | null,
    travel_lodging: normalizeTournamentValue(tournamentRow.travel_lodging) as string | null,
    mentors: normalizeTournamentValue(tournamentRow.mentors) as string | null,
  };

  const diffFields: FieldKey[] = [];
  ALL_FIELDS.forEach((key) => {
    const proposedValue = proposed[key];
    const currentValue = snapshot[key];
    if (typeof proposedValue === "string") {
      const normalized = proposedValue.trim() || null;
      if (normalized !== currentValue) diffFields.push(key);
      return;
    }
    if (proposedValue !== currentValue) diffFields.push(key);
  });

  const submissionInsert = {
    tournament_id: tokenRow.tournament_id,
    token_id: tokenRow.id,
    status: "pending_admin_review",
    proposed_values: proposed,
    snapshot_current: snapshot,
    diff_fields: diffFields,
    submitter_name: proposed.tournament_director ?? null,
    submitter_email: proposed.tournament_director_email ?? null,
  };

  const { error: insertError } = await supabaseAdmin
    .from("tournament_staff_verification_submissions" as any)
    .insert(submissionInsert);

  if (insertError) {
    redirect(`${redirectBase}?error=submit`);
  }

  await supabaseAdmin
    .from("tournament_staff_verify_tokens" as any)
    .update({ used_at: new Date().toISOString() })
    .eq("id", tokenRow.id);

  redirect(`${redirectBase}?submitted=1`);
}

export default async function TournamentVerifyPage({ params, searchParams }: VerifyPageProps) {
  const token = decodeURIComponent(params.token ?? "");
  const error = searchParams?.error ?? "";
  const { data: tokenRowRaw } = await supabaseAdmin
    .from("tournament_staff_verify_tokens" as any)
    .select("id,tournament_id,expires_at,used_at")
    .eq("token", token)
    .maybeSingle();
  const tokenRow = tokenRowRaw as any;

  const submitted = searchParams?.submitted === "1";
  if (!tokenRow || !tokenRow.expires_at) {
    return (
      <main className="pitchWrap">
        <section className="field">
          <div className="headerBlock">
            <h1 className="title">Verification link unavailable</h1>
            <p className="subtitle">This verification link has expired or was already used.</p>
            <Link className="btn" href="/tournaments">Back to tournaments</Link>
          </div>
        </section>
      </main>
    );
  }

  const now = new Date();
  const expiresAt = new Date(tokenRow.expires_at);
  const usedAt = tokenRow.used_at ? new Date(tokenRow.used_at) : null;
  const isExpired = Number.isNaN(expiresAt.getTime()) || now > expiresAt;
  const isUsed = Boolean(usedAt);

  if ((isExpired || isUsed) && !submitted) {
    return (
      <main className="pitchWrap">
        <section className="field">
          <div className="headerBlock">
            <h1 className="title">Verification link unavailable</h1>
            <p className="subtitle">This verification link has expired or was already used.</p>
            <Link className="btn" href="/tournaments">Back to tournaments</Link>
          </div>
        </section>
      </main>
    );
  }

  if (submitted) {
    return (
      <main className="pitchWrap">
        <section className="field">
          <div className="headerBlock">
            <h1 className="title">Thanks for the update</h1>
            <p className="subtitle">
              Your updates were submitted and are pending admin review.
            </p>
            <Link className="btn" href="/tournaments">Back to tournaments</Link>
          </div>
        </section>
      </main>
    );
  }

  const { data: tournamentRaw } = await supabaseAdmin
    .from("tournaments" as any)
    .select(
      "id,name,start_date,end_date,official_website_url,tournament_director,tournament_director_email,referee_pay,venue,address,city,zip,tournament_director_phone,referee_contact,referee_contact_email,referee_contact_phone,cash_tournament,referee_food,referee_tents,facilities,travel_lodging,mentors"
    )
    .eq("id", tokenRow.tournament_id)
    .maybeSingle();
  const tournament = tournamentRaw as any;

  if (!tournament) {
    return (
      <main className="pitchWrap">
        <section className="field">
          <div className="headerBlock">
            <h1 className="title">Tournament not found</h1>
            <p className="subtitle">We couldn&apos;t load this tournament.</p>
            <Link className="btn" href="/tournaments">Back to tournaments</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="pitchWrap">
      <section className="field">
        <div className="headerBlock" style={{ maxWidth: 860 }}>
          <h1 className="title">Verify tournament details</h1>
          <p className="subtitle">
            Updates are submitted for staff review before publishing.
          </p>
          {error ? (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: "1px solid #b91c1c", color: "#7f1d1d", background: "#fef2f2" }}>
              We couldn&apos;t submit your update. Please review the required fields and try again.
            </div>
          ) : null}
          <div style={{ marginTop: 16, padding: 16, borderRadius: 12, border: "1px solid #d7d7d7", background: "#fff" }}>
            <h2 style={{ marginTop: 0 }}>{tournament.name}</h2>
            <form action={submitVerificationAction}>
              <input type="hidden" name="token" value={token} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Start date *
                  <input type="date" name="start_date" required defaultValue={tournament.start_date ?? ""} style={{ width: "100%", padding: 8 }} />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  End date *
                  <input type="date" name="end_date" required defaultValue={tournament.end_date ?? ""} style={{ width: "100%", padding: 8 }} />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Official website *
                  <textarea
                    name="official_website_url"
                    required
                    defaultValue={tournament.official_website_url ?? ""}
                    rows={2}
                    style={{ width: "100%", padding: 8, resize: "vertical" }}
                  />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Tournament director *
                  <textarea
                    name="tournament_director"
                    required
                    defaultValue={tournament.tournament_director ?? ""}
                    rows={2}
                    style={{ width: "100%", padding: 8, resize: "vertical" }}
                  />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Director email *
                  <input type="email" name="tournament_director_email" required defaultValue={tournament.tournament_director_email ?? ""} style={{ width: "100%", padding: 8 }} />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Director phone
                  <input type="tel" name="tournament_director_phone" defaultValue={tournament.tournament_director_phone ?? ""} style={{ width: "100%", padding: 8 }} />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Referee pay *
                  <textarea
                    name="referee_pay"
                    required
                    defaultValue={tournament.referee_pay ?? ""}
                    rows={2}
                    style={{ width: "100%", padding: 8, resize: "vertical" }}
                  />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Venue (primary) *
                  <textarea
                    name="venue"
                    required
                    defaultValue={tournament.venue ?? ""}
                    rows={2}
                    style={{ width: "100%", padding: 8, resize: "vertical" }}
                  />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Address *
                  <textarea
                    name="address"
                    required
                    defaultValue={tournament.address ?? ""}
                    rows={2}
                    style={{ width: "100%", padding: 8, resize: "vertical" }}
                  />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  City *
                  <input type="text" name="city" required defaultValue={tournament.city ?? ""} style={{ width: "100%", padding: 8 }} />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Zip *
                  <input type="text" name="zip" required defaultValue={tournament.zip ?? ""} style={{ width: "100%", padding: 8 }} />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Referee contact
                  <textarea
                    name="referee_contact"
                    defaultValue={tournament.referee_contact ?? ""}
                    rows={2}
                    style={{ width: "100%", padding: 8, resize: "vertical" }}
                  />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Referee contact email
                  <input type="email" name="referee_contact_email" defaultValue={tournament.referee_contact_email ?? ""} style={{ width: "100%", padding: 8 }} />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Referee contact phone
                  <input type="tel" name="referee_contact_phone" defaultValue={tournament.referee_contact_phone ?? ""} style={{ width: "100%", padding: 8 }} />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Cash tournament
                  <input type="checkbox" name="cash_tournament" defaultChecked={Boolean(tournament.cash_tournament)} style={{ marginLeft: 8 }} />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Referee food
                  <select name="referee_food" defaultValue={tournament.referee_food ?? ""} style={{ width: "100%", padding: 8 }}>
                    <option value="">Select</option>
                    <option value="snacks">Snacks</option>
                    <option value="meal">Meal</option>
                  </select>
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Referee tents
                  <select name="referee_tents" defaultValue={tournament.referee_tents ?? ""} style={{ width: "100%", padding: 8 }}>
                    <option value="">Select</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Facilities
                  <select name="facilities" defaultValue={tournament.facilities ?? ""} style={{ width: "100%", padding: 8 }}>
                    <option value="">Select</option>
                    <option value="restrooms">Restrooms</option>
                    <option value="portables">Portables</option>
                  </select>
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Travel lodging
                  <select name="travel_lodging" defaultValue={tournament.travel_lodging ?? ""} style={{ width: "100%", padding: 8 }}>
                    <option value="">Select</option>
                    <option value="hotel">Hotel</option>
                    <option value="stipend">Stipend</option>
                  </select>
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Mentors
                  <select name="mentors" defaultValue={tournament.mentors ?? ""} style={{ width: "100%", padding: 8 }}>
                    <option value="">Select</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
              </div>
              <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
                <button className="btn" type="submit">Submit for review</button>
                <Link className="btn" href="/tournaments">Cancel</Link>
              </div>
              <p style={{ marginTop: 10, fontSize: 12, color: "#4b5563" }}>
                Fields marked * are required.
              </p>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
