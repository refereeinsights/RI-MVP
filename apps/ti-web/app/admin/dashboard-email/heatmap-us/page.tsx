import { requireTiOutreachAdmin } from "@/lib/outreachAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveTiBaseUrl } from "@/lib/adminDashboardEmail";
import { US_MAP_VIEWBOX, US_STATE_PATHS } from "@/app/api/admin-dashboard-email/heatmap-us/usStatesMap";

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

function tokenizePath(d: string) {
  const re = /([a-zA-Z])|(-?(?:\d+\.\d+|\d+|\.\d+)(?:e[-+]?\d+)?)/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) out.push(m[1] ?? m[2]);
  return out;
}

function centroidForPath(d: string): { x: number; y: number } | null {
  const tokens = tokenizePath(d);
  let i = 0;
  let cmd: string | null = null;
  let x = 0;
  let y = 0;
  let subpathStartX = 0;
  let subpathStartY = 0;

  let ring: Array<{ x: number; y: number }> = [];
  const rings: Array<Array<{ x: number; y: number }>> = [];

  const isCmd = (t: string) => /[a-zA-Z]/.test(t);
  const nextNum = () => Number(tokens[i++]);
  const pushRing = () => {
    if (ring.length >= 3) rings.push(ring);
    ring = [];
  };

  while (i < tokens.length) {
    const t = tokens[i++];
    if (isCmd(t)) cmd = t;
    else i--;
    if (!cmd) return null;

    switch (cmd) {
      case "M":
      case "m": {
        pushRing();
        const nx = nextNum();
        const ny = nextNum();
        if (cmd === "m") {
          x += nx;
          y += ny;
        } else {
          x = nx;
          y = ny;
        }
        subpathStartX = x;
        subpathStartY = y;
        ring.push({ x, y });
        while (i < tokens.length && !isCmd(tokens[i])) {
          const px = nextNum();
          const py = nextNum();
          if (cmd === "m") {
            x += px;
            y += py;
          } else {
            x = px;
            y = py;
          }
          ring.push({ x, y });
        }
        break;
      }
      case "L":
      case "l": {
        while (i < tokens.length && !isCmd(tokens[i])) {
          const px = nextNum();
          const py = nextNum();
          if (cmd === "l") {
            x += px;
            y += py;
          } else {
            x = px;
            y = py;
          }
          ring.push({ x, y });
        }
        break;
      }
      case "H":
      case "h": {
        while (i < tokens.length && !isCmd(tokens[i])) {
          const px = nextNum();
          x = cmd === "h" ? x + px : px;
          ring.push({ x, y });
        }
        break;
      }
      case "V":
      case "v": {
        while (i < tokens.length && !isCmd(tokens[i])) {
          const py = nextNum();
          y = cmd === "v" ? y + py : py;
          ring.push({ x, y });
        }
        break;
      }
      case "Z":
      case "z":
        x = subpathStartX;
        y = subpathStartY;
        pushRing();
        break;
      default:
        return null;
    }
  }
  pushRing();

  let sumArea = 0;
  let sumCx = 0;
  let sumCy = 0;

  for (const pts of rings) {
    let area2 = 0;
    let cx6 = 0;
    let cy6 = 0;
    for (let j = 0; j < pts.length; j++) {
      const a = pts[j];
      const b = pts[(j + 1) % pts.length];
      const cross = a.x * b.y - b.x * a.y;
      area2 += cross;
      cx6 += (a.x + b.x) * cross;
      cy6 += (a.y + b.y) * cross;
    }
    if (area2 === 0) continue;
    const area = area2 / 2;
    const cx = cx6 / (3 * area2);
    const cy = cy6 / (3 * area2);
    const w = Math.abs(area);
    sumArea += w;
    sumCx += cx * w;
    sumCy += cy * w;
  }

  if (!sumArea) return null;
  return { x: sumCx / sumArea, y: sumCy / sumArea };
}

export default async function AdminDashboardEmailHeatmapUsPage({
  searchParams,
}: {
  searchParams?: { scope?: string };
}) {
  await requireTiOutreachAdmin("/admin/dashboard-email/heatmap-us");

  const scope = (searchParams?.scope ?? "public_directory").trim();
  if (scope !== "public_directory") {
    return <div style={{ padding: 24 }}>Invalid scope.</div>;
  }

  const { data, error } = await (supabaseAdmin.rpc("get_public_directory_tournament_counts_by_state" as any, {}) as any);
  if (error) {
    return <div style={{ padding: 24 }}>Failed to load state counts: {String(error.message ?? error)}</div>;
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
  const generatedAt = new Date();

  const baseUrl = resolveTiBaseUrl();
  const imageUrl = `${baseUrl}/api/admin-dashboard-email/heatmap-us?scope=public_directory`;
  const jsonUrl = `${baseUrl}/api/admin-dashboard-email/heatmap-us/data?scope=public_directory`;

  const labelStates = Object.keys(US_STATE_PATHS).filter((abbr) => !["DC", "RI", "DE", "CT", "NJ", "MA"].includes(abbr));
  const labels = labelStates
    .map((abbr) => {
      const d = US_STATE_PATHS[abbr];
      const c = centroidForPath(d);
      if (!c) return null;
      return { abbr, x: c.x, y: c.y, count: counts[abbr] ?? 0 };
    })
    .filter(Boolean) as Array<{ abbr: string; x: number; y: number; count: number }>;

  return (
    <div style={{ padding: 24, background: "#f8fafc", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <h1 style={{ margin: 0, fontSize: 20 }}>US Tournament Map (Interactive)</h1>
            <div style={{ color: "#64748b", fontSize: 12 }}>
              Generated: {generatedAt.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}
            </div>
          </div>
          <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
            <a href={imageUrl} style={{ color: "#1d4ed8", fontSize: 12 }}>
              View image version
            </a>
            <a href={jsonUrl} style={{ color: "#1d4ed8", fontSize: 12 }}>
              View data (JSON)
            </a>
          </div>
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
          <div id="tip" style={{ fontSize: 13, color: "#0f172a", minHeight: 20 }} />

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
                const title = `${abbr} — ${count.toLocaleString()} upcoming`;
                return (
                  <path
                    key={abbr}
                    d={d}
                    fill={fill}
                    stroke="#ffffff"
                    strokeWidth={1}
                    data-abbr={abbr}
                    data-count={count}
                  >
                    <title>{title}</title>
                  </path>
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
                      {l.count}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>

          <div style={{ marginTop: 12, fontSize: 12, color: "#64748b" }}>
            Hover a state to see its count. Colors are log-scaled from 1 to max ({max}).
          </div>
        </div>

        <script
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                const tip = document.getElementById('tip');
                if(!tip) return;
                const svg = document.querySelector('svg');
                if(!svg) return;
                const onMove = (e) => {
                  const t = e.target;
                  if(!(t instanceof SVGPathElement)) return;
                  const abbr = t.getAttribute('data-abbr') || '';
                  const count = t.getAttribute('data-count') || '0';
                  tip.textContent = abbr + ' — ' + Number(count).toLocaleString() + ' upcoming tournaments';
                };
                const onOut = () => { tip.textContent = ''; };
                svg.addEventListener('mousemove', onMove);
                svg.addEventListener('mouseleave', onOut);
              })();
            `,
          }}
        />
      </div>
    </div>
  );
}
