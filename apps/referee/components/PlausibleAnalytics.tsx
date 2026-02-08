"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { init, track } from "@plausible-analytics/tracker";

const EXCLUDED_PREFIXES = ["/admin"];

export default function PlausibleAnalytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;
    if (EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return;

    if (typeof window !== "undefined" && !(window as any).__plausible_init) {
      init({ domain: "refereeinsights.com", autoCapturePageviews: false });
      (window as any).__plausible_init = true;
    }

    const query = searchParams?.toString();
    const url = query ? `${pathname}?${query}` : pathname;
    track("pageview", { url });
  }, [pathname, searchParams]);

  return null;
}
