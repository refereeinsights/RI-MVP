"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { captureRiEvent, type RiPageType } from "@/lib/riAnalytics";

type InternalProps = Omit<ComponentProps<typeof Link>, "href" | "children"> & {
  href: string;
  eventName: string;
  pageType: RiPageType;
  properties?: Record<string, unknown>;
  children: ReactNode;
};

type ExternalProps = Omit<ComponentProps<"a">, "href" | "children"> & {
  href: string;
  eventName: string;
  pageType: RiPageType;
  properties?: Record<string, unknown>;
  children: ReactNode;
};

function buildHandler(
  eventName: string,
  pageType: RiPageType,
  properties?: Record<string, unknown>,
  onClick?: (event: MouseEvent<any>) => void
) {
  return (event: MouseEvent<any>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    void captureRiEvent(eventName, { pageType, properties });
  };
}

export function RiTrackedInternalLink({ href, eventName, pageType, properties, onClick, children, ...rest }: InternalProps) {
  return (
    <Link href={href} {...rest} onClick={buildHandler(eventName, pageType, properties, onClick)}>
      {children}
    </Link>
  );
}

export function RiTrackedExternalLink({ href, eventName, pageType, properties, onClick, children, ...rest }: ExternalProps) {
  return (
    <a href={href} {...rest} onClick={buildHandler(eventName, pageType, properties, onClick)}>
      {children}
    </a>
  );
}
