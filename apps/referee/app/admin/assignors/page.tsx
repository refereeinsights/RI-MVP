import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import Link from "next/link";

export const runtime = "nodejs";

type SearchParams = {
  q?: string;
  state?: string;
  zip?: string;
  distance?: string;
  notice?: string;
  error?: string;
};

type AssignorRow = {
  id: string;
  display_name: string | null;
  base_city: string | null;
  base_state: string | null;
  zip?: string | null;
  last_seen_at: string | null;
  confidence: number | null;
  review_status: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

function normalizeType(row: any) {
  return String(row?.type ?? row?.contact_type ?? row?.kind ?? "").toLowerCase();
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function haversineMiles(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 3958.8;
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function fetchAssignorIdsByRadius(originZip: string, radiusMiles: number) {
  const { data: originRows } = await supabaseAdmin
    .from("zip_centroids" as any)
    .select("zip,latitude,longitude")
    .eq("zip", originZip)
    .limit(1);
  const origin = (originRows as any)?.[0] as { latitude?: number; longitude?: number } | undefined;
  if (!origin?.latitude || !origin?.longitude) return new Set<string>();

  const { data: assignorZipRows } = await supabaseAdmin
    .from("assignor_zip_codes" as any)
    .select("assignor_id,zip");
  const zips = Array.from(
    new Set((assignorZipRows ?? []).map((row: any) => row.zip).filter(Boolean))
  );

  const { data: centroidRows } = await supabaseAdmin
    .from("zip_centroids" as any)
    .select("zip,latitude,longitude")
    .in("zip", zips);
  const centroidMap = new Map<string, { lat: number; lon: number }>();
  (centroidRows ?? []).forEach((row: any) => {
    if (!row?.zip || typeof row.latitude !== "number" || typeof row.longitude !== "number") return;
    centroidMap.set(row.zip, { lat: row.latitude, lon: row.longitude });
  });

  const nearbyZips = new Set<string>();
  centroidMap.forEach((coords, zip) => {
    const distance = haversineMiles(
      { lat: origin.latitude, lon: origin.longitude },
      { lat: coords.lat, lon: coords.lon }
    );
    if (distance <= radiusMiles) nearbyZips.add(zip);
  });

  const ids = new Set<string>();
  (assignorZipRows ?? []).forEach((row: any) => {
    if (nearbyZips.has(row.zip)) ids.add(row.assignor_id);
  });
  return ids;
}

function AssignorAdminNav() {
  return (
    <div style={{ display: "flex", gap: 10, margin: "12px 0 18px" }}>
      {[
        { href: "/admin/assignors", label: "Directory" },
        { href: "/admin/assignors/review", label: "Review" },
        { href: "/admin/assignors/zip-missing", label: "Missing ZIPs" },
        { href: "/admin/assignors/sources", label: "Sources" },
      ].map((item) => (
        <a
          key={item.href}
          href={item.href}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: item.href === "/admin/assignors" ? "#0f172a" : "#f9fafb",
            color: item.href === "/admin/assignors" ? "#fff" : "#0f172a",
            fontWeight: 700,
            textDecoration: "none",
            fontSize: 13,
          }}
        >
          {item.label}
        </a>
      ))}
    </div>
  );
}

export default async function AssignorsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const q = (searchParams.q ?? "").trim();
  const state = (searchParams.state ?? "").trim().toUpperCase();
  const zip = (searchParams.zip ?? "").trim();
  const distanceParam = (searchParams.distance ?? "").trim();
  const distanceMiles = distanceParam ? Number(distanceParam) : 0;
  const notice = searchParams.notice ?? "";
  const error = searchParams.error ?? "";

  const selectColumns =
    "id,display_name,base_city,base_state,zip,last_seen_at,confidence,review_status";

  let assignors: AssignorRow[] = [];
  if (!q) {
    const { data } = await supabaseAdmin
      .from("assignors" as any)
      .select(selectColumns)
      .order("last_seen_at", { ascending: false })
      .limit(100);
    assignors = (data ?? []) as AssignorRow[];
  } else {
    const { data: nameMatches } = await supabaseAdmin
      .from("assignors" as any)
      .select(selectColumns)
      .ilike("display_name", `%${q}%`)
      .limit(100);

    const { data: contactMatches } = await supabaseAdmin
      .from("assignor_contacts" as any)
      .select("assignor_id")
      .ilike("normalized_value", `%${q}%`)
      .limit(200);

    const nameRows = (nameMatches ?? []) as AssignorRow[];
    const seen = new Set(nameRows.map((row) => row.id));
    const contactIds = Array.from(
      new Set((contactMatches ?? []).map((row: any) => row.assignor_id).filter(Boolean))
    ).filter((id) => !seen.has(id)) as string[];

    if (contactIds.length) {
      const { data: contactAssignors } = await supabaseAdmin
        .from("assignors" as any)
        .select(selectColumns)
        .in("id", contactIds)
        .limit(100);
      assignors = [...nameRows, ...((contactAssignors ?? []) as AssignorRow[])].slice(0, 100);
    } else {
      assignors = nameRows;
    }
  }

  if (state) {
    assignors = assignors.filter(
      (row) => String(row.base_state ?? "").toUpperCase() === state
    );
  }
  if (zip) {
    if (Number.isFinite(distanceMiles) && distanceMiles > 0) {
      const ids = await fetchAssignorIdsByRadius(zip, distanceMiles);
      assignors = assignors.filter((row) => ids.has(row.id));
    } else {
      const { data: zipRows } = await supabaseAdmin
        .from("assignor_zip_codes" as any)
        .select("assignor_id")
        .eq("zip", zip);
      const ids = new Set((zipRows ?? []).map((row: any) => row.assignor_id).filter(Boolean));
      assignors = assignors.filter((row) => ids.has(row.id));
    }
  }

  const assignorIds = assignors.map((row) => row.id);
  const { data: coverage } = assignorIds.length
    ? await supabaseAdmin
        .from("assignor_coverage" as any)
        .select("assignor_id,sport")
        .in("assignor_id", assignorIds)
    : { data: [] as any[] };

  const sportsByAssignor = new Map<string, string[]>();
  (coverage ?? []).forEach((row: any) => {
    if (!row.assignor_id || !row.sport) return;
    const list = sportsByAssignor.get(row.assignor_id) ?? [];
    if (!list.includes(row.sport)) list.push(row.sport);
    sportsByAssignor.set(row.assignor_id, list);
  });

  return (
    <div style={{ padding: 24 }}>
      <AdminNav />
      <h1 style={{ fontSize: 20, fontWeight: 900, marginBottom: 4 }}>Assignors Directory</h1>
      <AssignorAdminNav />
      {notice ? (
        <div style={{ background: "#ecfccb", border: "1px solid #bef264", padding: 8, borderRadius: 8, marginBottom: 10 }}>
          {notice}
        </div>
      ) : null}
      {error ? (
        <div style={{ background: "#fee2e2", border: "1px solid #fecaca", padding: 8, borderRadius: 8, marginBottom: 10 }}>
          Something went wrong.
        </div>
      ) : null}

      <form method="get" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <input
          name="q"
          defaultValue={q}
          placeholder="Search assignors, email, phone..."
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc", minWidth: 260 }}
        />
        <input
          name="state"
          defaultValue={state}
          placeholder="State (e.g. CA)"
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc", width: 140 }}
        />
        <input
          name="zip"
          defaultValue={zip}
          placeholder="ZIP (e.g. 94010)"
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc", width: 160 }}
        />
        <select
          name="distance"
          defaultValue={distanceParam}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc", width: 140 }}
        >
          <option value="">Distance</option>
          <option value="5">5 miles</option>
          <option value="10">10 miles</option>
          <option value="25">25 miles</option>
          <option value="50">50 miles</option>
          <option value="100">100 miles</option>
        </select>
        <button
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "none",
            background: "#0f172a",
            color: "#fff",
            fontWeight: 800,
          }}
        >
          Search
        </button>
        <a
          href="/admin/assignors"
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #0f172a",
            color: "#0f172a",
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          Reset
        </a>
      </form>

      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, background: "#fff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {["Name", "Location", "ZIP", "Sports", "Status", "Edit"].map((h) => (
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
                    <td style={{ padding: "6px 4px" }}>
                      <Link href={`/admin/assignors/${assignor.id}`} style={{ color: "#0f172a", fontWeight: 700 }}>
                        {assignor.display_name ?? "Unnamed"}
                      </Link>
                    </td>
                    <td style={{ padding: "6px 4px" }}>
                      {[assignor.base_city, assignor.base_state].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td style={{ padding: "6px 4px" }}>{assignor.zip ?? "—"}</td>
                    <td style={{ padding: "6px 4px" }}>{sports.length ? sports.join(", ") : "—"}</td>
                    <td style={{ padding: "6px 4px" }}>{assignor.review_status ?? "—"}</td>
                    <td style={{ padding: "6px 4px" }}>
                      <Link
                        href={`/admin/assignors/${assignor.id}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "4px 10px",
                          borderRadius: 999,
                          border: "1px solid #0f172a",
                          color: "#0f172a",
                          fontWeight: 700,
                          textDecoration: "none",
                        }}
                      >
                        Edit
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
  );
}
