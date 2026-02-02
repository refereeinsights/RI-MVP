import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import AssignorContactCells from "./AssignorContactCells";
import "../tournaments/tournaments.css";

type SearchParams = {
  q?: string;
  state?: string;
  sport?: string;
  city?: string | string[];
};

type AssignorRow = {
  id: string;
  display_name: string | null;
  base_city: string | null;
  base_state: string | null;
  last_seen_at: string | null;
  confidence: number | null;
  masked_email?: string | null;
  masked_phone?: string | null;
};

const SPORT_OPTIONS = ["soccer", "basketball", "football"] as const;

function asArray(value?: string | string[]) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function lastNameSortKey(name?: string | null) {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1] ?? "").toLowerCase();
}

export const metadata = {
  title: "Assignor Directory | RefereeInsights",
  description:
    "Directory of approved assignors with coverage details. Contact info requires login.",
};

async function acceptContactTerms() {
  "use server";
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/account/login");
  }

  const { error } = await supabaseAdmin
    .from("profiles" as any)
    .upsert(
      { user_id: user.id, contact_terms_accepted_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );

  if (error) {
    throw error;
  }

  revalidatePath("/assignors");
}

export default async function AssignorsPage({ searchParams }: { searchParams?: SearchParams }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const q = (searchParams?.q ?? "").trim();
  const sport = (searchParams?.sport ?? "").trim().toLowerCase();
  const state = (searchParams?.state ?? "").trim().toUpperCase();
  const citySelections = asArray(searchParams?.city).map((c) => c.trim()).filter(Boolean);

  const { data: profile } = user
    ? await supabase
        .from("profiles" as any)
        .select("contact_terms_accepted_at")
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null as any };
  const termsAccepted = !!(profile as any)?.contact_terms_accepted_at;

  let query = supabase
    .from("assignor_directory_public" as any)
    .select("id,display_name,base_city,base_state,last_seen_at,confidence,masked_email,masked_phone")
    .order("last_seen_at", { ascending: false })
    .limit(200);

  if (q) {
    query = query.or(`display_name.ilike.%${q}%,base_city.ilike.%${q}%`);
  }
  if (state) {
    query = query.eq("base_state", state);
  }
  if (citySelections.length) {
    query = query.in("base_city", citySelections);
  }

  const { data, error } = await query;
  if (error) {
    return (
      <main className="pitchWrap">
        <section className="field">
          <div className="headerBlock">
            <h1 className="title">Assignor Directory</h1>
            <p className="subtitle">Error loading assignors: {error.message}</p>
          </div>
        </section>
      </main>
    );
  }

  let assignors = (data ?? []) as AssignorRow[];
  const ids = assignors.map((row) => row.id);

  const { data: filterRows } = await supabase
    .from("assignors")
    .select("base_state,base_city")
    .eq("review_status", "approved")
    .limit(1000);

  const states = Array.from(
    new Set(
      (filterRows ?? [])
        .map((row: any) => String(row?.base_state ?? "").trim())
        .filter(Boolean)
        .map((s: string) => s.toUpperCase())
    )
  ).sort();

  const cities = Array.from(
    new Set(
      (filterRows ?? [])
        .filter((row: any) => !state || String(row?.base_state ?? "").toUpperCase() === state)
        .map((row: any) => String(row?.base_city ?? "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  const { data: coverageRows } = ids.length
    ? await supabase
        .from("assignor_coverage")
        .select("assignor_id,sport")
        .in("assignor_id", ids)
    : { data: [] as any[] };

  const sportsByAssignor = new Map<string, string[]>();
  (coverageRows ?? []).forEach((row: any) => {
    if (!row.assignor_id || !row.sport) return;
    const list = sportsByAssignor.get(row.assignor_id) ?? [];
    if (!list.includes(row.sport)) list.push(row.sport);
    sportsByAssignor.set(row.assignor_id, list);
  });

  if (sport) {
    assignors = assignors.filter((row) =>
      (sportsByAssignor.get(row.id) ?? []).includes(sport)
    );
  }

  assignors = assignors.sort((a, b) => {
    const aKey = lastNameSortKey(a.display_name);
    const bKey = lastNameSortKey(b.display_name);
    if (aKey === bKey) return (a.display_name ?? "").localeCompare(b.display_name ?? "");
    return aKey.localeCompare(bKey);
  });

  return (
    <main className="pitchWrap tournamentsWrap schoolsPage">
      <section className="field tournamentsField">
        <div className="headerBlock schoolsHeader brandedHeader">
          <h1 className="title" style={{ fontSize: "2rem", fontWeight: 600, letterSpacing: "-0.01em" }}>
            Assignor Directory
          </h1>
          <p
            className="subtitle"
            style={{
              marginTop: 8,
              maxWidth: 680,
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            Read-only listing of approved assignors with coverage details. Contact info is available after sign-in.
          </p>
        </div>

        {!user ? (
          <div
            style={{
              marginTop: 16,
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid rgba(15, 23, 42, 0.2)",
              background: "#fff",
              fontSize: 13,
            }}
          >
            <strong>Sign in to view contact details.</strong>{" "}
            <Link href="/account/login" style={{ color: "#0f172a", fontWeight: 700 }}>
              Go to login
            </Link>
          </div>
        ) : !termsAccepted ? (
          <div
            style={{
              marginTop: 16,
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid rgba(15, 23, 42, 0.2)",
              background: "#fff",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span>To view contact details, please accept the contact access terms.</span>
            <form action={acceptContactTerms}>
              <button
                type="submit"
                className="btn"
                style={{
                  padding: "8px 14px",
                  borderRadius: 999,
                  background: "#0f172a",
                  color: "#fff",
                  border: "1px solid #0f172a",
                }}
              >
                Accept &amp; Reveal
              </button>
            </form>
          </div>
        ) : null}

        <form
          method="GET"
          action="/assignors"
          style={{
            marginTop: 20,
            borderRadius: 20,
            border: "1px solid rgba(255,255,255,0.6)",
            background: "rgba(0,0,0,0.08)",
            padding: "18px 18px 12px",
            display: "grid",
            gap: 14,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            <label style={{ display: "flex", flexDirection: "column", fontWeight: 700, color: "#0b1f14" }}>
              <span style={{ marginBottom: 6 }}>Search</span>
              <input
                id="q"
                name="q"
                placeholder="Search name or city..."
                defaultValue={q}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.2)",
                  background: "#fff",
                }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", fontWeight: 700, color: "#0b1f14" }}>
              <span style={{ marginBottom: 6 }}>Sport</span>
              <select
                name="sport"
                defaultValue={sport}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.2)",
                  background: "#fff",
                }}
              >
                <option value="">All</option>
                {SPORT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", fontWeight: 700, color: "#0b1f14" }}>
              <span style={{ marginBottom: 6 }}>State</span>
              <select
                name="state"
                defaultValue={state}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.2)",
                  background: "#fff",
                }}
              >
                <option value="">All</option>
                {states.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", fontWeight: 700, color: "#0b1f14" }}>
              <span style={{ marginBottom: 6 }}>Cities</span>
              <select
                name="city"
                multiple
                defaultValue={citySelections}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.2)",
                  background: "#fff",
                  minHeight: 120,
                }}
              >
                {cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="submit"
              className="btn"
              style={{ padding: "10px 16px", borderRadius: 999, background: "#0f172a", color: "#fff", border: "1px solid #0f172a" }}
            >
              Apply filters
            </button>
            <Link
              href="/assignors"
              className="btn btnSecondary"
              style={{ background: "#ffffff", color: "#0f172a", border: "1px solid #0f172a" }}
            >
              Reset
            </Link>
          </div>
        </form>

        <div style={{ marginTop: 24 }}>
          <div className="schoolsCount" style={{ marginBottom: 10 }}>
            Showing <strong>{assignors.length}</strong> assignor{assignors.length === 1 ? "" : "s"}
          </div>
          <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, background: "#fff" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {["Name", "Email", "Phone", "Location", "Sports", "Claim / Remove"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "6px 4px", borderBottom: "1px solid #eee" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assignors.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 8, color: "#666" }}>
                      No assignors found.
                    </td>
                  </tr>
                ) : (
                  assignors.map((assignor) => {
                    const sports = sportsByAssignor.get(assignor.id) ?? [];
                    return (
                      <tr key={assignor.id}>
                        <td style={{ padding: "6px 4px", fontWeight: 700 }}>{assignor.display_name ?? "Unnamed"}</td>
                        <AssignorContactCells
                          assignorId={assignor.id}
                          maskedEmail={assignor.masked_email}
                          maskedPhone={assignor.masked_phone}
                          canReveal={!!user && termsAccepted}
                          needsTerms={!!user && !termsAccepted}
                          showSignIn={!user}
                        />
                        <td style={{ padding: "6px 4px" }}>
                          {[assignor.base_city, assignor.base_state].filter(Boolean).join(", ") || "—"}
                        </td>
                        <td style={{ padding: "6px 4px" }}>{sports.length ? sports.join(", ") : "—"}</td>
                        <td style={{ padding: "6px 4px" }}>
                          <Link
                            href={`/assignors/claim?assignor_id=${assignor.id}`}
                            style={{ color: "#0f172a", fontWeight: 700 }}
                          >
                            Claim / Remove
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
