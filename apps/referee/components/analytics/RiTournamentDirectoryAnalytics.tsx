"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { captureRiEvent } from "@/lib/riAnalytics";

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
    const key = JSON.stringify(payload);
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;

    let cancelled = false;

    async function run() {
      if (cancelled) return;
      const pageType = sourcePageType === "sport_hub" ? "sport_hub" : "tournament_directory";
      await captureRiEvent("ri_tournament_directory_viewed", {
        pageType,
        pagePath: payload.path,
        properties: payload,
      });

      if (
        payload.has_search_query ||
        payload.has_month_filter ||
        payload.has_state_filter ||
        payload.reviewed_only ||
        payload.include_past ||
        payload.page > 1
      ) {
        await captureRiEvent("ri_tournament_filter_applied", {
          pageType,
          pagePath: payload.path,
          properties: payload,
        });
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [payload, sourcePageType]);

  return null;
}
