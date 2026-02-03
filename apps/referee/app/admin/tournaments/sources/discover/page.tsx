import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { normalizeSourceUrl, upsertRegistry } from "@/server/admin/sources";
import { redirect } from "next/navigation";
import RunDiscovery from "./RunDiscovery";

const SPORT_OPTIONS = [
  "soccer",
  "futsal",
  "basketball",
  "baseball",
  "softball",
  "lacrosse",
  "volleyball",
  "football",
  "wrestling",
  "hockey",
  "other",
] as const;

const SOURCE_TYPE_OPTIONS = [
  "tournament_platform",
  "governing_body",
  "league",
  "club",
  "directory",
] as const;

type SearchParams = {
  notice?: string;
  sport?: string | string[];
  state?: string | string[];
  etype?: string | string[];
  pay?: string;
  hotel?: string;
  meals?: string;
  pdf?: string;
  custom?: string;
};

function asArray(val: string | string[] | undefined): string[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function buildQueriesFromParams(params: SearchParams): string[] {
  const sports = asArray(params.sport).filter(Boolean);
  const states = asArray(params.state).filter(Boolean);
  const eventTypes = asArray(params.etype).filter(Boolean);
  const includePay = params.pay === "on";
  const includeHotel = params.hotel === "on";
  const includeMeals = params.meals === "on";
  const pdfFirst = params.pdf === "on";

  const baseTerms = ['("referee" OR "officials" OR "assignor" OR "referee coordinator")'];
  const extras: string[] = [];
  if (eventTypes.length) extras.push(`(${eventTypes.map((e) => `"${e}"`).join(" OR ")})`);
  if (includePay) extras.push('("referee pay" OR "officials pay" OR "referee fees" OR "referee rates")');
  if (includeHotel) extras.push("(hotel OR housing OR lodging)");
  if (includeMeals) extras.push('("meals" OR "per diem" OR stipend)');
  if (sports.length) extras.push(`(${sports.join(" OR ")})`);
  if (states.length) extras.push(`(${states.map((s) => `"${s}"`).join(" OR ")})`);

  const negatives = "-casino -gambling -booking -concert -tickets";
  const pdf = pdfFirst ? "(filetype:pdf OR filetype:doc OR filetype:docx)" : "";

  const body = [...baseTerms, ...extras].join(" AND ");
  if (!body) return [];
  const queries: string[] = [];
  for (let i = 0; i < Math.max(6, extras.length + 2); i++) {
    queries.push([body, pdf, negatives].filter(Boolean).join(" "));
  }
  return queries.slice(0, 10);
}

type CustomQuery = {
  query: string;
  query_type: "custom";
  source: "manual";
};

function parseCustomQueries(raw: string | undefined) {
  const warnings: string[] = [];
  if (!raw) return { queries: [] as CustomQuery[], warnings };
  const lines = raw
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const queries: CustomQuery[] = [];
  lines.forEach((line) => {
    if (line.length > 300) {
      warnings.push(`Skipped a line over 300 characters.`);
      return;
    }
    if (/^https?:\/\//i.test(line)) {
      warnings.push(`Custom query looks like a URL: ${line}`);
    }
    queries.push({ query: line, query_type: "custom", source: "manual" });
  });
  return { queries, warnings };
}

async function addToMaster(formData: FormData) {
  "use server";
  await requireAdmin();
  const raw = String(formData.get("urls") || "");
  const source_type = String(formData.get("source_type") || "").trim() || null;
  const sport = String(formData.get("sport_default") || "").trim() || null;
  if (!source_type || !sport) {
    redirect(
      `/admin/tournaments/sources/discover?notice=${encodeURIComponent(
        "Sport and source type are required."
      )}`
    );
  }
  const state = String(formData.get("state_default") || "").trim() || null;
  const city = String(formData.get("city_default") || "").trim() || null;
  const notesPrefix = String(formData.get("notes_prefix") || "").trim();
  const urls = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let added = 0;
  for (const u of urls) {
    const { canonical } = normalizeSourceUrl(u);
    await upsertRegistry({
      source_url: canonical,
      source_type,
      sport,
      state,
      city,
      notes: notesPrefix ? `${notesPrefix} ${canonical}` : null,
      review_status: "needs_review",
    });
    added++;
  }
  redirect(
    `/admin/tournaments/sources/discover?notice=${encodeURIComponent(`Added ${added} URL${added === 1 ? "" : "s"}`)}`
  );
}

export default async function DiscoverPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const notice = searchParams.notice ?? "";
  const builderQueries = buildQueriesFromParams(searchParams);
  const { queries: customQueries, warnings } = parseCustomQueries(searchParams.custom);
  const mergedQueries = Array.from(new Set([...builderQueries, ...customQueries.map((q) => q.query)]));

  return (
    <div style={{ padding: 24 }}>
      <AdminNav />
      <h1 style={{ fontSize: 20, fontWeight: 900, marginBottom: 12 }}>Discover sources</h1>
      {notice && (
        <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", padding: 8, borderRadius: 8, marginBottom: 12 }}>
          {notice}
        </div>
      )}

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr", marginBottom: 24 }}>
        <form method="get" style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Search query builder</h2>
          <div style={{ display: "grid", gap: 8, marginTop: 8, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Sports
              <select name="sport" multiple style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db", minHeight: 90 }}>
                {SPORT_OPTIONS.map((s) => (
                  <option key={s} value={s} selected={asArray(searchParams.sport).includes(s)}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              States
              <select name="state" multiple style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db", minHeight: 90 }}>
                {["WA", "OR", "CA", "AZ", "NV", "UT", "ID", "MT"].map((s) => (
                  <option key={s} value={s} selected={asArray(searchParams.state).includes(s)}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Event types
              <select name="etype" multiple style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db", minHeight: 90 }}>
                {["tournament", "showcase", "invitational", "cup", "classic"].map((s) => (
                  <option key={s} value={s} selected={asArray(searchParams.etype).includes(s)}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: "grid", gap: 6, paddingTop: 18 }}>
              {[
                ["pay", "Pay terms"],
                ["hotel", "Hotel / housing"],
                ["meals", "Meals / per diem"],
                ["pdf", "PDF-first"],
              ].map(([name, label]) => (
                <label key={name} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                  <input type="checkbox" name={name} defaultChecked={(searchParams as any)[name] === "on"} /> {label}
                </label>
              ))}
            </div>
          </div>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700, marginTop: 10 }}>
            Custom search query (advanced, optional)
            <textarea
              name="custom"
              rows={4}
              defaultValue={searchParams.custom ?? ""}
              style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db", width: "100%" }}
              placeholder="one query per line"
            />
          </label>
          <button
            type="submit"
            style={{
              marginTop: 10,
              padding: "10px 14px",
              borderRadius: 10,
              border: "none",
              background: "#0f172a",
              color: "#fff",
              fontWeight: 800,
            }}
          >
            Generate queries
          </button>
          {warnings.length > 0 && (
            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
              {warnings.map((msg, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: 8,
                    border: "1px solid #fde68a",
                    borderRadius: 8,
                    background: "#fffbeb",
                    fontSize: 12,
                  }}
                >
                  {msg}
                </div>
              ))}
            </div>
          )}
          {mergedQueries.length > 0 && (
            <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
              {mergedQueries.map((q, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: 8,
                    border: "1px dashed #d1d5db",
                    borderRadius: 8,
                    background: "#f9fafb",
                    fontSize: 13,
                  }}
                >
                  {q}
                </div>
              ))}
            </div>
          )}
          <RunDiscovery
            queries={mergedQueries}
            sportOptions={SPORT_OPTIONS}
            sourceTypeOptions={SOURCE_TYPE_OPTIONS}
          />
        </form>

        <form action={addToMaster} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Paste candidate URLs</h2>
          <div style={{ display: "grid", gap: 8, marginTop: 8, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Default source type
              <select name="source_type" required style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}>
                <option value="">Select type</option>
                {SOURCE_TYPE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Sport
              <select name="sport_default" required style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}>
                <option value="">Select sport</option>
                {SPORT_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              State
              <input name="state_default" placeholder="WA" style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              City
              <input name="city_default" placeholder="Seattle" style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Notes prefix
              <input name="notes_prefix" placeholder="#discovered_via:manual_search" style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
          </div>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700, marginTop: 8 }}>
            URLs (one per line)
            <textarea
              name="urls"
              rows={8}
              style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db", width: "100%" }}
              placeholder="https://example.com/events&#10;https://club.com/calendar"
            />
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button
              type="submit"
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "none",
                background: "#0f172a",
                color: "#fff",
                fontWeight: 800,
              }}
            >
              Add to master list
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
