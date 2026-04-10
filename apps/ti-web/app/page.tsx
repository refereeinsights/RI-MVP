import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { curatedSports, mapStateCodeToSlug, normalizeSportSlug, sportDisplayName } from "@/lib/seoHub";
import { US_MAP_VIEWBOX, US_STATE_LABELS, US_STATE_PATHS } from "@/app/api/admin-dashboard-email/heatmap-us/usStatesMap";
import UsMapInteractions from "@/app/_components/UsMapInteractions";
import HomepageSportFilter from "@/components/homepage/HomepageSportFilter";
import TrackedLink from "@/components/homepage/TrackedLink";
import "./home.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.tournamentinsights.com"),
  title: {
    absolute: "TournamentInsights | Find Youth Sports Tournaments Near You",
  },
  description:
    "Find verified youth sports tournaments near you. Explore upcoming events on an interactive map, compare weekends faster, and plan with better venue insight.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "TournamentInsights | Find Youth Sports Tournaments Near You",
    description:
      "Explore verified youth sports tournaments on an interactive map and quickly find the right weekends, locations, and events.",
    url: "https://www.tournamentinsights.com",
    siteName: "TournamentInsights",
    type: "website",
    images: [
      {
        url: "/og/ti-og-premium.jpg",
        width: 1200,
        height: 630,
        alt: "TournamentInsights — Verified Youth Sports Tournaments",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "TournamentInsights | Find Youth Sports Tournaments Near You",
    description:
      "Explore verified youth sports tournaments on an interactive map and quickly find the right weekends, locations, and events.",
    images: ["/og/ti-og-premium.jpg"],
  },
};

export const revalidate = 300;

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

