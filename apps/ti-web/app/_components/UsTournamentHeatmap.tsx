import { US_MAP_VIEWBOX, US_STATE_LABELS, US_STATE_PATHS } from "@/app/api/admin-dashboard-email/heatmap-us/usStatesMap";
import UsMapInteractions from "@/app/_components/UsMapInteractions";
import { colorForCount } from "@/lib/mapColor";

type PageType = "homepage" | "heatmap" | "directory" | "sport_directory" | "state_hub" | "metro_hub";
type VenuePageType = "venue_directory";
type AnyPageType = PageType | VenuePageType;

export default function UsTournamentHeatmap({
  countsByState,
  max,
  tipId,
  pageType,
  sport,
  hrefForState,
  defaultTip,
}: {
  countsByState: Record<string, number>;
  max: number;
  tipId: string;
  pageType: AnyPageType;
  sport: string;
  hrefForState: (abbr: string) => string;
  defaultTip?: string;
}) {
  const resolvedTip = (defaultTip ?? "Hover a state to see counts.").trim() || "Hover a state to see counts.";

  const hiddenLabels = new Set(["DC", "RI", "DE", "CT", "NJ", "MA", "VT", "NH"] as const);
  const labels = Object.entries(US_STATE_LABELS)
    .filter(([abbr]) => !hiddenLabels.has(abbr as any))
    .map(([abbr, pos]) => ({ abbr, x: pos.x, y: pos.y, count: countsByState[abbr] ?? 0 }));

  const safeMax = Number.isFinite(max) ? max : 0;

  return (
    <div className="ti-exploreByState">
      <div className="ti-exploreByStateHeader">
        <div className="ti-exploreByStateTitleRow">
          <span className="ti-exploreByStateTitle">Explore by State</span>
          <span id={tipId} className="ti-exploreByStateTipInline" suppressHydrationWarning>
            {resolvedTip}
          </span>
        </div>
        <div className="ti-exploreByStateMeta">Max {Math.max(0, safeMax).toLocaleString("en-US")}</div>
      </div>

      <svg
        viewBox={`0 0 ${US_MAP_VIEWBOX.width} ${US_MAP_VIEWBOX.height}`}
        width="100%"
        style={{ display: "block", margin: "8px auto 0", maxWidth: "none" }}
        role="img"
        aria-label={pageType === "venue_directory" ? "United States venue counts by state" : "United States tournament counts by state"}
      >
        {Object.keys(US_STATE_PATHS)
          .sort()
          .map((abbr) => {
            const d = US_STATE_PATHS[abbr];
            const count = countsByState[abbr] ?? 0;
            const fill = safeMax <= 0 ? "#f1f5f9" : colorForCount(count, safeMax);
            const href = hrefForState(abbr);
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
                style={{ paintOrder: "stroke", stroke: "rgba(255,255,255,0.92)", strokeWidth: 3 }}
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
                  style={{ paintOrder: "stroke", stroke: "rgba(255,255,255,0.92)", strokeWidth: 3 }}
                >
                  {l.count.toLocaleString("en-US")}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      <UsMapInteractions tipId={tipId} pageType={pageType} sport={sport} defaultTip={resolvedTip} />
    </div>
  );
}
