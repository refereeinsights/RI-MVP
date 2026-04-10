"use client";

import { useEffect } from "react";

function send(event: string, properties: Record<string, unknown>) {
  try {
    const body = JSON.stringify({ event, properties });
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon("/api/analytics", new Blob([body], { type: "application/json" }));
      return;
    }
    fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Analytics should never block the primary UX.
  }
}

function getSvgPathTarget(e: Event): SVGPathElement | null {
  const t = e.target;
  if (!(t instanceof SVGPathElement)) return null;
  const href = t.getAttribute("data-href");
  if (!href) return null;
  return t;
}

export default function UsMapInteractions({
  tipId,
  pageType,
  sport,
  defaultTip,
}: {
  tipId: string;
  pageType: "heatmap" | "homepage";
  sport: string;
  defaultTip: string;
}) {
  useEffect(() => {
    const tip = document.getElementById(tipId);
    if (!tip) return;

    // Prefer the nearest SVG to avoid accidentally binding to unrelated maps on the page.
    const svg = tip.parentElement?.querySelector("svg") ?? document.querySelector("svg");
    if (!(svg instanceof SVGSVGElement)) return;

    tip.textContent = defaultTip;
    send("map_viewed", { page_type: pageType, sport });

    const onMove = (e: MouseEvent) => {
      const t = getSvgPathTarget(e);
      if (!t) return;
      const abbr = t.getAttribute("data-abbr") || "";
      const count = Number(t.getAttribute("data-count") || "0");
      tip.textContent = `${abbr} — ${count.toLocaleString()} upcoming tournaments`;
    };

    const onLeave = () => {
      tip.textContent = defaultTip;
    };

    const onClick = (e: MouseEvent) => {
      const t = getSvgPathTarget(e);
      if (!t) return;
      const href = t.getAttribute("data-href");
      const abbr = t.getAttribute("data-abbr") || "";
      if (!href) return;
      send("map_state_clicked", { page_type: pageType, sport, state: abbr, href });
      window.location.href = href;
    };

    svg.addEventListener("mousemove", onMove);
    svg.addEventListener("mouseleave", onLeave);
    svg.addEventListener("click", onClick);

    return () => {
      svg.removeEventListener("mousemove", onMove);
      svg.removeEventListener("mouseleave", onLeave);
      svg.removeEventListener("click", onClick);
    };
  }, [defaultTip, pageType, sport, tipId]);

  return null;
}

