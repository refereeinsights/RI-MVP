"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const EXCLUDED_PREFIXES = ["/admin"];

export default function PlausibleAnalytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;
    if (EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return;

    let canceled = false;

    async function run() {
      const { init, track } = await import("@plausible-analytics/tracker");
      if (canceled) return;
      if (typeof window !== "undefined" && !(window as any).__plausible_init) {
        init({ domain: "refereeinsights.com", autoCapturePageviews: false });
        (window as any).__plausible_init = true;
      }
      const query = searchParams?.toString();
      const url = query ? `${pathname}?${query}` : pathname;
      track("pageview", { url });
    }

    run();
    return () => {
      canceled = true;
    };
  }, [pathname, searchParams]);

  return null;
}
