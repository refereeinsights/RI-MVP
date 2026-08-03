"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type Props = {
  sourcePageType: "directory" | "sport_hub";
  sport?: string | null;
  resultCount: number;
};

export default function RiTournamentDirectoryAnalytics({ sourcePageType, sport, resultCount }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastKeyRef = useRef<string | null>(null);

  const payload = useMemo(() => {
    const query = searchParams?.toString() ?? "";
    const page = Number(searchParams?.get("page") ?? "1") || 1;
    const stateCount = searchParams?.getAll("state").filter(Boolean).length ?? 0;

    return {
      source_page_type: sourcePageType,
      sport: sport ?? null,
      path: pathname ?? "",
      query,
      page,
      result_count: resultCount,
      has_search_query: Boolean(searchParams?.get("q")),
      has_month_filter: Boolean(searchParams?.get("month")),
      has_state_filter: stateCount > 0,
      state_filter_count: stateCount,
      reviewed_only: (searchParams?.get("reviewed") ?? "").toLowerCase() === "true" || searchParams?.get("reviewed") === "1",
      include_past: (searchParams?.get("includePast") ?? "").toLowerCase() === "true" || searchParams?.get("past") === "1",
    };
  }, [pathname, resultCount, searchParams, sourcePageType, sport]);

  useEffect(() => {
    if (typeof window === "undefined" || process.env.NODE_ENV !== "production") return;

    const key = JSON.stringify(payload);
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;

    let cancelled = false;

    async function run() {
      const posthog = (await import("posthog-js")).default;
      if (cancelled) return;

      posthog.capture("ri_tournament_directory_viewed", payload);

      if (
        payload.has_search_query ||
        payload.has_month_filter ||
        payload.has_state_filter ||
        payload.reviewed_only ||
        payload.include_past ||
        payload.page > 1
      ) {
        posthog.capture("ri_tournament_directory_filters_applied", payload);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [payload]);

  return null;
}

