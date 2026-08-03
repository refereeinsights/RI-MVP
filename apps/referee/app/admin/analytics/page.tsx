import AdminNav from "@/components/admin/AdminNav";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type RiAnalyticsRow = {
  created_at: string;
  event_name: string;
  page_type: string | null;
  source_page_type: string | null;
  traffic_source: string | null;
  device_type: string | null;
};

function countBy<T extends string>(values: T[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function rowsFromCounts(counts: Record<string, number>) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        background: "#fff",
        minWidth: 160,
      }}
    >
      <div style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: "#111827" }}>{value}</div>
    </div>
  );
}

export default async function RiAnalyticsAdminPage() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await (supabaseAdmin.from("ri_analytics_events" as any) as any)
    .select("created_at,event_name,page_type,source_page_type,traffic_source,device_type")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(5000);

  const rows = ((data ?? []) as RiAnalyticsRow[]) || [];
  const eventCounts = rowsFromCounts(countBy(rows.map((row) => row.event_name)));
  const pageTypeCounts = rowsFromCounts(countBy(rows.map((row) => row.page_type || "unknown")));
  const sourcePageTypeCounts = rowsFromCounts(countBy(rows.map((row) => row.source_page_type || "unknown")));
  const trafficSourceCounts = rowsFromCounts(countBy(rows.map((row) => row.traffic_source || "unknown")));
  const deviceTypeCounts = rowsFromCounts(countBy(rows.map((row) => row.device_type || "unknown")));
  const sections: Array<{ label: string; items: Array<[string, number]> }> = [
    { label: "Top events", items: eventCounts },
    { label: "Page types", items: pageTypeCounts },
    { label: "Source page types", items: sourcePageTypeCounts },
    { label: "Traffic sources", items: trafficSourceCounts },
    { label: "Device types", items: deviceTypeCounts },
  ];

  return (
    <main className="pitchWrap">
      <section className="field">
        <AdminNav />
        <div className="headerBlock brandedHeader">
          <h1 className="title" style={{ fontSize: "2rem", fontWeight: 700 }}>
            RI Analytics
          </h1>
          <p className="subtitle" style={{ maxWidth: 760, fontSize: 14, lineHeight: 1.6 }}>
            First-party RefereeInsights action events persisted through the RI analytics API. This is the minimal TI-style
            operator surface: last 7 days only, no backfill, no local traffic.
          </p>
        </div>

        {error ? (
          <div style={{ color: "#991b1b", fontWeight: 600 }}>Failed to load RI analytics: {error.message}</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
              <Tile label="Window" value="7 days" />
              <Tile label="Events" value={rows.length} />
              <Tile label="Unique Events" value={eventCounts.length} />
              <Tile label="Latest" value={rows[0]?.created_at ? new Date(rows[0].created_at).toLocaleString() : "—"} />
            </div>

            <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
              {sections.map(({ label, items }) => (
                <section
                  key={label}
                  style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 14 }}
                >
                  <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>{label}</h2>
                  <div style={{ display: "grid", gap: 8 }}>
                    {(items as Array<[string, number]>).slice(0, 12).map(([name, count]) => (
                      <div
                        key={name}
                        style={{ display: "flex", justifyContent: "space-between", gap: 12, borderBottom: "1px solid #f3f4f6", paddingBottom: 6 }}
                      >
                        <span style={{ color: "#111827", fontSize: 13, overflowWrap: "anywhere" }}>{name}</span>
                        <strong style={{ color: "#0f172a" }}>{count}</strong>
                      </div>
                    ))}
                    {(items as Array<[string, number]>).length === 0 ? <span style={{ color: "#6b7280" }}>No events yet.</span> : null}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
