import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import AssignorDirectoryTable from "./AssignorDirectoryTable";
import AcceptTermsModal from "./AcceptTermsModal";
import AssignorLocationFilters from "@/components/AssignorLocationFilters";
import StateMultiSelect from "../tournaments/StateMultiSelect";
import { normalizeStateDisplay, stateAliases } from "@/lib/usStates";
import "../tournaments/tournaments.css";

type SearchParams = {
  q?: string;
  state?: string | string[];
  sport?: string;
  city?: string | string[];
  zip?: string;
  terms?: string;
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
const ALL_STATES_VALUE = "__ALL__";

function asArray(value?: string | string[]) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function stateFilterValues(stateValue: string) {
  return stateAliases(stateValue);
}

function stateFilterValuesForSelections(selections: string[]) {
  const values = new Set<string>();
  selections.forEach((selection) => {
    stateFilterValues(selection).forEach((val) => values.add(val));
  });
  return Array.from(values);
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

export default async function AssignorsPage({ searchParams }: { searchParams?: SearchParams }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const q = (searchParams?.q ?? "").trim();
  const sport = (searchParams?.sport ?? "").trim().toLowerCase();
  const stateParam = searchParams?.state;
  const stateSelectionsRaw = (Array.isArray(stateParam) ? stateParam : stateParam ? [stateParam] : [])
    .map((s) => normalizeStateDisplay(s))
    .filter(Boolean);
  const stateSelections = stateSelectionsRaw.filter((s) => s !== ALL_STATES_VALUE);
  const isAllStates = stateSelections.length === 0 || stateSelectionsRaw.includes(ALL_STATES_VALUE);
  const stateSummaryLabel = isAllStates
    ? "All states"
    : stateSelections.length <= 3
    ? stateSelections.join(", ")
    : `${stateSelections.length} states`;
  const stateFilterList = isAllStates ? [] : stateFilterValuesForSelections(stateSelections);
  const citySelections = asArray(searchParams?.city).map((c) => c.trim()).filter(Boolean);
  const zip = (searchParams?.zip ?? "").trim();
  const termsAcceptedNotice = searchParams?.terms === "accepted";

  const { data: profile, error: profileError } = user
    ? await supabaseAdmin
        .from("profiles" as any)
        .select("contact_terms_accepted_at")
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null as any, error: null as any };
  if (profileError) {
    console.error("assignors: profile lookup failed", profileError);
  }
  const termsAccepted = !!(profile as any)?.contact_terms_accepted_at;

  let query = supabase
    .from("assignor_directory_public" as any)
    .select("id,display_name,base_city,base_state,last_seen_at,confidence,masked_email,masked_phone")
    .order("last_seen_at", { ascending: false })
    .limit(200);

  if (q) {
    query = query.or(`display_name.ilike.%${q}%,base_city.ilike.%${q}%`);
  }
  if (stateFilterList.length) {
    query = stateFilterList.length > 1 ? query.in("base_state", stateFilterList) : query.eq("base_state", stateFilterList[0]);
  }
  if (stateFilterList.length && citySelections.length) {
    query = query.in("base_city", citySelections);
  }
  if (zip) {
    const { data: zipRows } = await supabase
      .from("assignor_zip_codes" as any)
      .select("assignor_id")
      .eq("zip", zip);
    const ids = (zipRows ?? []).map((row: any) => row.assignor_id).filter(Boolean);
    if (ids.length === 0) {
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
            <div style={{ marginTop: 24, color: "#555" }}>No assignors found for ZIP {zip}.</div>
          </section>
        </main>
      );
    }
    query = query.in("id", ids);
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

  const citiesByState: Record<string, string[]> = {};
  (filterRows ?? []).forEach((row: any) => {
    const st = normalizeStateDisplay(row?.base_state ?? "");
    const rawCity = String(row?.base_city ?? "").trim();
    if (!st || !rawCity) return;
    const cityKey = rawCity.toLowerCase();
    const list = citiesByState[st] ?? [];
    if (!list.some((c) => c.toLowerCase() === cityKey)) {
      list.push(rawCity);
    }
    citiesByState[st] = list;
  });
  Object.keys(citiesByState).forEach((st) => {
    citiesByState[st] = citiesByState[st].sort((a, b) => a.localeCompare(b));
  });
  const states = Object.keys(citiesByState).sort();

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

        {termsAcceptedNotice ? (
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
            Thanks — contact access terms accepted.
          </div>
        ) : null}

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
            <span>To view contact details, please review and accept the contact access terms.</span>
            <AcceptTermsModal />
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
              <span style={{ marginBottom: 6 }}>ZIP</span>
              <input
                id="zip"
                name="zip"
                placeholder="e.g. 95030"
                defaultValue={zip}
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
            <div>
              <span className="label">State</span>
              <StateMultiSelect
                availableStates={states}
                stateSelections={stateSelections}
                isAllStates={isAllStates}
                allStatesValue={ALL_STATES_VALUE}
                summaryLabel={stateSummaryLabel}
              />
            </div>
            <AssignorLocationFilters
              citiesByState={citiesByState}
              initialCities={citySelections}
              stateSelections={stateSelections}
              isAllStates={isAllStates}
            />
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
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
          <AssignorDirectoryTable
            assignors={assignors}
            sportsByAssignor={Object.fromEntries(sportsByAssignor)}
            canReveal={!!user && termsAccepted}
            needsTerms={!!user && !termsAccepted}
            showSignIn={!user}
          />
        </div>
      </section>
    </main>
  );
}
