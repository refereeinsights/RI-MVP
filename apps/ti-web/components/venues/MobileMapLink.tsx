"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

type Provider = "google" | "apple" | "waze";

type Props = {
  provider: Provider;
  query: string;
  fallbackHref: string;
  className?: string;
  children: ReactNode;
};

function isMobileUserAgent() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod|android/i.test(navigator.userAgent);
}

function isIosUserAgent() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function buildAppHref(provider: Provider, query: string) {
  const encoded = encodeURIComponent(query);
  if (provider === "apple") return `maps://?q=${encoded}`;
  if (provider === "google") {
    return isIosUserAgent() ? `comgooglemaps://?q=${encoded}` : `geo:0,0?q=${encoded}`;
  }
  return `waze://?q=${encoded}&navigate=yes`;
}

function launchWithFallback(appHref: string, fallbackHref: string) {
  let didHide = false;
  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") didHide = true;
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.setTimeout(() => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    if (!didHide) window.location.assign(fallbackHref);
  }, 900);
  window.location.assign(appHref);
}

export default function MobileMapLink({ provider, query, fallbackHref, className, children }: Props) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(isMobileUserAgent());
  }, []);

  const appHref = useMemo(() => buildAppHref(provider, query), [provider, query]);

  return (
    <a
      href={fallbackHref}
      target={isMobile ? undefined : "_blank"}
      rel="noopener noreferrer"
      className={className}
      onClick={(event) => {
        if (!isMobile) return;
        event.preventDefault();
        launchWithFallback(appHref, fallbackHref);
      }}
    >
      {children}
    </a>
  );
}
