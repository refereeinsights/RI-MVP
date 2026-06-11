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
  pageType: "heatmap" | "homepage" | "directory" | "sport_directory" | "state_hub" | "metro_hub" | "venue_directory";
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
    const tapMoveThresholdPx = 10;
    let touchStartPoint: { x: number; y: number } | null = null;

    const onMove = (e: MouseEvent) => {
      const t = getSvgPathTarget(e);
      if (!t) return;
      const abbr = t.getAttribute("data-abbr") || "";
      const count = Number(t.getAttribute("data-count") || "0");
      if (pageType === "venue_directory") {
        tip.textContent = `${abbr} — ${count.toLocaleString()} venues`;
        return;
      }
      tip.textContent = `${abbr} — ${count.toLocaleString()} upcoming tournaments`;
    };

    const onLeave = () => {
      tip.textContent = defaultTip;
    };

    const activateState = (e: Event) => {
      const t = getSvgPathTarget(e);
      if (!t) return;
      const href = t.getAttribute("data-href");
      const abbr = t.getAttribute("data-abbr") || "";
      if (!href) return;
      send("map_state_clicked", { page_type: pageType, sport, state: abbr, href });
      window.location.href = href;
    };

    const onClick = (e: MouseEvent) => {
      activateState(e);
    };

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.changedTouches[0] ?? e.touches[0];
      if (!touch) {
        touchStartPoint = null;
        return;
      }
      touchStartPoint = {
        x: touch.clientX,
        y: touch.clientY,
      };
    };

    const onTouchEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0];
      const startPoint = touchStartPoint;
      touchStartPoint = null;
      if (!touch || !startPoint) return;

      const movedX = Math.abs(touch.clientX - startPoint.x);
      const movedY = Math.abs(touch.clientY - startPoint.y);
      if (movedX > tapMoveThresholdPx || movedY > tapMoveThresholdPx) return;

      e.preventDefault();
      activateState(e);
    };

    const onTouchCancel = () => {
      touchStartPoint = null;
    };

    svg.addEventListener("mousemove", onMove);
    svg.addEventListener("mouseleave", onLeave);
    svg.addEventListener("click", onClick);
    svg.addEventListener("touchstart", onTouchStart);
    svg.addEventListener("touchend", onTouchEnd, { passive: false });
    svg.addEventListener("touchcancel", onTouchCancel);

    return () => {
      svg.removeEventListener("mousemove", onMove);
      svg.removeEventListener("mouseleave", onLeave);
      svg.removeEventListener("click", onClick);
      svg.removeEventListener("touchstart", onTouchStart);
      svg.removeEventListener("touchend", onTouchEnd);
      svg.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [defaultTip, pageType, sport, tipId]);

  return null;
}
