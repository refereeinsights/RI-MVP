"use client";

import Link from "next/link";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";

type MonthLink = { value: string; label: string; href: string };

export default function MoreTournamentsInStateLinks({
  tournamentSlug,
  stateCode,
  sport,
  title,
  upcomingHref,
  monthLinks,
}: {
  tournamentSlug: string;
  stateCode: string;
  sport: string;
  title: string;
  upcomingHref: string;
  monthLinks: MonthLink[];
}) {
  const st = (stateCode ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(st)) return null;

  const safeSport = (sport ?? "").trim().toLowerCase() || "unknown";

  const track = (args: { href: string; linkKind: "upcoming" | "month"; month: string | null }) => {
    trackTiEvent("tournament_detail_more_in_state_clicked", {
      page_type: "tournament_detail",
      tournament_slug: tournamentSlug,
      sport: safeSport,
      state: st,
      href: args.href,
      link_kind: args.linkKind,
      month: args.month,
    });
  };

  return (
    <div className="detailCard">
      <div className="detailCard__title">{title}</div>
      <div className="detailCard__body">
        <div className="detailLinksRow">
          <Link className="secondaryLink" href={upcomingHref} onClick={() => track({ href: upcomingHref, linkKind: "upcoming", month: null })}>
            View upcoming
          </Link>
        </div>
        <div className="detailLinksRow">
          {monthLinks.map((m) => (
            <Link
              key={m.value}
              className="secondaryLink detailLinkSmall"
              href={m.href}
              onClick={() => track({ href: m.href, linkKind: "month", month: m.value })}
            >
              {m.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

