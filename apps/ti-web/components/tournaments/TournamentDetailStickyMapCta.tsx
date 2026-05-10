"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { sendTiAnalytics } from "@/lib/analytics";

type Props = {
  mapHref: string;
  mapLabel: string;
  hotelsHref?: string | null;
};

const MOBILE_MAX_WIDTH_PX = 720;

export default function TournamentDetailStickyMapCta({ mapHref, mapLabel, hotelsHref }: Props) {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);

  const isMobile = useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`).matches;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    const teaser = document.getElementById("tournament-map-teaser");
    const footer = document.querySelector("footer.ti-legal-footer");
    if (!teaser) return;

    let teaserInView = true;
    let footerInView = false;

    const update = () => setEnabled(!teaserInView && !footerInView);

    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.target === teaser) teaserInView = e.isIntersecting;
          if (footer && e.target === footer) footerInView = e.isIntersecting;
        }
        update();
      },
      { threshold: 0.01 }
    );

    obs.observe(teaser);
    if (footer) obs.observe(footer);
    update();

    return () => {
      try {
        obs.disconnect();
      } catch {
        // ignore
      }
    };
  }, [isMobile]);

  if (!isMobile || !enabled) return null;

  return (
    <div className="tournamentStickyCta" role="region" aria-label="Quick actions">
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

