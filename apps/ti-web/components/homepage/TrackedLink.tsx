"use client";

import * as React from "react";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";

type Props = React.PropsWithChildren<{
  href: string;
  className?: string;
  event:
    | { name: "homepage_cta_clicked"; properties: { cta: "explore_map" | "browse_tournaments" | "open_map_from_preview" } }
    | { name: "homepage_sport_chip_clicked"; properties: { sport: string } };
}>;

export default function TrackedLink({ href, className, event, children }: Props) {
  return (
    <a
      href={href}
      className={className}
      onClick={() => {
        void trackTiEvent(event.name as any, event.properties as any);
      }}
    >
      {children}
    </a>
  );
}

