import { ImageResponse } from "next/og";
import React from "react";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveTiBaseUrl } from "@/lib/adminDashboardEmail";
import { US_MAP_VIEWBOX, US_STATE_PATHS } from "./usStatesMap";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const HIDDEN_STATES = new Set(["DC", "RI", "DE", "CT", "NJ", "MA", "VT", "NH"] as const);

const LABEL_OVERRIDES: Record<string, { dx?: number; dy?: number; showCount?: boolean }> = {
  // Border / coastline states where the bbox-center tends to feel "too close" to the edge.
  WA: { dy: 14 },
  ME: { dy: 10 },
  FL: { dy: -18 },
  MI: { dy: -8 },
};

function tokenizePath(d: string) {
  const re = /([a-zA-Z])|(-?(?:\d+\.\d+|\d+|\.\d+)(?:e[-+]?\d+)?)/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) out.push(m[1] ?? m[2]);
  return out;
}

function centroidForPath(d: string): { x: number; y: number } | null {
  // Supports only straight-line paths (M/m, L/l, H/h, V/v, Z/z).
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
    if (isCmd(t)) {
      cmd = t;
    } else {
      i--;
    }
    if (!cmd) return null;

    switch (cmd) {
      case "M":
      case "m": {
        // Start new subpath
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
        // Subsequent pairs are implicit L/l
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
        // Closing a path resets the current point to the start point of the subpath.
        x = subpathStartX;
        y = subpathStartY;
        pushRing();
        break;
      default:
        // Unsupported path command (curves etc.)
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
  // green-100 -> green-800
  return lerpColor("#dcfce7", "#166534", t);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const scope = (url.searchParams.get("scope") ?? "public_directory").trim();
  if (scope !== "public_directory") {
    return new Response("invalid scope", { status: 400 });
  }

  const { data, error } = await (supabaseAdmin.rpc("get_public_directory_tournament_counts_by_state" as any, {}) as any);
  if (error) {
    return new Response(error.message || "Failed to load state counts.", { status: 500 });
  }

  const rows = (Array.isArray(data) ? data : []) as Array<{ state?: unknown; count?: unknown }>;
  const counts = new Map<string, number>();
  for (const row of rows) {
    const state = String(row.state ?? "").trim().toUpperCase();
    const count = Number(row.count ?? 0) || 0;
    if (!state || state.length !== 2) continue;
    counts.set(state, count);
  }
  const max = Math.max(1, ...Array.from(counts.values()));
  const topStates = new Set(
    Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 15)
      .map(([abbr]) => abbr),
  );

  const baseUrl = resolveTiBaseUrl();
  const hostLabel = baseUrl.replace(/^https?:\/\//, "");
  const title = "US Tournament Map (Map)";
  const subtitle = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });

  const mapW = 980;
  const mapH = 520;
  const viewBox = `0 0 ${US_MAP_VIEWBOX.width} ${US_MAP_VIEWBOX.height}`;
  const viewW = US_MAP_VIEWBOX.width;
  const viewH = US_MAP_VIEWBOX.height;

  // Keep label overlay aligned with the SVG's preserveAspectRatio="xMidYMid meet" behavior.
  const scale = Math.min(mapW / viewW, mapH / viewH);
  const renderedW = viewW * scale;
  const renderedH = viewH * scale;
  const padX = (mapW - renderedW) / 2;
  const padY = (mapH - renderedH) / 2;

  const h = React.createElement;

  const statePaths = Object.keys(US_STATE_PATHS)
    .sort()
    .map((abbr) => {
      const d = US_STATE_PATHS[abbr];
      const count = counts.get(abbr) ?? 0;
      const fill = colorForCount(count, max);
      return h("path", { key: abbr, d, fill, stroke: "#ffffff", strokeWidth: 1 });
    });

  const svg = h(
    "svg",
    {
      width: mapW,
      height: mapH,
      viewBox,
      preserveAspectRatio: "xMidYMid meet",
      style: { display: "flex" },
    },
    statePaths,
  );

  // @vercel/og does not support SVG <text>. Render labels as HTML overlay instead.
  const labelPositions = Object.fromEntries(
    Object.keys(US_STATE_PATHS).map((abbr) => {
      const d = US_STATE_PATHS[abbr];
      const c = centroidForPath(d);
      return [abbr, c ?? { x: viewW / 2, y: viewH / 2 }];
    }),
  ) as Record<string, { x: number; y: number }>;

  const labelOverlay = h(
    "div",
    {
      key: "labels",
      style: {
        position: "absolute",
        left: 0,
        top: 0,
        width: mapW,
        height: mapH,
        display: "flex",
      },
    },
    Object.keys(labelPositions)
      .sort()
      .map((abbr) => {
        const pos = labelPositions[abbr];
        const count = counts.get(abbr) ?? 0;
        if (HIDDEN_STATES.has(abbr as any)) return null;

        const override = LABEL_OVERRIDES[abbr] ?? {};
        const showCount = override.showCount ?? (count > 0 && topStates.has(abbr));

        const x = padX + pos.x * scale;
        const y = padY + pos.y * scale;

        const labelWidth = showCount ? 46 : 30;
        const labelHeight = showCount ? 28 : 18;
        const dx = override.dx ?? 0;
        const dy = override.dy ?? 0;

        return h(
          "div",
          {
            key: `${abbr}-label`,
            style: {
              position: "absolute",
              left: x,
              top: y,
              width: labelWidth,
              marginLeft: -labelWidth / 2 + dx,
              marginTop: -labelHeight / 2 + dy,
              paddingTop: 2,
              paddingBottom: 2,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              lineHeight: 1.05,
              color: "#0f172a",
              background: showCount ? "rgba(255,255,255,0.70)" : "rgba(255,255,255,0.35)",
              border: showCount ? "1px solid rgba(15,23,42,0.12)" : "1px solid rgba(15,23,42,0.08)",
              borderRadius: 8,
            },
          },
          [
            h(
              "div",
              {
                key: `${abbr}-abbr`,
                style: { display: "flex", fontSize: showCount ? 11 : 10, fontWeight: 900 },
              },
              abbr,
            ),
            showCount
              ? h(
                  "div",
                  { key: `${abbr}-count`, style: { display: "flex", fontSize: 11, fontWeight: 900, color: "#334155" } },
                  String(count),
                )
              : null,
          ].filter(Boolean),
        );
      })
      .filter(Boolean),
  );

  const element = h(
    "div",
    {
      style: {
        width: 1200,
        height: 630,
        display: "flex",
        flexDirection: "column",
        padding: 40,
        background: "#ffffff",
        color: "#0f172a",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
      },
    },
    [
      h(
        "div",
        { key: "header", style: { display: "flex", justifyContent: "space-between", alignItems: "baseline" } },
        [
          h(
            "div",
            { key: "titles", style: { display: "flex", flexDirection: "column", gap: 6 } },
            [
              h("div", { key: "title", style: { display: "flex", fontSize: 34, fontWeight: 900 } }, title),
              h("div", { key: "subtitle", style: { display: "flex", fontSize: 18, color: "#475569" } }, subtitle),
            ],
          ),
          h("div", { key: "host", style: { display: "flex", fontSize: 14, color: "#64748b" } }, hostLabel),
        ],
      ),
      h(
        "div",
        { key: "mapRow", style: { display: "flex", marginTop: 26, justifyContent: "center" } },
        h(
          "div",
          {
            style: {
              display: "flex",
              padding: 18,
              borderRadius: 16,
              border: "1px solid #e2e8f0",
              background: "#f8fafc",
              position: "relative",
            },
          },
          [svg, labelOverlay],
        ),
      ),
      h(
        "div",
        { key: "note", style: { display: "flex", marginTop: 16, fontSize: 12, color: "#64748b" } },
        `Counts reflect the TI public directory default (published + canonical + upcoming). Max: ${String(max)}.`,
      ),
      h(
        "div",
        { key: "smallStates", style: { display: "flex", marginTop: 8, fontSize: 12, color: "#64748b" } },
        `Small states: ${Array.from(HIDDEN_STATES)
          .sort()
          .map((s) => `${s} ${String(counts.get(s) ?? 0)}`)
          .join(" · ")}`,
      ),
    ],
  );

  return new ImageResponse(element, {
    width: 1200,
    height: 630,
    headers: {
      "Cache-Control": "public, max-age=21600, s-maxage=21600, stale-while-revalidate=86400",
    },
  });
}
