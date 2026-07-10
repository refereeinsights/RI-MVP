"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { sendTiAnalytics } from "@/lib/analytics";

type Props = {
  mapHref: string;
  mapLabel: string;
  hotelsHref?: string | null;
  offsetForSignup?: boolean;
};

const MOBILE_MAX_WIDTH_PX = 720;
const MOBILE_QUERY = `(max-width: ${MOBILE_MAX_WIDTH_PX}px)`;
const TEASER_PASSED_OFFSET_PX = 8;
const FOOTER_HIDE_BUFFER_PX = 24;

export default function TournamentDetailStickyMapCta({
  mapHref,
  mapLabel,
  hotelsHref,
  offsetForSignup = false,
}: Props) {
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    const mediaQuery = window.matchMedia(MOBILE_QUERY);
    const updateIsMobile = () => setIsMobile(mediaQuery.matches);

    updateIsMobile();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateIsMobile);
      return () => mediaQuery.removeEventListener("change", updateIsMobile);
    }

    mediaQuery.addListener(updateIsMobile);
    return () => mediaQuery.removeListener(updateIsMobile);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isMobile) {
      setEnabled(false);
      return;
    }

    const teaser = document.getElementById("tournament-map-teaser");
    const footer = document.querySelector("footer.ti-legal-footer");
    if (!teaser) {
      setEnabled(false);
      return;
    }

    let frameId = 0;

    const evaluateVisibility = () => {
      const teaserRect = teaser.getBoundingClientRect();
      const footerRect = footer?.getBoundingClientRect();
      const teaserPassed = teaserRect.bottom <= TEASER_PASSED_OFFSET_PX;
      const footerInWay = footerRect ? footerRect.top <= window.innerHeight - FOOTER_HIDE_BUFFER_PX : false;
      setEnabled(teaserPassed && !footerInWay);
    };

    const queueVisibilityCheck = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        evaluateVisibility();
      });
    };

    evaluateVisibility();
    window.addEventListener("scroll", queueVisibilityCheck, { passive: true });
    window.addEventListener("resize", queueVisibilityCheck);
    window.addEventListener("orientationchange", queueVisibilityCheck);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      window.removeEventListener("scroll", queueVisibilityCheck);
      window.removeEventListener("resize", queueVisibilityCheck);
      window.removeEventListener("orientationchange", queueVisibilityCheck);
    };
  }, [isMobile]);

  if (!isMobile || !enabled) return null;

  return (
    <div
      className={`tournamentStickyCta${offsetForSignup ? " tournamentStickyCta--withSignupOffset" : ""}`}
      role="region"
      aria-label="Quick actions"
    >
      <div className="tournamentStickyCta__inner">
        <Link
          className="tournamentStickyCta__primary"
          href={mapHref}
          onClick={() => {
            void sendTiAnalytics("tournament_map_cta_clicked", {
              source_context: "tournament_detail:mobile_sticky",
              cta_label: mapLabel,
              href: mapHref,
              from_path: pathname ?? undefined,
              ts: Date.now(),
            });
          }}
        >
          {mapLabel}
        </Link>
        {hotelsHref ? (
          <Link
            className="tournamentStickyCta__secondary"
            href={hotelsHref}
            target="_blank"
            rel="noopener noreferrer sponsored"
          >
            Hotels
          </Link>
        ) : null}
      </div>
    </div>
  );
}
