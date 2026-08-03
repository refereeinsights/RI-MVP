"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, KeyboardEvent, MouseEvent, ReactNode } from "react";
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

type ClickableCardProps = BaseProps &
  Omit<ComponentProps<"article">, "children"> & {
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

function shouldIgnoreCardClick(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("a,button,input,select,textarea,summary,[role='button'],[data-card-ignore-click='true']"));
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

export function RiTournamentClickableCard({
  href,
  eventName,
  sourcePageType,
  tournamentId,
  tournamentSlug,
  sport,
  state,
  city,
  onClick,
  onKeyDown,
  children,
  ...rest
}: ClickableCardProps) {
  const router = useRouter();
  const analyticsProps = { eventName, sourcePageType, tournamentId, tournamentSlug, sport, state, city, children };

  const navigate = () => {
    void capture(eventName, analyticsProps);
    router.push(href);
  };

  const handleCardClick = (event: MouseEvent<HTMLElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (shouldIgnoreCardClick(event.target)) return;
    navigate();
  };

  const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (shouldIgnoreCardClick(event.target)) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    navigate();
  };

  return (
    <article
      {...rest}
      role="link"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
    >
      {children}
    </article>
  );
}
