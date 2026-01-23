import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
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
};

const SPORT_OPTIONS = ["soccer", "basketball", "football"] as const;

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

function asArray(value?: string | string[]) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function lastNameSortKey(name?: string | null) {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1] ?? "").toLowerCase();
}

function normalizeType(row: any) {
  return String(row?.type ?? row?.contact_type ?? row?.kind ?? "").toLowerCase();
}

export const metadata = {
  title: "Assignor Directory | RefereeInsights",
  description:
    "Read-only directory of approved assignors with contact details, locations, and sports coverage.",
};

export default async function AssignorsPage({ searchParams }: { searchParams?: SearchParams }) {
  const supabase = createSupabaseServerClient();
  const q = (searchParams?.q ?? "").trim();
  const sport = (searchParams?.sport ?? "").trim().toLowerCase();
  const state = (searchParams?.state ?? "").trim().toUpperCase();
  const citySelections = asArray(searchParams?.city).map((c) => c.trim()).filter(Boolean);

  let query = supabase
    .from("assignors")
    .select("id,display_name,base_city,base_state,last_seen_at,confidence")
    .eq("review_status", "approved")
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

  const { data: contactRows } = ids.length
    ? await supabase
        .from("assignor_contacts")
        .select("assignor_id,type,value,normalized_value,is_primary")
        .in("assignor_id", ids)
    : { data: [] as any[] };

  const contactsByAssignor = new Map<string, any[]>();
  (contactRows ?? []).forEach((row: any) => {
    const list = contactsByAssignor.get(row.assignor_id) ?? [];
    list.push(row);
    contactsByAssignor.set(row.assignor_id, list);
  });

  const pickPrimary = (rows: any[], kind: "email" | "phone") => {
    const filtered = rows.filter((r) => normalizeType(r) === kind);
    const primary = filtered.find((r) => r.is_primary);
    const fallback = filtered[0];
    return (primary ?? fallback)?.value ?? (primary ?? fallback)?.normalized_value ?? null;
  };

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
            Read-only listing of approved assignors with coverage and contact details.
          </p>
        </div>

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
                  {["Name", "Email", "Phone", "Location", "Sports"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "6px 4px", borderBottom: "1px solid #eee" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assignors.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 8, color: "#666" }}>
                      No assignors found.
                    </td>
                  </tr>
                ) : (
                  assignors.map((assignor) => {
                    const rowContacts = contactsByAssignor.get(assignor.id) ?? [];
                    const email = pickPrimary(rowContacts, "email");
                    const phone = pickPrimary(rowContacts, "phone");
                    const sports = sportsByAssignor.get(assignor.id) ?? [];
                    return (
                      <tr key={assignor.id}>
                        <td style={{ padding: "6px 4px", fontWeight: 700 }}>{assignor.display_name ?? "Unnamed"}</td>
                        <td style={{ padding: "6px 4px" }}>{email ?? "—"}</td>
                        <td style={{ padding: "6px 4px" }}>{phone ?? "—"}</td>
                        <td style={{ padding: "6px 4px" }}>
                          {[assignor.base_city, assignor.base_state].filter(Boolean).join(", ") || "—"}
                        </td>
                        <td style={{ padding: "6px 4px" }}>{sports.length ? sports.join(", ") : "—"}</td>
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
