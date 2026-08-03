"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { captureRiEvent } from "@/lib/riAnalytics";

type BaseProps = {
  eventName: string;
  sourcePageType: "directory" | "sport_hub";
  tournamentId: string;
  tournamentSlug: string;
  sport?: string | null;
  state?: string | null;
  city?: string | null;
  children: ReactNode;
};

type InternalLinkProps = BaseProps &
  Omit<ComponentProps<typeof Link>, "href" | "children"> & {
    href: string;
  };

type ExternalLinkProps = BaseProps &
  Omit<ComponentProps<"a">, "href" | "children"> & {
    href: string;
  };

async function capture(eventName: string, props: BaseProps) {
  await captureRiEvent(eventName, {
    pageType: props.sourcePageType === "sport_hub" ? "sport_hub" : "tournament_directory",
    properties: {
      source_page_type: props.sourcePageType,
      tournament_id: props.tournamentId,
      tournament_slug: props.tournamentSlug,
      sport: props.sport ?? null,
      state: props.state ?? null,
      city: props.city ?? null,
    },
  });
}

function handleClick(eventName: string, props: BaseProps, onClick?: (event: MouseEvent<any>) => void) {
  return (event: MouseEvent<any>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    void capture(eventName, props);
  };
}

export function RiTournamentInternalLink({
  eventName,
  sourcePageType,
  tournamentId,
  tournamentSlug,
  sport,
  state,
  city,
  onClick,
  children,
  ...rest
}: InternalLinkProps) {
  const analyticsProps = { eventName, sourcePageType, tournamentId, tournamentSlug, sport, state, city, children };

  return (
    <Link {...rest} onClick={handleClick(eventName, analyticsProps, onClick)}>
      {children}
    </Link>
  );
}

export function RiTournamentExternalLink({
  eventName,
  sourcePageType,
  tournamentId,
  tournamentSlug,
  sport,
  state,
  city,
  onClick,
  children,
  ...rest
}: ExternalLinkProps) {
  const analyticsProps = { eventName, sourcePageType, tournamentId, tournamentSlug, sport, state, city, children };

  return (
    <a {...rest} onClick={handleClick(eventName, analyticsProps, onClick)}>
      {children}
    </a>
  );
}
