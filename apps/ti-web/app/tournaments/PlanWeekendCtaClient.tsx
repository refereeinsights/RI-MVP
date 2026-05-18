"use client";

import Link from "next/link";

import { trackTiEvent } from "@/lib/tiAnalyticsClient";

export default function PlanWeekendCtaClient(props: {
  href: string;
  className?: string;
  tournamentId: string;
  tournamentSlug: string;
  sport?: string | null;
  state?: string | null;
}) {
  return (
    <Link
      href={props.href}
      className={props.className}
      onClick={() => {
        trackTiEvent("tournament_card_plan_weekend_clicked", {
          page_type: "tournaments_index",
          tournament_id: props.tournamentId,
          tournament_slug: props.tournamentSlug,
          source_page: "tournaments_index",
          cta: "plan_weekend",
          href: props.href,
          sport: props.sport ?? null,
          state: props.state ?? null,
        });
      }}
    >
      Plan weekend
    </Link>
  );
}

