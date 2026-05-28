"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";
import type { CSSProperties } from "react";

type Props = {
  href: string;
  className?: string;
  ariaLabel?: string;
  style?: CSSProperties;
  children: ReactNode;
  event:
    | {
        name: "venue_details_plan_map_click";
        properties: { venue_id: string; venue_name: string; tournament_slug?: string | null; source: "venue_details" };
      }
    | {
        name: "venue_directory_plan_map_click";
        properties: {
          venue_id: string;
          venue_name: string;
          tournament_slug: string;
          city?: string | null;
          state?: string | null;
          sport?: string | null;
          source: "venue_directory";
          position?: number | null;
        };
      };
};

export default function VenuePlanningMapLinkClient({ href, className, ariaLabel, style, children, event }: Props) {
  return (
    <Link
      href={href}
      className={className}
      aria-label={ariaLabel}
      style={style}
      onClick={() => {
        void trackTiEvent(event.name as any, event.properties as any);
      }}
    >
      {children}
    </Link>
  );
}