export default async function Home({ searchParams }: { searchParams?: { sport?: string } }) {
  const sportParam = (searchParams?.sport ?? "all").trim().toLowerCase();
  const sportKey = sportParam === "all" ? null : normalizeSportSlug(sportParam);
  const sportLabel = sportKey ? sportDisplayName(sportKey) : "All sports";

  const { data, error } = await (supabaseAdmin.rpc("get_public_directory_tournament_counts_by_state_sport" as any, {
    p_sport: sportKey,
  }) as any);
  if (error) {
    throw new Error(`Failed to load homepage heatmap counts: ${error.message}`);
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

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "TournamentInsights",
    url: "https://www.tournamentinsights.com",
    description:
      "Verified youth sports tournament directory for families, coaches, and teams.",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate:
          "https://www.tournamentinsights.com/tournaments?q={search_term_string}",
      },
      "query-input": "required name=search_term_string",
    },
  };

  const sportOptions = [
    { value: "all", label: "All sports" },
    ...curatedSports.map((s) => ({ value: s.slug, label: s.name })),
  ];

  return (
    <main className="ti-home">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="ti-home-hero" aria-labelledby="ti-home-title">
        <div className="ti-home-heroLeft">
          <h1 id="ti-home-title">Find youth sports tournaments near you</h1>
          <p>
            Explore verified tournaments on an interactive map and quickly find the right weekends, locations, and events — without
            digging through dozens of tabs.
          </p>

          <div className="ti-home-actions" aria-label="Map actions">
            <TrackedLink
              href="/heatmap?sport=all"
              className="ti-home-ctaPrimary"
              event={{ name: "homepage_cta_clicked", properties: { cta: "explore_map" } }}
            >
              Explore the map
            </TrackedLink>
            <HomepageSportFilter value={sportParam || "all"} options={sportOptions} showLabel={false} variant="compact" />
            <TrackedLink
              href="/tournaments"
              className="ti-home-secondaryLink"
              event={{ name: "homepage_cta_clicked", properties: { cta: "browse_tournaments" } }}
            >
              Browse tournaments
            </TrackedLink>
          </div>

          <div className="ti-home-trustStrip" aria-label="Trust highlights">
            <div className="ti-home-trustPill">Verified websites</div>
            <div className="ti-home-trustPill">Clear dates & locations</div>
            <div className="ti-home-trustPill">Built for real planning</div>
          </div>
        </div>

        <section className="ti-home-mapCard" aria-label="Tournament map">
          <div className="ti-home-mapCardHeader">
            <div className="ti-home-mapCardHeaderTitle">
              <span>Tournament Map</span>
              <span>{sportLabel} · Click a state to browse tournaments</span>
            </div>
            <div style={{ fontSize: 12, color: "#64748b" }}>Max {max.toLocaleString("en-US")}</div>
          </div>

          <div style={{ padding: 14 }}>
            <div id="ti-home-map-tip" style={{ fontSize: 13, color: "#0f172a", minHeight: 18 }} suppressHydrationWarning>
              Hover a state to see counts.
            </div>
            <svg
              viewBox={`0 0 ${US_MAP_VIEWBOX.width} ${US_MAP_VIEWBOX.height}`}
              width="100%"
              style={{ display: "block", margin: "10px auto 0", maxWidth: "none" }}
              role="img"
              aria-label="United States tournament counts by state"
            >
              {Object.keys(US_STATE_PATHS)
                .sort()
                .map((abbr) => {
                  const d = US_STATE_PATHS[abbr];
                  const count = counts[abbr] ?? 0;
                  const fill = colorForCount(count, max);

                  const stateSlug = mapStateCodeToSlug(abbr) ?? abbr.toLowerCase();
                  const href = sportKey
                    ? `/tournaments?state=${encodeURIComponent(abbr)}&sports=${encodeURIComponent(sportKey)}`
                    : `/tournaments?state=${encodeURIComponent(abbr)}`;

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
              {Object.entries(US_STATE_LABELS).map(([abbr, pos]) => {
                const count = counts[abbr] ?? 0;
                const showCount = count > 0;
                const hidden = new Set(["DC", "RI", "DE", "CT", "NJ", "MA", "VT", "NH"] as const);
                if (hidden.has(abbr as any)) return null;

                return (
                  <g key={`${abbr}-label`} pointerEvents="none">
                    <text
                      x={pos.x}
                      y={pos.y - (showCount ? 4 : 0)}
                      textAnchor="middle"
                      fontSize={12}
                      fontWeight={900}
                      fill="#0f172a"
                      style={{ paintOrder: "stroke", stroke: "rgba(255,255,255,0.92)", strokeWidth: 3 }}
                    >
                      {abbr}
                    </text>
                    {showCount ? (
                      <text
                        x={pos.x}
                        y={pos.y + 12}
                        textAnchor="middle"
                        fontSize={11}
                        fontWeight={800}
                        fill="#334155"
                        style={{ paintOrder: "stroke", stroke: "rgba(255,255,255,0.92)", strokeWidth: 3 }}
                      >
                        {count.toLocaleString("en-US")}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>
          </div>

          <UsMapInteractions
            tipId="ti-home-map-tip"
            pageType="homepage"
            sport={sportParam || "all"}
            defaultTip="Hover a state to see counts."
          />
        </section>
      </section>

      <section className="ti-home-section" aria-labelledby="ti-home-start">
        <h2 id="ti-home-start">Start with your sport</h2>
        <div className="ti-home-chips" role="list" aria-label="Sport map shortcuts">
          {curatedSports.map((sport) => (
            <TrackedLink
              key={sport.key}
              href={`/heatmap?sport=${encodeURIComponent(sport.slug)}`}
              className="ti-home-chip"
              event={{ name: "homepage_sport_chip_clicked", properties: { sport: sport.slug } }}
            >
              {sport.name}
            </TrackedLink>
          ))}
        </div>
        <div style={{ marginTop: 12, fontSize: 13, color: "#64748b" }}>
          Prefer browsing? Use the{" "}
          <a href="/tournaments" style={{ textDecoration: "underline" }}>
            tournament directory
          </a>{" "}
          to filter by sport, state, and month.
        </div>
      </section>

      <section className="ti-home-section" aria-labelledby="ti-home-plan">
        <h2 id="ti-home-plan">Plan tournament weekends faster</h2>
        <div className="ti-home-cards">
          <div className="ti-home-card">
            <h3>See tournaments visually</h3>
            <p>Find hotspots quickly and get a clear sense of where weekends are stacked.</p>
          </div>
          <div className="ti-home-card">
            <h3>Compare weekends faster</h3>
            <p>Filter by sport and drill into states to review dates, locations, and official links.</p>
          </div>
          <div className="ti-home-card">
            <h3>Plan with better venue insight</h3>
            <p>Premium Owl&apos;s Eye™ venue intelligence helps reduce guesswork on tournament travel days.</p>
          </div>
        </div>
      </section>

      <section className="ti-home-section" aria-labelledby="ti-home-owl">
        <div style={{ display: "grid", gap: 12, justifyItems: "center", textAlign: "center" }}>
          <img
            src="/svg/ri/owls_eye_badge.svg"
            alt="Owl's Eye badge"
            width={86}
            height={86}
            style={{ width: 86, height: 86 }}
          />
          <h2 id="ti-home-owl" style={{ margin: 0 }}>
            Level up your planning with Owl&apos;s Eye™
          </h2>
          <p style={{ margin: 0, maxWidth: "62ch", color: "#475569", lineHeight: 1.6 }}>
            Owl&apos;s Eye™ identifies tournaments with enhanced venue intelligence — verified addresses, nearby coffee/food/hotels,
            mobile directions, and structured Insider venue insights.
          </p>
          <div className="ti-home-chips" aria-label="Premium shortcuts">
            <a className="ti-home-chip" href="/premium">
              Learn about Premium
            </a>
            <a className="ti-home-chip" href="/tournaments">
              Browse tournaments
            </a>
          </div>
        </div>
      </section>

      <section className="ti-home-section" aria-labelledby="ti-home-browse">
        <h2 id="ti-home-browse">Browse (SEO)</h2>
        <div className="ti-home-seoLinks" aria-label="Browse links">
          <a href="/tournaments">Tournament Directory</a>
          <a href="/venues">Venue Insights</a>
          {curatedSports.slice(0, 8).map((sport) => (
            <a key={sport.key} href={`/tournaments/${sport.slug}`}>
              {sport.name}
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
