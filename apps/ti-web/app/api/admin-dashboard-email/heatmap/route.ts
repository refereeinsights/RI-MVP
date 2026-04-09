import { ImageResponse } from "next/og";
import React from "react";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveTiBaseUrl } from "@/lib/adminDashboardEmail";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type StateCountRow = { state: string; count: number };

const GRID: Array<{ state: string; x: number; y: number }> = [
  // Row 0
  { state: "WA", x: 0, y: 0 }, { state: "ID", x: 1, y: 0 }, { state: "MT", x: 2, y: 0 }, { state: "ND", x: 3, y: 0 }, { state: "MN", x: 4, y: 0 }, { state: "WI", x: 5, y: 0 }, { state: "MI", x: 6, y: 0 }, { state: "VT", x: 9, y: 0 }, { state: "NH", x: 10, y: 0 }, { state: "ME", x: 11, y: 0 },
  // Row 1
  { state: "OR", x: 0, y: 1 }, { state: "NV", x: 1, y: 1 }, { state: "WY", x: 2, y: 1 }, { state: "SD", x: 3, y: 1 }, { state: "IA", x: 4, y: 1 }, { state: "IL", x: 5, y: 1 }, { state: "IN", x: 6, y: 1 }, { state: "OH", x: 7, y: 1 }, { state: "PA", x: 8, y: 1 }, { state: "NY", x: 9, y: 1 }, { state: "MA", x: 10, y: 1 }, { state: "RI", x: 11, y: 1 },
  // Row 2
  { state: "CA", x: 0, y: 2 }, { state: "UT", x: 1, y: 2 }, { state: "CO", x: 2, y: 2 }, { state: "NE", x: 3, y: 2 }, { state: "MO", x: 4, y: 2 }, { state: "KY", x: 5, y: 2 }, { state: "WV", x: 6, y: 2 }, { state: "VA", x: 7, y: 2 }, { state: "MD", x: 8, y: 2 }, { state: "NJ", x: 9, y: 2 }, { state: "CT", x: 10, y: 2 }, { state: "DE", x: 11, y: 2 },
  // Row 3
  { state: "AZ", x: 0, y: 3 }, { state: "NM", x: 1, y: 3 }, { state: "KS", x: 2, y: 3 }, { state: "AR", x: 3, y: 3 }, { state: "TN", x: 4, y: 3 }, { state: "NC", x: 5, y: 3 }, { state: "SC", x: 6, y: 3 }, { state: "DC", x: 7, y: 3 },
  // Row 4
  { state: "OK", x: 0, y: 4 }, { state: "TX", x: 1, y: 4 }, { state: "LA", x: 2, y: 4 }, { state: "MS", x: 3, y: 4 }, { state: "AL", x: 4, y: 4 }, { state: "GA", x: 5, y: 4 },
  // Row 5
  { state: "FL", x: 6, y: 5 },
  // Off-map
  { state: "AK", x: 0, y: 6 }, { state: "HI", x: 1, y: 6 },
];

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
  return lerpColor("#dbeafe", "#1d4ed8", t); // blue-100 -> blue-700
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

  const cell = 54;
  const gap = 6;
  const gridW = 12;
  const gridH = 7;
  const mapW = gridW * cell + (gridW - 1) * gap;
  const mapH = gridH * cell + (gridH - 1) * gap;

  const baseUrl = resolveTiBaseUrl();
  const title = "US Tournament Heatmap (Public Directory · Upcoming)";
  const subtitle = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });

  const h = React.createElement;
  const hostLabel = baseUrl.replace(/^https?:\/\//, "");

  const mapGrid = h(
    "div",
    {
      style: {
        width: mapW,
        height: mapH,
        display: "block",
        position: "relative",
        borderRadius: 16,
        border: "1px solid #e2e8f0",
        padding: 18,
        background: "#f8fafc",
      },
    },
    GRID.map((pos) => {
      const count = counts.get(pos.state) ?? 0;
      const bg = colorForCount(count, max);
      const left = pos.x * (cell + gap);
      const top = pos.y * (cell + gap);
      return h(
        "div",
        {
          key: pos.state,
          style: {
            position: "absolute",
            left,
            top,
            width: cell,
            height: cell,
            borderRadius: 12,
            background: bg,
            border: "1px solid #cbd5e1",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            lineHeight: 1.05,
          },
        },
        [
          h("div", { key: `${pos.state}-abbr`, style: { fontSize: 16, fontWeight: 900, color: "#0f172a" } }, pos.state),
          h(
            "div",
            { key: `${pos.state}-count`, style: { fontSize: 14, fontWeight: 800, color: "#334155" } },
            count ? String(count) : "",
          ),
        ],
      );
    }),
  );

  const legendRow = (color: string, label: string, border = "#cbd5e1") =>
    h(
      "div",
      { key: `legend-${label}`, style: { display: "flex", alignItems: "center", gap: 10 } },
      [
        h("div", {
          key: `swatch-${label}`,
          style: { width: 22, height: 22, borderRadius: 6, background: color, border: `1px solid ${border}` },
        }),
        h("div", { key: `label-${label}`, style: { fontSize: 14, color: "#334155" } }, label),
      ],
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
            { key: "title", style: { display: "flex", flexDirection: "column", gap: 6 } },
            [
              h("div", { key: "titleText", style: { fontSize: 34, fontWeight: 900 } }, title),
              h("div", { key: "subtitleText", style: { fontSize: 18, color: "#475569" } }, subtitle),
            ],
          ),
          h("div", { key: "host", style: { fontSize: 14, color: "#64748b" } }, hostLabel),
        ],
      ),
      h(
        "div",
        { key: "body", style: { display: "flex", gap: 28, marginTop: 28, alignItems: "flex-start" } },
        [
          h("div", { key: "map" }, mapGrid),
          h(
            "div",
            { key: "legend", style: { flex: 1, display: "flex", flexDirection: "column", gap: 14 } },
            [
              h("div", { key: "legendTitle", style: { fontSize: 16, fontWeight: 900 } }, "Legend"),
              legendRow("#f1f5f9", "0 tournaments"),
              legendRow("#dbeafe", "low"),
              legendRow("#1d4ed8", `high (max ${max})`, "#1e40af"),
              h(
                "div",
                { key: "legendNote", style: { marginTop: 10, fontSize: 12, color: "#64748b", lineHeight: 1.4 } },
                "Counts reflect the TI public directory default (published + canonical + upcoming).",
              ),
            ],
          ),
        ],
      ),
    ],
  );

  return new ImageResponse(
    element,
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": "public, max-age=21600, s-maxage=21600, stale-while-revalidate=86400",
      },
    },
  );
}
