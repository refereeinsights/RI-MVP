import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { curatedSports, mapStateCodeToSlug, normalizeSportSlug, sportDisplayName } from "@/lib/seoHub";
import { US_MAP_VIEWBOX, US_STATE_LABELS, US_STATE_PATHS } from "@/app/api/admin-dashboard-email/heatmap-us/usStatesMap";
import SportFilter from "./SportFilter";
import UsMapInteractions from "@/app/_components/UsMapInteractions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(rgb: { r: number; g: number; b: number }) {
  const to = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
  return `#${to(rgb.r)}${to(rgb.g)}${to(rgb.b)}`;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpColor(a: string, b: string, t: number) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex({ r: lerp(A.r, B.r, t), g: lerp(A.g, B.g, t), b: lerp(A.b, B.b, t) });
}

function colorForCount(count: number, max: number) {
  if (!count) return "#f1f5f9"; // slate-100
  const denom = Math.log(max + 1) || 1;
  const t = clamp(Math.log(count + 1) / denom, 0, 1);
  return lerpColor("#dcfce7", "#166534", t); // green-100 -> green-800
}

export default async function PublicHeatmapPage({
  searchParams,
}: {
  searchParams?: { sport?: string };
}) {
  const sportParam = (searchParams?.sport ?? "all").trim().toLowerCase();
  const sportKey = sportParam === "all" ? null : normalizeSportSlug(sportParam);
  const sportLabel = sportKey ? sportDisplayName(sportKey) : "All sports";

  const { data, error } = await (supabaseAdmin.rpc("get_public_directory_tournament_counts_by_state_sport" as any, {
    p_sport: sportKey,
  }) as any);
  if (error) {
    throw new Error(`Failed to load heatmap counts: ${error.message}`);
  }

  const rows = (Array.isArray(data) ? data : []) as Array<{ state?: unknown; count?: unknown }>;
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const state = String(row.state ?? "").trim().toUpperCase();
    const count = Number(row.count ?? 0) || 0;
    if (!state || state.length !== 2) continue;
    counts[state] = count;
  }
  const max = Math.max(1, ...Object.values(counts));

  const now = new Date();
  const generatedAt = now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" });

  const hiddenLabels = new Set(["DC", "RI", "DE", "CT", "NJ", "MA", "VT", "NH"] as const);
  const labels = Object.entries(US_STATE_LABELS)
    .filter(([abbr]) => !hiddenLabels.has(abbr as any))
    .map(([abbr, pos]) => ({ abbr, x: pos.x, y: pos.y, count: counts[abbr] ?? 0 }));

  const sportOptions = [
    { value: "all", label: "All sports" },
    ...curatedSports.map((s) => ({ value: s.slug, label: s.name })),
  ];

  return (
    <main style={{ background: "#f8fafc", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 6 }}>
            <h1 style={{ margin: 0, fontSize: 22 }}>US Tournament Map</h1>
            <div style={{ color: "#64748b", fontSize: 12 }}>
              {sportLabel} · Generated {generatedAt}
            </div>
          </div>

          <SportFilter value={sportParam} options={sportOptions} />
        </div>

        <div
          style={{
            marginTop: 16,
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: 16,
          }}
        >
          <div style={{ fontSize: 13, color: "#0f172a", minHeight: 20 }} id="tip" suppressHydrationWarning>
            Click a state to open the tournament directory.
          </div>

          <svg
            viewBox={`0 0 ${US_MAP_VIEWBOX.width} ${US_MAP_VIEWBOX.height}`}
            width="100%"
            style={{ display: "block", maxWidth: 1000, margin: "0 auto" }}
          >
            {Object.keys(US_STATE_PATHS)
              .sort()
              .map((abbr) => {
                const d = US_STATE_PATHS[abbr];
                const count = counts[abbr] ?? 0;
                const fill = colorForCount(count, max);

                const stateSlug = mapStateCodeToSlug(abbr) ?? abbr.toLowerCase();
                const href = sportKey ? `/${sportKey}/${stateSlug}` : `/tournaments?state=${encodeURIComponent(abbr)}`;

                return (
                  <path
                    key={abbr}
                    d={d}
                    fill={fill}
                    stroke="#ffffff"
                    strokeWidth={1}
                    className="ti-map-state"
                    data-abbr={abbr}
                    data-count={count}
                    data-href={href}
                    style={{ cursor: "pointer" }}
                  />
                );
              })}
            {labels.map((l) => {
              const showCount = l.count > 0;
              return (
                <g key={`${l.abbr}-label`} pointerEvents="none">
                  <text
                    x={l.x}
                    y={l.y - (showCount ? 4 : 0)}
                    textAnchor="middle"
                    fontSize={12}
                    fontWeight={800}
                    fill="#0f172a"
                    style={{ paintOrder: "stroke", stroke: "rgba(255,255,255,0.9)", strokeWidth: 3 }}
                  >
                    {l.abbr}
                  </text>
                  {showCount ? (
                    <text
                      x={l.x}
                      y={l.y + 12}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight={700}
                      fill="#334155"
                      style={{ paintOrder: "stroke", stroke: "rgba(255,255,255,0.9)", strokeWidth: 3 }}
                    >
                      {l.count.toLocaleString("en-US")}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>

          <div style={{ marginTop: 12, fontSize: 12, color: "#64748b" }}>
            Colors are log-scaled for readability (1 → max {max}). Counts reflect the public directory upcoming definition
            (published + canonical + upcoming, plus demos).
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
            Small states:{" "}
            {Array.from(hiddenLabels)
              .sort()
              .map((s) => `${s} ${(counts[s] ?? 0).toLocaleString("en-US")}`)
              .join(" · ")}
          </div>
        </div>

        <UsMapInteractions
          tipId="tip"
          pageType="heatmap"
          sport={sportParam || "all"}
          defaultTip="Click a state to open the tournament directory."
        />
      </div>
    </main>
  );
}
